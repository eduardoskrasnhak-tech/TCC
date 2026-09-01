# API do dispositivo P.R.O.T.E.G.E.

## Instalação

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Preencha `SUPABASE_SERVICE_ROLE_KEY` no `.env`. Essa chave nunca deve ir para o frontend ou para o ESP8266.

## Executar

```powershell
python app.py
```

Teste de saúde: `GET http://localhost:5000/api/health`.

O endpoint do dispositivo é `POST /api/v1/device/events` e exige o header `X-Device-Token`.

## Cadastrar um dispositivo

1. Gere um token longo para o dispositivo e seu SHA-256.
2. No Supabase, associe o `device_id` ao UUID da pessoa idosa na tabela `dispositivos`.
3. Configure o mesmo token no firmware, mas salve apenas o hash no banco.

Exemplo de requisição:

```bash
curl -X POST http://localhost:5000/api/v1/device/events \
  -H "Content-Type: application/json" \
  -H "X-Device-Token: um-token-longo" \
  -d '{"device_id":"protege-001","latitude":-23.55052,"longitude":-46.63330,"occurred_at":"2026-08-28T15:30:00Z","event_type":"emergency","status":"received"}'
```

O Flask converte o status recebido para o mesmo padrão usado pelos painéis e grava em `acionamentos` com `source = device`.

## Notificações

O envio é configurado por `NOTIFICATION_CHANNELS=email,whatsapp` ou `email,sms`. O e-mail usa SMTP. WhatsApp e SMS usam a API do Twilio; para WhatsApp em testes, o número do familiar precisa estar autorizado no Sandbox do WhatsApp do Twilio. Os telefones devem ser cadastrados com DDD; o backend assume Brasil (`+55`) quando o código do país não for informado.

## Fila e reenvio

Depois de executar `js-supabase/supabase-operacao.sql`, cada envio passa a ser registrado como `enviado` ou `falhou`. Para reprocessar falhas, um agendador seguro pode chamar:

```bash
curl -X POST http://localhost:5000/api/v1/notifications/process \
  -H "X-Worker-Token: SEU_NOTIFICATION_WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit":50}'
```

Esse token fica somente no servidor/agendador e nunca no navegador.
