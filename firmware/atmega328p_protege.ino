/*
  PROTEGE â€” ATmega328P / UNO R3 WiFi + ESP8266
  VERSAO INICIAL DE INTEGRACAO (AINDA NAO VALIDADA NO PROTOTIPO)

  D2     Botao SOS entre D2 e GND (INPUT_PULLUP)
  D3 RX  GPS TX; D4 TX GPS RX (TX do ATmega nao e necessario)
  D7 RX  SIM900 TX; D8 TX -> SIM900 RX (usar adaptacao de nivel adequada)
  A4/A5  LCD I2C 16x2, endereco normalmente 0x27
  D0/D1  UART interna da placa entre ATmega328P e ESP8266

  ESP -> ATmega: WIFI,-67 / WIFI,-127 / HTTP,201 / ERRO,WIFI
  ATmega -> ESP: SOS,latitude,longitude

  ATENCAO: O ESP8266 deve estar com o firmware de integracao e a
  configuracao de chaves DIP de comunicacao interna. Nao conecte o
  monitor serial/USB em modo de programacao do ATmega nessa configuracao.

  Bibliotecas: TinyGPSPlus, SoftwareSerial, Wire, LiquidCrystal_I2C.
  SMS: contatos substituiveis, mas placeholders NAO recebem SMS.
*/

#include <Arduino.h>
#include <Wire.h>
#include <SoftwareSerial.h>
#include <TinyGPSPlus.h>
#include <LiquidCrystal_I2C.h>
#include <string.h>
#include <stdlib.h>

const uint8_t PIN_BOTAO = 2;
const uint8_t PIN_GPS_RX = 3;
const uint8_t PIN_GPS_TX = 4;
const uint8_t PIN_GSM_RX = 7;
const uint8_t PIN_GSM_TX = 8;
const uint32_t BAUD_ESP = 115200;
const uint32_t BAUD_GPS = 9600;
const uint32_t BAUD_GSM = 9600;

const uint8_t LCD_ENDERECO = 0x27; // Alternativa comum: 0x3F
LiquidCrystal_I2C lcd(LCD_ENDERECO, 16, 2);
SoftwareSerial gpsSerial(PIN_GPS_RX, PIN_GPS_TX);
SoftwareSerial gsmSerial(PIN_GSM_RX, PIN_GSM_TX);
TinyGPSPlus gps;

// Preencha com numeros reais no formato +55DDDNÃšMERO.
// Nunca envie para contatos desconhecidos nem teste com numeros de terceiros.
const char* CONTATOS[3] = {
  "+55DDDNUMERO1",
  "+55DDDNUMERO2",
  "+55DDDNUMERO3"
};

const unsigned long JANELA_ESCALONAMENTO_MS = 300000UL; // 5 minutos
const unsigned long ANTIRRUIDO_MS = 50UL;
const unsigned long GPS_IDADE_MAX_MS = 10000UL;
const unsigned long LCD_INTERVALO_MS = 500UL;
const unsigned long GSM_INTERVALO_MS = 20000UL;

uint8_t nivelSOS = 0;
unsigned long ultimoAcionamento = 0;
unsigned long ultimaTela = 0;
unsigned long ultimaConsultaGSM = 0;
unsigned long ultimaMudancaBotao = 0;
bool ultimaLeituraBotao = HIGH;
bool botaoEstavel = HIGH;
int sinalWiFiDbm = -127;
int sinalGSMCSQ = 99;
bool gsmRegistrado = false;
bool sosPendente = false;
char estado[17] = "GPS: AGUARDANDO";

char linhaESP[100];
uint8_t indiceESP = 0;

void definirEstado(const char* texto) {
  strncpy(estado, texto, 16);
  estado[16] = '\0';
}

// Caracteres personalizados: 4 alturas para simular barras de sinal.
byte barra1[8] = {0,0,0,0,0,0,0b11111,0b11111};
byte barra2[8] = {0,0,0,0,0b11111,0b11111,0b11111,0b11111};
byte barra3[8] = {0,0,0b11111,0b11111,0b11111,0b11111,0b11111,0b11111};
byte barra4[8] = {0b11111,0b11111,0b11111,0b11111,0b11111,0b11111,0b11111,0b11111};

