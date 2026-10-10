/*
 * PROTEGE - ESP8266 - HTTPS COM VALIDACAO TLS
 * Arduino ESP8266 core 3.x / Generic ESP8266 Module
 * ATmega328P <-> ESP8266 via UART fisica, 115200 baud
 *
 * Entrada:  SOS,latitude,longitude\n
 * Saidas:   WIFI,rssi\n | HTTP,codigo\n | ERRO,motivo\n
 * Nao usa GPS, SIM900, LCD ou coordenadas de teste.
 * Usa NTP antes do HTTPS. SEM setInsecure().
 *
 * IMPORTANTE: dois certificados-raiz amplamente usados pelo
 * Render sao embarcados; se a cadeia TLS mudar para outra
 * CA, a conexao sera recusada ate atualizar os certificados.
 */
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <time.h>
#include <math.h>
#include <stdlib.h>

const char* WIFI_SSID = "COLE_SUA_REDE_2G4";
const char* WIFI_SENHA = "COLE_SUA_SENHA";
const char* API_URL = "https://tcc-9vom.onrender.com/alerta";

// Raizes X.509 publicas (NAO sao chaves privadas).
// Fonte: Mozilla CA bundle, distribuido pelo pacote certifi.
static const char TRUSTED_ROOTS[] PROGMEM = R"CERTS(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIFVzCCAz+gAwIBAgINAgPlk28xsBNJiGuiFzANBgkqhkiG9w0BAQwFADBHMQsw
CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU
MBIGA1UEAxMLR1RTIFJvb3QgUjEwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAw
MDAwWjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZp
Y2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjEwggIiMA0GCSqGSIb3DQEBAQUA
A4ICDwAwggIKAoICAQC2EQKLHuOhd5s73L+UPreVp0A8of2C+X0yBoJx9vaMf/vo
27xqLpeXo4xL+Sv2sfnOhB2x+cWX3u+58qPpvBKJXqeqUqv4IyfLpLGcY9vXmX7w
Cl7raKb0xlpHDU0QM+NOsROjyBhsS+z8CZDfnWQpJSMHobTSPS5g4M/SCYe7zUjw
TcLCeoiKu7rPWRnWr4+wB7CeMfGCwcDfLqZtbBkOtdh+JhpFAz2weaSUKK0Pfybl
qAj+lug8aJRT7oM6iCsVlgmy4HqMLnXWnOunVmSPlk9orj2XwoSPwLxAwAtcvfaH
szVsrBhQf4TgTM2S0yDpM7xSma8ytSmzJSq0SPly4cpk9+aCEI3oncKKiPo4Zor8
Y/kB+Xj9e1x3+naH+uzfsQ55lVe0vSbv1gHR6xYKu44LtcXFilWr06zqkUspzBmk
MiVOKvFlRNACzqrOSbTqn3yDsEB750Orp2yjj32JgfpMpf/VjsPOS+C12LOORc92
wO1AK/1TD7Cn1TsNsYqiA94xrcx36m97PtbfkSIS5r762DL8EGMUUXLeXdYWk70p
aDPvOmbsB4om3xPXV2V4J95eSRQAogB/mqghtqmxlbCluQ0WEdrHbEg8QOB+DVrN
VjzRlwW5y0vtOUucxD/SVRNuJLDWcfr0wbrM7Rv1/oFB2ACYPTrIrnqYNxgFlQID
AQABo0IwQDAOBgNVHQ8BAf8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4E
FgQU5K8rJnEaK0gnhS9SZizv8IkTcT4wDQYJKoZIhvcNAQEMBQADggIBAJ+qQibb
C5u+/x6Wki4+omVKapi6Ist9wTrYggoGxval3sBOh2Z5ofmmWJyq+bXmYOfg6LEe
QkEzCzc9zolwFcq1JKjPa7XSQCGYzyI0zzvFIoTgxQ6KfF2I5DUkzps+GlQebtuy
h6f88/qBVRRiClmpIgUxPoLW7ttXNLwzldMXG+gnoot7TiYaelpkttGsN/H9oPM4
7HLwEXWdyzRSjeZ2axfG34arJ45JK3VmgRAhpuo+9K4l/3wV3s6MJT/KYnAK9y8J
ZgfIPxz88NtFMN9iiMG1D53Dn0reWVlHxYciNuaCp+0KueIHoI17eko8cdLiA6Ef
MgfdG+RCzgwARWGAtQsgWSl4vflVy2PFPEz0tv/bal8xa5meLMFrUKTX5hgUvYU/
Z6tGn6D/Qqc6f1zLXbBwHSs09dR2CQzreExZBfMzQsNhFRAbd03OIozUhfJFfbdT
6u9AWpQKXCBfTkBdYiJ23//OYb2MI3jSNwLgjt7RETeJ9r/tSQdirpLsQBqvFAnZ
0E6yove+7u7Y/9waLd64NnHi/Hm3lCXRSHNboTXns5lndcEZOitHTtNCjv0xyBZm
2tIMPNuzjsmhDYAPexZ3FL//2wmUspO8IFgV6dtxQ/PeEMMA3KgqlbbC1j+Qa3bb
bP6MvPJwNQzcmRk13NfIRmPVNnGuV/u3gm3c
-----END CERTIFICATE-----

)CERTS";

