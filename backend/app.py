"""Servidor local do primeiro teste do P.R.O.T.E.G.E.

Recebe a localização real enviada pelo ESP8266 e mantém somente o último
alerta em memória. Não há banco de dados, coordenadas fixas ou localização
de exemplo neste estágio.
"""

import math
from threading import Lock

from flask import Flask, jsonify, request


app = Flask(__name__)


@app.after_request
def permitir_frontend_local(response):
    """Permite que o painel local consulte esta API durante o desenvolvimento."""
    origem = request.headers.get("Origin")
    origens_permitidas = {
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://192.168.3.3:5500",
        "https://eduardoskrasnhak-tech.github.io",
    }
    if origem in origens_permitidas:
        response.headers["Access-Control-Allow-Origin"] = origem
        response.headers["Vary"] = "Origin"
    return response

# O último alerta fica somente na memória enquanto o servidor estiver ligado.
ultimo_alerta = None
alerta_lock = Lock()


def resposta_erro(mensagem, status=400):
    """Retorna erros de entrada em um formato JSON simples."""
    return jsonify({"erro": mensagem}), status


def obter_coordenadas(payload):
    """Converte e valida coordenadas recebidas do GPS do dispositivo."""
    if "latitude" not in payload or "longitude" not in payload:
        raise ValueError("latitude e longitude são obrigatórias")

    latitude_recebida = payload["latitude"]
    longitude_recebida = payload["longitude"]
    if (
        isinstance(latitude_recebida, bool)
        or isinstance(longitude_recebida, bool)
        or not isinstance(latitude_recebida, (int, float))
        or not isinstance(longitude_recebida, (int, float))
    ):
        raise ValueError("latitude e longitude devem ser números no JSON")

    latitude = float(latitude_recebida)
    longitude = float(longitude_recebida)

    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise ValueError("latitude e longitude devem ser números válidos")
    if not -90 <= latitude <= 90:
        raise ValueError("latitude deve estar entre -90 e 90")
    if not -180 <= longitude <= 180:
        raise ValueError("longitude deve estar entre -180 e 180")

    return latitude, longitude


@app.get("/")
def inicio():
    """Confirma que a API está funcionando."""
    return "API PROTEGE funcionando"


@app.post("/alerta")
def receber_alerta():
    """Recebe um SOS com as coordenadas reais informadas pelo ESP8266."""
    global ultimo_alerta

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return resposta_erro("envie um JSON com status, latitude e longitude")
    if payload.get("status") != "SOS":
        return resposta_erro('o campo status deve ser "SOS"')

    try:
        latitude, longitude = obter_coordenadas(payload)
    except ValueError as exc:
        return resposta_erro(str(exc))

    alerta = {
        "status": "SOS",
        "latitude": latitude,
        "longitude": longitude,
    }
    link_google_maps = f"https://maps.google.com/?q={latitude},{longitude}"

    with alerta_lock:
        ultimo_alerta = alerta

    print("ALERTA PROTEGE RECEBIDO", flush=True)
    print("Status: SOS", flush=True)
    print(f"Latitude: {latitude}", flush=True)
    print(f"Longitude: {longitude}", flush=True)
    print(f"Google Maps: {link_google_maps}", flush=True)

    return jsonify(alerta), 201


@app.get("/ultimo-alerta")
def consultar_ultimo_alerta():
    """Retorna o último alerta recebido, ou informa que ainda não há alerta."""
    with alerta_lock:
        if ultimo_alerta is None:
            return jsonify({"mensagem": "Nenhum alerta recebido ainda"}), 404
        return jsonify(ultimo_alerta)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
