-- Melhorias da experiência web do P.R.O.T.E.G.E.
-- Execute depois de supabase-dashboard.sql e supabase-operacao.sql.

-- Permite destacar respostas novas ao usuário sem expor mensagens de terceiros.
alter table public.mensagens add column if not exists lida_em timestamptz;
alter table public.familiares add column if not exists email text;

-- Registro mínimo do consentimento apresentado durante o cadastro.
create table if not exists public.consentimentos_privacidade (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  versao text not null default '2026-09-01',
  aceito_em timestamptz not null default now()
);
alter table public.consentimentos_privacidade enable row level security;
drop policy if exists "Usuário vê seus consentimentos" on public.consentimentos_privacidade;
create policy "Usuário vê seus consentimentos" on public.consentimentos_privacidade for select to authenticated using (usuario_id = auth.uid());
drop policy if exists "Usuário registra seu consentimento" on public.consentimentos_privacidade;
create policy "Usuário registra seu consentimento" on public.consentimentos_privacidade for insert to authenticated with check (usuario_id = auth.uid());
grant select, insert on public.consentimentos_privacidade to authenticated;

-- Índices para filtros de administração e histórico de conversas.
create index if not exists idx_mensagens_usuario_criado_em on public.mensagens (usuario_id, criado_em desc);
create index if not exists idx_mensagens_status_criado_em on public.mensagens (status, criado_em desc);
create index if not exists idx_acionamentos_tipo_criado_em on public.acionamentos (event_type, criado_em desc);
create index if not exists idx_acionamentos_status_criado_em on public.acionamentos (status, criado_em desc);
create index if not exists idx_consentimentos_usuario_aceito_em on public.consentimentos_privacidade (usuario_id, aceito_em desc);