const unsigned long WIFI_STATUS_INTERVAL_MS = 5000UL;
const unsigned long WIFI_RECONNECT_INTERVAL_MS = 10000UL;
const unsigned long HTTP_TIMEOUT_MS = 60000UL;
const unsigned long NTP_TIMEOUT_MS = 15000UL;
const size_t MAX_LINE = 96;

char rxBuffer[MAX_LINE];
size_t rxLength = 0;
bool descartandoLinha = false;
unsigned long lastWifiReport = 0;
unsigned long lastReconnect = 0;
bool wifiReportPending = true;

bool relogioValido() {
  // 2025-01-01 em UTC; valor minimo plausivel para cert TLS.
  return time(nullptr) >= 1735689600;
}

bool esperarHorarioNTP() {
  if (relogioValido()) return true;
  if (WiFi.status() != WL_CONNECTED) return false;
  configTime(0, 0, "pool.ntp.org", "time.google.com", "time.nist.gov");
  unsigned long t0 = millis();
  while (!relogioValido() && millis() - t0 < NTP_TIMEOUT_MS) {
    delay(250);
  }
  return relogioValido();
}

void manterWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastReconnect >= WIFI_RECONNECT_INTERVAL_MS) {
    lastReconnect = millis();
    WiFi.reconnect();
  }
}

void informarRSSI() {
  if (!wifiReportPending && millis() - lastWifiReport < WIFI_STATUS_INTERVAL_MS) return;
  wifiReportPending = false;
  lastWifiReport = millis();
  Serial.print(F("WIFI,"));
  Serial.println(WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : -127);
}

bool parseDoubleEstrito(const String& s, double& result) {
  if (s.isEmpty()) return false;
  char* endPtr = nullptr;
  result = strtod(s.c_str(), &endPtr);
  return endPtr != s.c_str() && *endPtr == '\0' && isfinite(result);
}

void enviarSOS(double lat, double lon) {
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    Serial.println(F("ERRO,COORDENADAS"));
    return;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("ERRO,WIFI"));
    return;
  }
  // Certificados validos precisam de data/hora confiavel.
  if (!esperarHorarioNTP()) {
    Serial.println(F("ERRO,NTP"));
    return;  // Sem fallback inseguro.
  }

  // Ancoras precisam continuar vivas durante a conexao TLS.
  BearSSL::X509List trustAnchors(TRUSTED_ROOTS);
  BearSSL::WiFiClientSecure client;
  client.setTrustAnchors(&trustAnchors);
  client.setTimeout(HTTP_TIMEOUT_MS);

  HTTPClient http;
  if (!http.begin(client, API_URL)) {
    Serial.println(F("ERRO,HTTPS_INIT"));
    return;
  }
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader(F("Content-Type"), F("application/json"));
  http.addHeader(F("Accept"), F("application/json"));

  String json;
  json.reserve(86);
  json = F("{\"status\":\"SOS\",\"latitude\":");
  json += String(lat, 6);
  json += F(",\"longitude\":");
  json += String(lon, 6);
  json += '}';

  // POST unico. Sem repeticao automatica (evita duplicidade).
  int code = http.POST(json);
  Serial.print(F("HTTP,"));
  Serial.println(code);
  if (code < 0) {
    // O codigo negativo nao diferencia sozinho erro de TLS,
    // TCP, DNS ou timeout. Diagnostico adicional:
    char err[160] = {0};
    client.getLastSSLError(err, sizeof(err));
    // NAO imprimir strings livres no protocolo serial.
    // ERRO,TRANSPORTE significa verificar log do lado servidor
    // e isolar certificado/rede se necessario.
    Serial.println(F("ERRO,TRANSPORTE_OU_TLS"));
  }
  http.end();
  client.stop();
}

void processarLinha(String line) {
  line.trim();
  if (!line.startsWith(F("SOS,"))) return;
  int comma2 = line.indexOf(',', 4);
  if (comma2 < 0 || line.indexOf(',', comma2 + 1) >= 0) {
    Serial.println(F("ERRO,FORMATO"));
    return;
  }
  String la = line.substring(4, comma2);
  String lo = line.substring(comma2 + 1);
  la.trim(); lo.trim();
  double lat, lon;
  if (!parseDoubleEstrito(la, lat) || !parseDoubleEstrito(lo, lon)) {
    Serial.println(F("ERRO,COORDENADAS"));
    return;
  }
  enviarSOS(lat, lon);
}

void receberUART() {
  while (Serial.available() > 0) {
    char c = static_cast<char>(Serial.read());
    if (c == '\r') continue;
    if (c == '\n') {
      if (!descartandoLinha && rxLength) {
        rxBuffer[rxLength] = '\0';
        processarLinha(String(rxBuffer));
      }
      rxLength = 0;
      descartandoLinha = false;
      continue;
    }
    if (descartandoLinha) continue;
    if (rxLength >= MAX_LINE - 1) {
      rxLength = 0;
      descartandoLinha = true;
      Serial.println(F("ERRO,LINHA_LONGA"));
      continue;
    }
    rxBuffer[rxLength++] = c;
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);
  lastReconnect = millis();
  // NTP sem bloqueio; sincronizacao validada no momento do POST.
  configTime(0, 0, "pool.ntp.org", "time.google.com", "time.nist.gov");
}

void loop() {
  manterWiFi();
  informarRSSI();
  receberUART();
  yield();
}


