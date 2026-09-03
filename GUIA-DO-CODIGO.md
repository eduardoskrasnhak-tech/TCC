# Guia do código do P.R.O.T.E.G.E.

Este arquivo explica onde cada parte do sistema está e qual é a responsabilidade dela.

## 1. Páginas HTML

Os arquivos HTML representam as telas que o usuário enxerga. Eles contêm a estrutura da página, os campos e os botões.

| Arquivo | Função |
| --- | --- |
| `html/index.html` | Página pública de apresentação do projeto. Não exige login. |
| `html/login.html` | Tela de entrada com e-mail e senha. |
| `html/registro.html` | Cadastro da conta e dos dados do idoso, endereço e familiares. |
| `html/reset-password.html` | Tela para definir uma nova senha. |
| `html/selecionar-area.html` | Permite ao administrador escolher entre área de usuário e área administrativa. |
| `html/dashboard.html` | Área do usuário: cadastro, solicitações, histórico e suporte. |
| `html/admin.html` | Área administrativa: clientes, chamados, status e mensagens. |

Os HTMLs carregam três tipos de recurso:

```html
<!-- Aparência da página -->
<link rel="stylesheet" href="../css/style.css">

<!-- Biblioteca de autenticação -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- Configuração e regras do sistema -->
<script src="../js-supabase/supabase-config.js"></script>
```

## 2. JavaScript do navegador

Os arquivos JavaScript dão comportamento às telas. Eles leem formulários, conversam com o Supabase e atualizam o HTML.

### `js-supabase/supabase-config.js`

É o ponto de conexão do site com o Supabase:

- `supabaseUrl`: endereço do projeto.
- `supabaseAnonKey`: chave pública usada pelo navegador.
- `supabaseClient`: objeto usado para login e consultas nas tabelas.
- `protegeApiUrl`: endereço do servidor Flask.

Não coloque neste arquivo a `service_role key` do Supabase. Ela nunca deve ficar no navegador.

### `js-supabase/script.js`

Cuida das funções gerais:

- login e logout;
- criação de conta;
- recuperação de senha;
- navegação da página inicial;
- localização pelo navegador;
- solicitação de assistência;
- escalonamento para familiar 1, familiar 2 e emergência.

### `js-supabase/dashboard.js`

Controla a área do usuário:

- carrega os dados do usuário;
- mostra e salva cadastro, endereço e familiares;
- busca o histórico de chamados;
- envia uma nova solicitação com localização;
- envia mensagens para o suporte.

### `js-supabase/admin.js`

Controla a área administrativa:

- verifica se a conta possui perfil `admin`;
- carrega clientes, chamados e mensagens;
- aplica os filtros de busca e status;
- edita cadastros completos;
- mantém mudanças de status pendentes até o botão geral de salvamento;
- avisa antes de sair se houver alteração não salva;
- permite responder mensagens dos clientes.

## 3. Banco de dados e autenticação

Os arquivos SQL ficam em `js-supabase/` porque fazem parte da configuração do Supabase.

### Ordem de execução

1. `supabase-setup.sql`
   - cria `idosos`;
   - cria `enderecos`;
   - cria `familiares`;
   - ativa as políticas de segurança dessas tabelas.

2. `supabase-dashboard.sql`
   - cria `acionamentos`;
   - cria `mensagens`;
   - cria `perfis`;
   - define a função que identifica administradores;
   - libera as operações de acordo com o perfil.

3. `supabase-device.sql`
   - adiciona dados de origem do dispositivo;
   - cria a tabela `dispositivos`;
   - relaciona o dispositivo ao idoso;
   - prepara a autenticação do ESP8266.

4. `supabase-rotina-chamados.sql`
   - cria o encerramento automático dos chamados na virada do dia;
   - registra quando um chamado foi encerrado automaticamente.

5. `supabase-operacao.sql`
   - cria a auditoria administrativa;
   - cria a fila de notificações e tentativas de reenvio;
   - adiciona informações operacionais aos dispositivos.

6. `supabase-melhorias-web.sql`
   - registra consentimento de privacidade;
   - adiciona confirmação de leitura das mensagens;
   - cria índices usados pelos filtros e históricos.

7. `supabase-seguranca.sql`
   - deve ser executado por último;
   - separa as permissões de clientes e administradores;
   - impede alteração indevida de respostas e chamados;
   - protege funções internas e bloqueia eventos duplicados.

## 4. Principais tabelas

```text
auth.users
└── perfis                 define usuario ou admin
    └── idosos             dados do idoso e dono do cadastro
        ├── enderecos      endereço do idoso
        ├── familiares     pessoas acionadas
        └── acionamentos   solicitações e emergências

acionamentos
└── mensagens              dúvidas e solicitações ao suporte

dispositivos               equipamento físico associado ao idoso
```

