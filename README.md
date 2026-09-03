# P.R.O.T.E.G.E.

Sistema web de assistência e segurança para pessoas idosas, desenvolvido como projeto de conclusão de curso.

## Estrutura do projeto

| Pasta/arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Entrada do GitHub Pages; encaminha para o site principal. |
| `html/` | Todas as páginas da aplicação web. |
| `css/` | Folha de estilos compartilhada. |
| `js-supabase/` | JavaScript do navegador e migrações SQL do Supabase. |
| `backend/` | API Flask para integração futura com o dispositivo. |
| `firmware/` | Código do Wemos D1/ESP8266. |
| `.github/workflows/` | Automação de publicação e verificações do repositório. |
| `GUIA-DO-CODIGO.md` | Explicação técnica dos arquivos. |
| `SEGURANCA.md` e `SECURITY.md` | Orientações de segurança e relato de vulnerabilidades. |

## Site publicado

O GitHub Pages deve usar a branch `main` com a publicação pela GitHub Actions. O endereço esperado é:

`https://eduardoskrasnhak-tech.github.io/TCC/`

Se a publicação estiver configurada para a raiz da branch, o `index.html` inicial encaminhará para `html/index.html` automaticamente.

## Execução local

Abra a pasta do projeto com um servidor local. Por exemplo, no VS Code, use uma extensão de servidor local e abra `index.html`.

Para executar a API Flask, consulte [`backend/README.md`](backend/README.md). A chave `service_role` do Supabase deve ficar somente no servidor e nunca no navegador.

## Supabase

As migrações ficam em `js-supabase/` e devem ser executadas no SQL Editor na ordem indicada pelo [`GUIA-DO-CODIGO.md`](GUIA-DO-CODIGO.md). Antes de colocar o sistema em produção, aplique também as políticas de segurança e revise as configurações de autenticação.

## Segurança e privacidade

O projeto já inclui políticas RLS, proteção da API, política inicial de privacidade, banner de cookies e recursos básicos de acessibilidade. A política deve ser revisada juridicamente antes do uso comercial ou do tratamento de dados em escala.

Não publique senhas, tokens, chaves privadas, CPF, RG, localizações ou dados de usuários no repositório.
