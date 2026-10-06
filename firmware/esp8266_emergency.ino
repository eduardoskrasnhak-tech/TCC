// =====================================================
// FIRMWARE DO WEMOS D1 / ESP8266
// =====================================================
// Lê o botão, recebe a posição do GPS e envia a emergência
// para a API Flask usando Wi-Fi.

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <TinyGPSPlus.h>
#include <SoftwareSerial.h>

const char* WIFI_SSID = "COLE_SUA_REDE";
const char* WIFI_PASSWORD = "COLE_SUA_SENHA";
const char* API_URL = "https://tcc-9vom.onrender.com/alerta";

const uint8_t BUTTON_PIN = D5;
const uint8_t GPS_RX_PIN = D6;
const uint8_t GPS_TX_PIN = D7;
TinyGPSPlus gps;
SoftwareSerial gpsSerial(GPS_RX_PIN, GPS_TX_PIN);

// =====================================================
// INICIALIZAÇÃO E LOOP PRINCIPAL
// =====================================================
void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

void loop() {
  while (gpsSerial.available()) gps.encode(gpsSerial.read());
  if (digitalRead(BUTTON_PIN) == LOW) {
    enviarEmergencia();
    delay(3000);
  }
}

// =====================================================
// MONTAGEM E ENVIO DO EVENTO
// =====================================================
void enviarEmergencia() {
  if (WiFi.status() != WL_CONNECTED || !gps.location.isValid()) return;
  BearSSL::WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, API_URL)) return;
  http.addHeader("Content-Type", "application/json");
  String payload = "{\"status\":\"SOS\",\"latitude\":" + String(gps.location.lat(), 6) + ",\"longitude\":" + String(gps.location.lng(), 6) + "}";
  int resposta = http.POST(payload);
  Serial.printf("Resposta do Flask: %d\n", resposta);
  http.end();
}