uint8_t nivelWiFi(int rssi) {
  if (rssi <= -100) return 0; // inclui -127 (desconectado)
  if (rssi >= -55) return 4;
  if (rssi >= -67) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

uint8_t nivelGSM(int csq) {
  if (!gsmRegistrado || csq == 99 || csq <= 4 || csq > 31) return 0;
  if (csq <= 9) return 1;
  if (csq <= 14) return 2;
  if (csq <= 19) return 3;
  return 4;
}

void desenharBarras(uint8_t nivel) {
  for (uint8_t i = 1; i <= 4; i++) {
    if (i <= nivel) lcd.write((uint8_t)(i - 1));
    else lcd.print(' ');
  }
}

void atualizarLCD() {
  if (millis() - ultimaTela < LCD_INTERVALO_MS) return;
  ultimaTela = millis();

  lcd.setCursor(0,0);
  lcd.print("W:");
  desenharBarras(nivelWiFi(sinalWiFiDbm));
  lcd.print(" G:");
  desenharBarras(nivelGSM(sinalGSMCSQ));
  lcd.print("   ");

  lcd.setCursor(0,1);
  char linha[17];
  snprintf(linha, sizeof(linha), "%-16.16s", estado);
  lcd.print(linha);
}

void processarMensagemESP(const char* msg) {
  if (strncmp(msg, "WIFI,", 5) == 0) {
    sinalWiFiDbm = atoi(msg + 5);
  } else if (strncmp(msg, "HTTP,", 5) == 0) {
    int codigo = atoi(msg + 5);
    if (codigo >= 200 && codigo <= 299) definirEstado("WEB: ENVIADO");
    else definirEstado("WEB: ERRO HTTP");
  } else if (strncmp(msg, "ERRO,", 5) == 0) {
    definirEstado("WEB: ERRO");
  }
}

void lerESP() {
  // Recebe somente linhas do protocolo; outros textos sao ignorados.
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (indiceESP > 0) {
        linhaESP[indiceESP] = '\0';
        processarMensagemESP(linhaESP);
        indiceESP = 0;
      }
    } else if (indiceESP < sizeof(linhaESP) - 1) {
      linhaESP[indiceESP++] = c;
    } else {
      indiceESP = 0;
    }
  }
}

void lerGPS() {
  // SoftwareSerial so escuta uma UART por vez.
  gpsSerial.listen();
  while (gpsSerial.available()) gps.encode(gpsSerial.read());
  if (gps.location.isValid() && gps.location.age() < GPS_IDADE_MAX_MS &&
      !sosPendente && strcmp(estado, "GPS: AGUARDANDO") == 0) {
    definirEstado("GPS: FIX OK");
  }
}

// Aguarda resposta do SIM900 e procura marcador. Bloqueante (somente integracao inicial).
String lerRespostaGSM(unsigned long timeoutMs) {
  String resposta;
  unsigned long inicio = millis();
  while (millis() - inicio < timeoutMs) {
    lerESP(); // evita encher o buffer UART do ESP
    while (gsmSerial.available()) {
      char c = gsmSerial.read();
      if (resposta.length() < 240) resposta += c;
    }
    if (resposta.indexOf("\r\nOK\r\n") >= 0 ||
        resposta.indexOf("ERROR") >= 0 ||
        resposta.indexOf('>') >= 0) break;
    delay(5);
  }
  return resposta;
}

String comandoGSM(const char* comando, unsigned long timeoutMs = 2500) {
  gsmSerial.listen();
  while (gsmSerial.available()) gsmSerial.read();
  gsmSerial.println(comando);
  String resp = lerRespostaGSM(timeoutMs);
  gpsSerial.listen();
  return resp;
}

bool analisarRegistro(const String& resp) {
  // +CREG: <n>,<stat>; 1 = registrado local; 5 = roaming.
  int inicio = resp.indexOf("+CREG:");
  if (inicio < 0) return false;
  int virgula = resp.indexOf(',', inicio);
  if (virgula < 0) return false;
  int codigo = resp.substring(virgula + 1).toInt();
  return codigo == 1 || codigo == 5;
}

void atualizarGSM() {
  if (millis() - ultimaConsultaGSM < GSM_INTERVALO_MS) return;
  ultimaConsultaGSM = millis();
  String reg = comandoGSM("AT+CREG?");
  gsmRegistrado = analisarRegistro(reg);
  String csq = comandoGSM("AT+CSQ");
  int pos = csq.indexOf("+CSQ:");
  sinalGSMCSQ = pos >= 0 ? csq.substring(pos + 5).toInt() : 99;
}

bool numeroConfigurado(const char* numero) {
  if (numero[0] != '+') return false;
  uint8_t n = strlen(numero);
  if (n < 12 || n > 14) return false;
  for (uint8_t i = 1; i < n; i++) {
    if (numero[i] < '0' || numero[i] > '9') return false;
  }
  return true;
}