O Supabase Auth guarda a conta e a senha. Os dados pessoais ficam nas tabelas públicas com políticas RLS, que controlam quem pode consultar ou alterar cada registro.

## 5. Servidor Flask

Os arquivos estão em `backend/`.

### `backend/app.py`

Recebe eventos do dispositivo e encaminha dados para o Supabase. Também prepara notificações para os familiares por e-mail, WhatsApp ou SMS quando os serviços externos estiverem configurados.

Principais rotas:

- `GET /api/health`: informa se o servidor está funcionando;
- `POST /api/v1/device/events`: recebe emergência do dispositivo;
- `POST /api/v1/user/events`: recebe solicitação enviada pelo painel do usuário.

### `backend/.env.example`

Lista as configurações privadas do servidor, como URL do Supabase, chave de serviço e credenciais de notificações. Os valores reais devem ficar em um arquivo `.env` local ou nas variáveis de ambiente do servidor.

### `backend/requirements.txt`

Lista as bibliotecas Python necessárias para executar o Flask.

## 6. Firmware do dispositivo

O arquivo `firmware/esp8266_emergency.ino` é o programa do Wemos D1/ESP8266.

Ele é responsável por:

1. conectar ao Wi-Fi;
2. ler o botão de emergência;
3. receber latitude e longitude do GPS;
4. montar o evento com data, tipo e status;
5. enviar o evento para o servidor Flask.

No futuro, o mesmo fluxo poderá receber uma segunda tentativa pelo módulo 2G quando o Wi-Fi não estiver disponível.

## 7. Aparência

O arquivo `css/style.css` concentra a aparência de todas as telas:

- cores e variáveis visuais;
- layout responsivo;
- cartões, tabelas e formulários;
- botões e estados de mensagem;
- versões para celular;
- visual dos painéis de usuário e administrador.

Quando precisar alterar apenas a aparência, edite esse arquivo. Quando precisar alterar o que acontece ao clicar ou salvar, procure primeiro os arquivos JavaScript correspondentes.

## 8. Fluxo de uma emergência

```text
Botão ou painel do usuário
        ↓
GPS informa a localização
        ↓
JavaScript ou ESP8266 monta o evento
        ↓
Flask recebe o evento do dispositivo
        ↓
Supabase grava em acionamentos
        ↓
Painel administrativo exibe a ocorrência
        ↓
Familiares recebem a notificação configurada
```

## 9. Onde alterar cada coisa

| Necessidade | Arquivo principal |
| --- | --- |
| Alterar texto ou campos de uma tela | HTML correspondente |
| Alterar cores, tamanho ou posição | `css/style.css` |
| Alterar login ou cadastro | `js-supabase/script.js` |
| Alterar painel do usuário | `js-supabase/dashboard.js` |
| Alterar painel administrativo | `js-supabase/admin.js` |
| Criar ou alterar tabelas | arquivo SQL correspondente |
| Alterar recebimento do dispositivo | `backend/app.py` |
| Alterar o comportamento do Wemos | `firmware/esp8266_emergency.ino` |

## 10. Arquivos de apoio

| Arquivo | Função |
| --- | --- |
| `backend/README.md` | Instruções para instalar, configurar e iniciar a API Flask. |
| `backend/requirements.txt` | Dependências Python do backend. |
| `backend/.env.example` | Modelo das variáveis privadas necessárias no backend. |
| `backend/.gitignore` | Impede o envio de ambiente virtual, `.env`, caches e arquivos temporários. |
| `firmware/esp8266_emergency.ino` | Programa que será gravado no Wemos D1. |
| `GUIA-DO-CODIGO.md` | Este manual de consulta do projeto. |

## 11. Como ler o código sem se perder

Comece pela tela que deseja entender em `html/` e siga o arquivo JavaScript carregado no final dela. Depois identifique qual tabela do Supabase é consultada. Para uma emergência, siga `html/dashboard.html` → `dashboard.js` → Flask → tabela `acionamentos`.

Para uma emergência do equipamento físico, siga `firmware/esp8266_emergency.ino` → `backend/app.py` → `supabase-device.sql` → `admin.js`.

Os comentários com títulos em letras maiúsculas indicam início de um bloco. Variáveis com nomes como `usuarioAtual`, `idosoAtual` e `chamadosAdmin` guardam o estado temporário da tela; o banco continua sendo a fonte permanente dos dados.

## 12. Cuidados importantes

- Não publique `.env`, senhas, tokens de dispositivos ou a chave `service_role`.
- A chave pública do Supabase pode permanecer no frontend porque as políticas RLS protegem as tabelas.
- Alterações de banco devem ser feitas nos arquivos SQL e executadas no Supabase.
- Alterações de layout devem ser feitas no CSS, não espalhadas pelos HTMLs.
- Alterações de comportamento devem ficar no JavaScript, no Flask ou no firmware correspondente.
