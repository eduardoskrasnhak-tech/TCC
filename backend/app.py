# ============================================================
# API DO P.R.O.T.E.G.E. — servidor Flask
# ============================================================
# Recebe eventos, valida os dados, grava no Supabase e envia
# notificações pelos canais configurados.

import hashlib
import hmac
import os
import re
import smtplib
from collections import defaultdict, deque
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone
from functools import wraps
from threading import Lock
from time import monotonic

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.middleware.proxy_fix import ProxyFix

# ============================================================
# CONFIGURAÇÃO DA APLICAÇÃO
# ============================================================
load_dotenv()

app = Flask(__name__)
DEFAULT_CORS_ORIGINS = "http://127.0.0.1:5500,http://localhost:5500"
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",") if origin.strip()]
if "*" in CORS_ORIGINS:
    raise RuntimeError("CORS_ORIGINS não pode usar curinga; informe as origens autorizadas.")
CORS(app, resources={r"/api/*": {
    "origins": CORS_ORIGINS,
    "methods": ["GET", "POST", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization", "X-Device-Token", "X-Worker-Token"],
    "max_age": 600,
}})
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_REQUEST_BODY_BYTES", "16384"))
FORCE_HTTPS = os.getenv("FORCE_HTTPS", "false").lower() == "true"
if os.getenv("TRUST_PROXY_HEADERS", "false").lower() == "true":
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
API_PREFIX = "/api/v1"
_rate_limit_buckets = defaultdict(deque)
_rate_limit_lock = Lock()


@app.before_request
def require_https_in_production():
    """Recusa HTTP quando a implantação estiver configurada para exigir TLS."""
    if FORCE_HTTPS and not request.is_secure:
        return error("HTTPS obrigatório.", 400)


@app.after_request
def add_security_headers(response):
    """Cabeçalhos seguros para as respostas da API (a interface web é hospedada separadamente)."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), payment=()"
    response.headers["Cache-Control"] = "no-store"
    if FORCE_HTTPS:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# ============================================================
# UTILITÁRIOS E NOTIFICAÇÕES
# ============================================================
def supabase_request(method, table, **kwargs):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env")
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    headers.update(kwargs.pop("headers", {}))
    response = requests.request(method, f"{SUPABASE_URL}/rest/v1/{table}", headers=headers, timeout=10, **kwargs)
    if not response.ok:
        raise RuntimeError(f"Supabase respondeu {response.status_code}: {response.text}")
    return response.json() if response.content else None


def token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def enqueue_notification(occurrence, familiar, channel):
    """Registra o envio para permitir reprocessamento posterior.

    A fila é opcional durante a implantação; se a tabela ainda não existir,
    o envio imediato continua funcionando.
    """
    if not occurrence.get("id") or not familiar.get("id"):
        return False
    try:
        supabase_request("POST", "fila_notificacoes", json={
            "acionamento_id": occurrence["id"],
            "familiar_id": familiar["id"],
            "canal": channel,
            "destino": familiar.get("email") if channel == "email" else familiar.get("telefone", ""),
        })
        return True
    except RuntimeError:
        return False


def error(message, status=400):
    return jsonify({"ok": False, "error": message}), status


@app.errorhandler(RequestEntityTooLarge)
def request_too_large(_error):
    return error("A requisição excede o tamanho permitido.", 413)


def rate_limited(max_requests, window_seconds):
    """Limite simples por IP e rota. Em produção, mantenha também o limite do proxy/rede."""
    def decorator(handler):
        @wraps(handler)
        def wrapped(*args, **kwargs):
            client = request.remote_addr or "unknown"
            key = f"{request.endpoint}:{client}"
            now = monotonic()
            with _rate_limit_lock:
                bucket = _rate_limit_buckets[key]
                while bucket and now - bucket[0] >= window_seconds:
                    bucket.popleft()
                if len(bucket) >= max_requests:
                    return error("Muitas tentativas. Aguarde um instante e tente novamente.", 429)
                bucket.append(now)
            return handler(*args, **kwargs)
        return wrapped
    return decorator


def send_family_notifications(occurrence):
    familiares = supabase_request("GET", "familiares", params={"idoso_id": f"eq.{occurrence['idoso_id']}", "select": "id,nome,email,telefone,prioridade", "order": "prioridade.asc"})
    mapa = f"https://www.google.com/maps?q={occurrence['latitude']},{occurrence['longitude']}"
    assunto = "🚨 P.R.O.T.E.G.E. — Solicitação de emergência" if occurrence.get("event_type") == "emergency" else "P.R.O.T.E.G.E. — Solicitação de assistência"
    corpo = f"O idoso precisa de ajuda.\n\nStatus: {occurrence['status']}\nDestinatários: {occurrence.get('destinatarios', 'Familiares')}\nData/hora: {occurrence['occurred_at']}\nLocalização: {mapa}\n"
    canais = {canal.strip().lower() for canal in os.getenv("NOTIFICATION_CHANNELS", "email").split(",")}
    resultado = {"email": 0, "whatsapp": 0, "sms": 0, "queued": 0, "skipped": []}
    smtp_host = os.getenv("SMTP_HOST")
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    if "email" in canais and all((smtp_host, smtp_user, smtp_password)):
        destinatarios_email = [f for f in familiares if f.get("email")]
        with smtplib.SMTP(smtp_host, int(os.getenv("SMTP_PORT", "587")), timeout=15) as smtp:
            smtp.starttls(); smtp.login(smtp_user, smtp_password)
            for familiar in destinatarios_email:
                if enqueue_notification(occurrence, familiar, "email"): resultado["queued"] += 1
                mensagem = EmailMessage(); mensagem["Subject"] = assunto; mensagem["From"] = os.getenv("NOTIFICATION_FROM", smtp_user); mensagem["To"] = familiar["email"]; mensagem.set_content(f"Olá, {familiar['nome']}.\n\n{corpo}")
                smtp.send_message(mensagem); resultado["email"] += 1
    elif "email" in canais:
        resultado["skipped"].append("SMTP não configurado")
    for canal in ("whatsapp", "sms"):
        if canal in canais:
            for familiar in familiares:
                if familiar.get("telefone"):
                    if enqueue_notification(occurrence, familiar, canal): resultado["queued"] += 1
                    if send_twilio_message(familiar["telefone"], f"Olá, {familiar['nome']}.\n\n{corpo}", canal): resultado[canal] += 1
            if resultado[canal] == 0: resultado["skipped"].append(f"{canal} sem Twilio configurado ou telefone válido")
    resultado["total"] = resultado["email"] + resultado["whatsapp"] + resultado["sms"]
    return resultado


def send_twilio_message(phone, body, channel):
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    sender = os.getenv("TWILIO_WHATSAPP_FROM" if channel == "whatsapp" else "TWILIO_SMS_FROM")
    if not all((sid, auth_token, sender)):
        return False
    digits = "".join(character for character in str(phone) if character.isdigit())
    if len(digits) in (10, 11): digits = "55" + digits
    if len(digits) < 12: return False
    recipient = f"{channel}:+{digits}" if channel == "whatsapp" else f"+{digits}"
    response = requests.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", data={"To": recipient, "From": sender, "Body": body}, auth=(sid, auth_token), timeout=15)
    return response.ok


def create_queue_item(occurrence, familiar, channel):
    """Cria um item de fila e retorna seu UUID quando a migração já existe."""
    if not occurrence.get("id"):
        return None
    destination = familiar.get("email") if channel == "email" else familiar.get("telefone")
    if not destination:
        return None
    try:
        rows = supabase_request("POST", "fila_notificacoes", json={
            "acionamento_id": occurrence["id"], "familiar_id": familiar.get("id"),
            "canal": channel, "destino": destination, "status": "pendente"
        }, headers={"Prefer": "return=representation"})
        return rows[0]["id"] if rows else None
    except RuntimeError:
        return None


def update_queue_item(notification_id, **values):
    if not notification_id:
        return
    try:
        supabase_request("PATCH", "fila_notificacoes", params={"id": f"eq.{notification_id}"}, json=values)
    except RuntimeError:
        pass


def notification_text(occurrence):
    location = "Localização não disponível"
    if occurrence.get("latitude") is not None and occurrence.get("longitude") is not None:
        location = f"https://www.google.com/maps?q={occurrence['latitude']},{occurrence['longitude']}"
    subject = "P.R.O.T.E.G.E. — Emergência" if occurrence.get("event_type") == "emergency" else "P.R.O.T.E.G.E. — Solicitação de assistência"
    body = ("Há uma solicitação de ajuda registrada.\n\n"
            f"Status: {occurrence.get('status', 'Recebido')}\n"
            f"Data/hora: {occurrence.get('occurred_at') or occurrence.get('criado_em')}\n"
            f"Localização: {location}\n")
    return subject, body


def deliver_notification(channel, destination, name, subject, body):
    """Envia somente um canal e informa sucesso ou motivo de falha."""
    if channel == "email":
        smtp_host, smtp_user, smtp_password = os.getenv("SMTP_HOST"), os.getenv("SMTP_USER"), os.getenv("SMTP_PASSWORD")
        if not all((smtp_host, smtp_user, smtp_password)):
            return False, "SMTP não configurado"
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = os.getenv("NOTIFICATION_FROM", smtp_user)
        message["To"] = destination
        message.set_content(f"Olá, {name or 'contato'}.\n\n{body}")
        try:
            with smtplib.SMTP(smtp_host, int(os.getenv("SMTP_PORT", "587")), timeout=15) as smtp:
                smtp.starttls()
                smtp.login(smtp_user, smtp_password)
                smtp.send_message(message)
            return True, None
        except (OSError, smtplib.SMTPException) as exc:
            return False, str(exc)
    if channel in ("sms", "whatsapp"):
        if send_twilio_message(destination, f"Olá, {name or 'contato'}.\n\n{body}", channel):
            return True, None
        return False, "Twilio não configurado ou envio recusado"
    return False, "Canal inválido"


def dispatch_notifications(occurrence):
    """Envia e registra cada notificação individualmente na fila."""
    familiares = supabase_request("GET", "familiares", params={"idoso_id": f"eq.{occurrence['idoso_id']}", "select": "id,nome,email,telefone,prioridade", "order": "prioridade.asc"})
    channels = {item.strip().lower() for item in os.getenv("NOTIFICATION_CHANNELS", "email").split(",")}
    subject, body = notification_text(occurrence)
    result = {"email": 0, "sms": 0, "whatsapp": 0, "failed": 0, "skipped": []}
    for familiar in familiares:
        for channel in channels.intersection({"email", "sms", "whatsapp"}):
            destination = familiar.get("email") if channel == "email" else familiar.get("telefone")
            if not destination:
                result["skipped"].append(f"{channel}: contato sem destino")
                continue
            notification_id = create_queue_item(occurrence, familiar, channel)
            update_queue_item(notification_id, status="enviando", tentativas=1, erro=None)
            sent, reason = deliver_notification(channel, destination, familiar.get("nome"), subject, body)
            if sent:
                update_queue_item(notification_id, status="enviado", enviado_em=datetime.now(timezone.utc).isoformat(), erro=None)
                result[channel] += 1
            else:
                update_queue_item(notification_id, status="falhou", erro=reason)
                result["failed"] += 1
    result["total"] = result["email"] + result["sms"] + result["whatsapp"]
    return result


def reprocess_notification_queue(limit=50, max_attempts=3):
    """Reenvia itens pendentes/falhos. Pode ser chamado por agendador seguro."""
    rows = supabase_request("GET", "fila_notificacoes", params={
        "status": "in.(pendente,falhou)", "select": "id,canal,destino,tentativas,familiares(nome),acionamentos(status,event_type,occurred_at,criado_em,latitude,longitude)",
        "order": "criado_em.asc", "limit": str(limit)
    })
    processed = {"processed": 0, "sent": 0, "failed": 0, "ignored": 0}
    for item in rows or []:
        attempts = int(item.get("tentativas") or 0)
        if attempts >= max_attempts:
            processed["ignored"] += 1
            continue
        occurrence = item.get("acionamentos") or {}
        familiar = item.get("familiares") or {}
        if isinstance(occurrence, list): occurrence = occurrence[0] if occurrence else {}
        if isinstance(familiar, list): familiar = familiar[0] if familiar else {}
        subject, body = notification_text(occurrence)
        update_queue_item(item["id"], status="enviando", tentativas=attempts + 1, erro=None)
        sent, reason = deliver_notification(item["canal"], item["destino"], familiar.get("nome"), subject, body)
        processed["processed"] += 1
        if sent:
            update_queue_item(item["id"], status="enviado", enviado_em=datetime.now(timezone.utc).isoformat(), erro=None)
            processed["sent"] += 1
        else:
            update_queue_item(item["id"], status="falhou", erro=reason)
            processed["failed"] += 1
    return processed


def authenticated_user():
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer ") or not SUPABASE_ANON_KEY:
        return None
    try:
        response = requests.get(f"{SUPABASE_URL}/auth/v1/user", headers={"apikey": SUPABASE_ANON_KEY, "Authorization": authorization}, timeout=10)
        return response.json() if response.ok else None
    except requests.RequestException:
        return None


def worker_authorized():
    expected = os.getenv("NOTIFICATION_WORKER_TOKEN", "")
    received = request.headers.get("X-Worker-Token", "")
    return bool(expected and received and hmac.compare_digest(expected, received))


def save_user_event(payload, user_id):
    ids = supabase_request("GET", "idosos", params={"usuario_id": f"eq.{user_id}", "select": "id"})
    if not ids:
        raise RuntimeError("Nenhum idoso vinculado ao usuário")
    try:
        latitude = float(payload["latitude"])
        longitude = float(payload["longitude"])
        occurred_at = datetime.fromisoformat(str(payload["occurred_at"]).replace("Z", "+00:00"))
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Coordenadas ou data/hora inválidas") from exc
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError("Coordenadas inválidas")
    if occurred_at.tzinfo is None:
        occurred_at = occurred_at.replace(tzinfo=timezone.utc)
    agora = datetime.now(timezone.utc)
    idade_maxima = int(os.getenv("MAX_EVENT_AGE_SECONDS", "86400"))
    if occurred_at > agora + timedelta(seconds=120) or (agora - occurred_at).total_seconds() > idade_maxima:
        raise ValueError("Data/hora do chamado fora do intervalo permitido")
    event_type = str(payload.get("event_type", ""))
    status = str(payload.get("status", ""))
    destinatarios = str(payload.get("destinatarios", "")).strip()
    escalonamentos_permitidos = {
        ("assistance", "Recebido", "Familiar 1"),
        ("assistance", "Recebido", "Familiar 1 + Familiar 2"),
        ("emergency", "Emergência", "Familiar 1 + Familiar 2 + Emergência"),
    }
    if (event_type, status, destinatarios) not in escalonamentos_permitidos:
        raise ValueError("Tipo ou status de chamado inválido")
    if not destinatarios or len(destinatarios) > 300:
        raise ValueError("Destinatários inválidos")
    occurrence = {
        "idoso_id": ids[0]["id"], "latitude": latitude, "longitude": longitude,
        "occurred_at": occurred_at.astimezone(timezone.utc).isoformat(), "event_type": event_type,
        "status": status, "destinatarios": destinatarios, "source": "site"
    }
    saved = supabase_request("POST", "acionamentos", json=occurrence, headers={"Prefer": "return=representation"})
    return saved[0] if saved else occurrence


# ============================================================
# ROTAS HTTP DA API
# ============================================================
@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "protege-device-api"})


@app.post(f"{API_PREFIX}/notifications/process")
@rate_limited(10, 60)
def process_notifications():
    """Endpoint exclusivo para agendador/servidor, nunca para o navegador."""
    if not worker_authorized():
        return error("Não autorizado", 401)
    payload = request.get_json(silent=True) or {}
    try:
        limit = min(max(int(payload.get("limit", 50)), 1), 100)
    except (TypeError, ValueError):
        return error("O limite deve ser um número inteiro")
    try:
        return jsonify({"ok": True, "result": reprocess_notification_queue(limit=limit)})
    except RuntimeError:
        return error("Não foi possível processar a fila de notificações.", 500)


@app.post(f"{API_PREFIX}/device/events")
@rate_limited(60, 60)
def receive_device_event():
    device_token = request.headers.get("X-Device-Token", "")
    payload = request.get_json(silent=True) or {}
    required = ("device_id", "latitude", "longitude", "occurred_at", "event_type", "status")
    missing = [field for field in required if field not in payload]
    if missing:
        return error(f"Campos obrigatórios ausentes: {', '.join(missing)}")
    if not device_token:
        return error("Token do dispositivo ausente", 401)
    if not re.fullmatch(r"[A-Za-z0-9._-]{3,64}", str(payload["device_id"])):
        return error("ID do dispositivo inválido")
    if payload["event_type"] != "emergency":
        return error("event_type deve ser emergency")
    try:
        latitude = float(payload["latitude"])
        longitude = float(payload["longitude"])
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            return error("Coordenadas inválidas")
        occurred_at = datetime.fromisoformat(str(payload["occurred_at"]).replace("Z", "+00:00"))
        if occurred_at.tzinfo is None:
            occurred_at = occurred_at.replace(tzinfo=timezone.utc)
        agora = datetime.now(timezone.utc)
        idade_maxima = int(os.getenv("MAX_EVENT_AGE_SECONDS", "86400"))
        if occurred_at > agora + timedelta(seconds=120) or (agora - occurred_at).total_seconds() > idade_maxima:
            return error("Data/hora do evento fora do intervalo permitido")
    except (TypeError, ValueError):
        return error("Coordenadas ou data/hora inválidas")

    try:
        devices = supabase_request("GET", "dispositivos", params={"device_id": f"eq.{payload['device_id']}", "ativo": "eq.true", "select": "device_id,idoso_id,token_hash"})
    except RuntimeError:
        return error("Não foi possível validar o dispositivo no momento.", 500)
    if not devices or not devices[0].get("idoso_id") or not hmac.compare_digest(devices[0].get("token_hash", ""), token_hash(device_token)):
        return error("Dispositivo não autorizado", 401)

    status_map = {"received": "Recebido", "in_service": "Em atendimento", "resolved": "Resolvido", "emergency": "Emergência"}
    status = status_map.get(str(payload["status"]).lower())
    if not status:
        return error("Status do dispositivo inválido")
    occurrence = {
        "idoso_id": devices[0]["idoso_id"],
        "device_id": payload["device_id"],
        "latitude": latitude,
        "longitude": longitude,
        "occurred_at": occurred_at.astimezone(timezone.utc).isoformat(),
        "event_type": "emergency",
        "status": status,
        "destinatarios": "Familiar 1",
        "source": "device",
    }
    try:
        saved = supabase_request("POST", "acionamentos", json=occurrence, headers={"Prefer": "return=representation"})
    except RuntimeError:
        return error("Não foi possível registrar o evento no momento.", 500)
    saved_occurrence = saved[0] if saved else occurrence
    try:
        notification = dispatch_notifications(saved_occurrence)
    except (OSError, smtplib.SMTPException, RuntimeError):
        notification = {"sent": 0, "skipped": "Falha temporária no envio de notificações"}
    return jsonify({"ok": True, "event": saved_occurrence, "notification": notification}), 201


@app.post(f"{API_PREFIX}/user/events")
@rate_limited(20, 60)
def receive_user_event():
    user = authenticated_user()
    if not user:
        return error("Usuário não autenticado", 401)
    payload = request.get_json(silent=True) or {}
    required = ("latitude", "longitude", "occurred_at", "event_type", "status", "destinatarios")
    if any(field not in payload for field in required):
        return error("Dados do chamado incompletos")
    try:
        occurrence = save_user_event(payload, user["id"])
        try:
            notification = dispatch_notifications(occurrence)
        except (OSError, smtplib.SMTPException, RuntimeError):
            notification = {"sent": 0, "skipped": "Falha temporária no envio de notificações"}
        return jsonify({"ok": True, "event": occurrence, "notification": notification}), 201
    except ValueError as exc:
        return error(str(exc))
    except RuntimeError:
        return error("Não foi possível registrar o chamado no momento.", 500)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")