bool enviarSMS(const char* numero, double lat, double lon) {
  if (!numeroConfigurado(numero)) return false;
  gsmSerial.listen();
  while (gsmSerial.available()) gsmSerial.read();

  gsmSerial.println("AT+CMGF=1");
  String resp = lerRespostaGSM(2500);
  if (resp.indexOf("OK") < 0) { gpsSerial.listen(); return false; }

  gsmSerial.print("AT+CMGS=\"");
  gsmSerial.print(numero);
  gsmSerial.println("\"");
  resp = lerRespostaGSM(4000);
  if (resp.indexOf('>') < 0) { gpsSerial.listen(); return false; }

  gsmSerial.println("PROTEGE - ALERTA SOS!");
  gsmSerial.println("O usuario precisa de ajuda.");
  gsmSerial.print("Localizacao: https://maps.google.com/?q=");
  gsmSerial.print(lat, 6);
  gsmSerial.print(',');
  gsmSerial.println(lon, 6);
  gsmSerial.write((uint8_t)26); // Ctrl+Z
  // SIM900 pode demorar diversos segundos para confirmar.
  resp = lerRespostaGSM(30000);
  bool confirmado = (resp.indexOf("+CMGS:") >= 0 &&
                     resp.indexOf("OK") >= 0);
  gpsSerial.listen();
  return confirmado;
}

void executarSOSComGPSReal() {
  if (!gps.location.isValid() || gps.location.age() >= GPS_IDADE_MAX_MS) return;
  // Copia coordenadas ANTES de interromper temporariamente a escuta do GPS.
  double latitude = gps.location.lat();
  double longitude = gps.location.lng();
  sosPendente = false;

  definirEstado("SOS: ENVIANDO");
  atualizarLCD();

  // O ESP so recebe coordenadas obtidas realmente pelo ATmega via GPS.
  Serial.print("SOS,");
  Serial.print(latitude, 6);
  Serial.print(',');
  Serial.println(longitude, 6);

  // Atualiza GSM antes de iniciar a sequencia de SMS.
  String reg = comandoGSM("AT+CREG?");
  gsmRegistrado = analisarRegistro(reg);
  if (!gsmRegistrado) {
    definirEstado("SMS: SEM TORRE");
    return; // Wi-Fi foi solicitado independentemente do SMS.
  }

  uint8_t enviados = 0;
  uint8_t tentados = 0;
  for (uint8_t i = 0; i < nivelSOS && i < 3; i++) {
    if (numeroConfigurado(CONTATOS[i])) {
      tentados++;
      if (enviarSMS(CONTATOS[i], latitude, longitude)) enviados++;
    }
  }
  if (tentados == 0) definirEstado("SMS: CONFIGURE");
  else if (enviados == tentados) definirEstado("SMS: ENVIADO");
  else definirEstado("SMS: FALHOU");
}

void tratarBotao() {
  bool leitura = digitalRead(PIN_BOTAO);
  if (leitura != ultimaLeituraBotao) ultimaMudancaBotao = millis();
  ultimaLeituraBotao = leitura;
  if (millis() - ultimaMudancaBotao < ANTIRRUIDO_MS) return;
  if (leitura == botaoEstavel) return;
  botaoEstavel = leitura;
  if (botaoEstavel != LOW) return;

  unsigned long agora = millis();
  if (nivelSOS == 0 || agora - ultimoAcionamento > JANELA_ESCALONAMENTO_MS) {
    nivelSOS = 1;
  } else if (nivelSOS < 3) {
    nivelSOS++;
  }
  ultimoAcionamento = agora;
  sosPendente = true;
  definirEstado("GPS: AGUARDANDO");
}

void setup() {
  pinMode(PIN_BOTAO, INPUT_PULLUP);
  Serial.begin(BAUD_ESP); // Exclusivamente comunicacao com ESP8266.
  gpsSerial.begin(BAUD_GPS);
  gsmSerial.begin(BAUD_GSM);
  gpsSerial.listen();

  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.createChar(0, barra1);
  lcd.createChar(1, barra2);
  lcd.createChar(2, barra3);
  lcd.createChar(3, barra4);
  lcd.clear();
  lcd.setCursor(0,0);
  lcd.print("PROTEGE INICIANDO");
  delay(1000);
  definirEstado("GPS: AGUARDANDO");
  atualizarLCD();
}

void loop() {
  lerESP();
  lerGPS();
  tratarBotao();
  if (sosPendente) executarSOSComGPSReal();
  atualizarGSM();
  atualizarLCD();
}


