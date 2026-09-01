-- Operação, auditoria e fila de notificações do P.R.O.T.E.G.E.
-- Execute depois de supabase-device.sql no SQL Editor do Supabase.

alter table public.dispositivos add column if not exists ultimo_contato_em timestamptz;
alter table public.dispositivos add column if not exists nivel_bateria numeric check (nivel_bateria is null or nivel_bateria between 0 and 100);
alter table public.dispositivos add column if not exists latitude numeric;
alter table public.dispositivos add column if not exists longitude numeric;

create table if not exists public.auditoria_admin (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete restrict,
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists public.fila_notificacoes (
  id uuid primary key default gen_random_uuid(),
  acionamento_id uuid not null references public.acionamentos(id) on delete cascade,
  familiar_id uuid references public.familiares(id) on delete set null,
  canal text not null check (canal in ('email', 'sms', 'whatsapp')),
  destino text not null,
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'cancelado')),
  tentativas integer not null default 0 check (tentativas >= 0),
  erro text,
  enviado_em timestamptz,
  criado_em timestamptz not null default now()
);

alter table public.auditoria_admin enable row level security;
alter table public.fila_notificacoes enable row level security;

drop policy if exists "Admin consulta auditoria" on public.auditoria_admin;
create policy "Admin consulta auditoria" on public.auditoria_admin for select to authenticated using (public.eh_admin());
drop policy if exists "Admin registra auditoria" on public.auditoria_admin;
create policy "Admin registra auditoria" on public.auditoria_admin for insert to authenticated with check (public.eh_admin() and admin_id = auth.uid());

drop policy if exists "Admin gerencia fila de notificacoes" on public.fila_notificacoes;
create policy "Admin gerencia fila de notificacoes" on public.fila_notificacoes for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

grant select, insert on public.auditoria_admin to authenticated;
grant select, insert, update, delete on public.fila_notificacoes to authenticated;

create index if not exists idx_auditoria_admin_criado_em on public.auditoria_admin (criado_em desc);
create index if not exists idx_fila_notificacoes_status on public.fila_notificacoes (status, criado_em);
create index if not exists idx_fila_notificacoes_acionamento on public.fila_notificacoes (acionamento_id);

