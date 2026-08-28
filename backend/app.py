import hashlib
import hmac
import os
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request

load_dotenv()

app = Flask(__name__)
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
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
    return jsonify({"ok": True, "event": saved[0] if saved else occurrence}), 201


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")
