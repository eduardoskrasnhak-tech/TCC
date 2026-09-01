# Segurança e proteção de dados — P.R.O.T.E.G.E.

O sistema trata dados pessoais e sensíveis no contexto do projeto: nome, documentos, telefone, endereço, localização e contatos de acionamento. Segurança não é uma tela isolada; ela envolve o navegador, o Supabase, o backend, a hospedagem e a equipe administrativa.

## Proteções já presentes

- Autenticação por e-mail e senha via Supabase Auth.
- Controle de acesso por perfil (`usuario` e `admin`) e políticas RLS no banco.
- Chave `service_role` usada apenas pelo backend Flask e ignorada pelo Git.
- Tokens dos dispositivos salvos como hash SHA-256, nunca em texto puro no banco.
- CORS limitado a origens definidas por ambiente.
- Limites básicos de requisição nos endpoints de dispositivo, usuário e reprocessamento de notificações.
- Respostas internas do Supabase não são devolvidas diretamente ao navegador.
- Cabeçalhos de proteção na API e limite de tamanho do corpo das requisições.
- Política de Segurança de Conteúdo (CSP) nas páginas e codificação de dados externos antes de montar HTML.
- Respostas administrativas feitas por uma operação do banco que valida novamente o perfil de administrador.
- Eventos antigos, futuros, duplicados ou com identificador inválido são recusados.
- Auditoria administrativa e ocultação de CPF/RG em telas que não precisam mostrar o dado completo.

## Antes de publicar em produção

1. Use HTTPS. Defina `FORCE_HTTPS=true` no backend somente quando a aplicação estiver atrás de um domínio com certificado válido.
2. Em `CORS_ORIGINS`, informe somente o domínio real do site, por exemplo `https://protege.exemplo.br`. Nunca use `*` em produção.
3. Mantenha `FLASK_DEBUG=false` e execute o Flask atrás de um servidor de produção/reverse proxy. O servidor de desenvolvimento não deve ficar exposto à internet.
4. Preencha os segredos somente no painel da hospedagem ou no arquivo `backend/.env` local. Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, tokens Twilio, SMTP ou tokens de dispositivos no JavaScript, firmware público ou GitHub.
5. No Supabase, confirme que RLS está ativa em todas as tabelas do schema `public` e revise as políticas sempre que criar uma tabela nova.
   Execute também `js-supabase/supabase-seguranca.sql` depois das outras migrações. Ele separa as permissões de mensagens, limita atualizações e endurece funções `security definer`.
6. Ative proteção contra senhas vazadas, defina senha mínima de pelo menos 8 caracteres e configure limites de login no Supabase Auth.
7. Restrinja as URLs de redirecionamento do Auth às URLs reais de login, recuperação e produção.
8. Habilite MFA para as contas administrativas quando o painel for usado pela equipe.
9. Faça backup periódico do banco e revise auditoria, fila de notificações e logs de falhas.
10. Na hospedagem do frontend, envie a CSP e os demais cabeçalhos como cabeçalhos HTTP. A tag `meta` do projeto protege o ambiente estático, mas `frame-ancestors`, HSTS e outras proteções completas dependem do servidor.

## Regras para a equipe

- Acesse cadastros somente quando houver necessidade de atendimento.
- Não envie CPF, RG, endereço ou localização por canais pessoais sem autorização e necessidade operacional.
- Não compartilhe contas administrativas; cada integrante deve ter sua própria conta.
- Ao remover alguém da equipe, altere o perfil para usuário ou exclua o acesso imediatamente.
- Em suspeita de acesso indevido, troque os segredos, revogue sessões no Supabase e revise a auditoria.

## Privacidade e LGPD

O aviso de privacidade do projeto é uma base inicial. Antes de uso comercial ou atendimento em escala, é necessário revisão jurídica/LGPD para definir base legal, retenção, responsáveis pelo tratamento, canal para titulares e processo de incidente.

## Limites desta fase

O limitador atual da API funciona na memória de uma instância do Flask. Em produção com mais de uma instância, a hospedagem ou um gateway (por exemplo, reverse proxy/WAF) deve aplicar rate limiting centralizado. Nenhuma configuração substitui a revisão periódica das políticas RLS do Supabase.
