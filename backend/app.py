import hashlib
import hmac
import os
import smtplib
from email.message import EmailMessage
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://127.0.0.1:5500", "http://localhost:5500"]}})
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
API_PREFIX = "/api/v1"


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


def error(message, status=400):
    return jsonify({"ok": False, "error": message}), status


def send_family_notifications(occurrence):
    familiares = supabase_request("GET", "familiares", params={"idoso_id": f"eq.{occurrence['idoso_id']}", "select": "nome,email,telefone,prioridade", "order": "prioridade.asc"})
    mapa = f"https://www.google.com/maps?q={occurrence['latitude']},{occurrence['longitude']}"
    assunto = "🚨 P.R.O.T.E.G.E. — Solicitação de emergência" if occurrence.get("event_type") == "emergency" else "P.R.O.T.E.G.E. — Solicitação de assistência"
    corpo = f"O idoso precisa de ajuda.\n\nStatus: {occurrence['status']}\nDestinatários: {occurrence.get('destinatarios', 'Familiares')}\nData/hora: {occurrence['occurred_at']}\nLocalização: {mapa}\n"
    canais = {canal.strip().lower() for canal in os.getenv("NOTIFICATION_CHANNELS", "email").split(",")}
    resultado = {"email": 0, "whatsapp": 0, "sms": 0, "skipped": []}
    smtp_host = os.getenv("SMTP_HOST")
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    if "email" in canais and all((smtp_host, smtp_user, smtp_password)):
        destinatarios_email = [f for f in familiares if f.get("email")]
        with smtplib.SMTP(smtp_host, int(os.getenv("SMTP_PORT", "587")), timeout=15) as smtp:
            smtp.starttls(); smtp.login(smtp_user, smtp_password)
            for familiar in destinatarios_email:
                mensagem = EmailMessage(); mensagem["Subject"] = assunto; mensagem["From"] = os.getenv("NOTIFICATION_FROM", smtp_user); mensagem["To"] = familiar["email"]; mensagem.set_content(f"Olá, {familiar['nome']}.\n\n{corpo}")
                smtp.send_message(mensagem); resultado["email"] += 1
    elif "email" in canais:
        resultado["skipped"].append("SMTP não configurado")
    for canal in ("whatsapp", "sms"):
        if canal in canais:
            for familiar in familiares:
                if familiar.get("telefone") and send_twilio_message(familiar["telefone"], f"Olá, {familiar['nome']}.\n\n{corpo}", canal): resultado[canal] += 1
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


def authenticated_user():
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer ") or not SUPABASE_ANON_KEY:
        return None
    response = requests.get(f"{SUPABASE_URL}/auth/v1/user", headers={"apikey": SUPABASE_ANON_KEY, "Authorization": authorization}, timeout=10)
    return response.json() if response.ok else None


def save_user_event(payload, user_id):
    ids = supabase_request("GET", "idosos", params={"usuario_id": f"eq.{user_id}", "select": "id"})
    if not ids:
        raise RuntimeError("Nenhum idoso vinculado ao usuário")
    occurrence = dict(payload); occurrence["idoso_id"] = ids[0]["id"]; occurrence["source"] = "site"
    saved = supabase_request("POST", "acionamentos", json=occurrence, headers={"Prefer": "return=representation"})
    return saved[0] if saved else occurrence


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "protege-device-api"})


@app.post(f"{API_PREFIX}/device/events")
def receive_device_event():
    device_token = request.headers.get("X-Device-Token", "")
    payload = request.get_json(silent=True) or {}
    required = ("device_id", "latitude", "longitude", "occurred_at", "event_type", "status")
    missing = [field for field in required if field not in payload]
    if missing:
        return error(f"Campos obrigatórios ausentes: {', '.join(missing)}")
    if not device_token:
        return error("Token do dispositivo ausente", 401)
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
    except (TypeError, ValueError):
        return error("Coordenadas ou data/hora inválidas")

    try:
        devices = supabase_request("GET", "dispositivos", params={"device_id": f"eq.{payload['device_id']}", "ativo": "eq.true", "select": "device_id,idoso_id,token_hash"})
    except RuntimeError as exc:
        return error(str(exc), 500)
    if not devices or not devices[0].get("idoso_id") or not hmac.compare_digest(devices[0].get("token_hash", ""), token_hash(device_token)):
        return error("Dispositivo não autorizado", 401)

    status_map = {"received": "Recebido", "in_service": "Em atendimento", "resolved": "Resolvido", "emergency": "Emergência"}
    status = status_map.get(str(payload["status"]).lower(), "Recebido")
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
    except RuntimeError as exc:
        return error(str(exc), 500)
    try:
        notification = send_family_notifications(occurrence)
    except (OSError, smtplib.SMTPException, RuntimeError) as exc:
        notification = {"sent": 0, "skipped": f"Falha no envio: {exc}"}
    return jsonify({"ok": True, "event": saved[0] if saved else occurrence, "notification": notification}), 201


@app.post(f"{API_PREFIX}/user/events")
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
            notification = send_family_notifications(occurrence)
        except (OSError, smtplib.SMTPException, RuntimeError) as exc:
            notification = {"sent": 0, "skipped": f"Falha no envio: {exc}"}
        return jsonify({"ok": True, "event": occurrence, "notification": notification}), 201
    except RuntimeError as exc:
        return error(str(exc), 500)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")
