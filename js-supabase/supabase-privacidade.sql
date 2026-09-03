-- Execute depois de supabase-melhorias-web.sql.
-- Registra pedidos de acesso, correção ou exclusão para tratamento pela equipe.
create table if not exists public.solicitacoes_privacidade (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('exclusao', 'acesso', 'correcao')),
  status text not null default 'pendente' check (status in ('pendente', 'em_analise', 'concluida', 'cancelada')),
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluido_em timestamptz
);
alter table public.solicitacoes_privacidade enable row level security;
drop policy if exists "Usuário cria pedido de privacidade" on public.solicitacoes_privacidade;
create policy "Usuário cria pedido de privacidade" on public.solicitacoes_privacidade for insert to authenticated with check (usuario_id = auth.uid());
drop policy if exists "Usuário consulta seus pedidos de privacidade" on public.solicitacoes_privacidade;
create policy "Usuário consulta seus pedidos de privacidade" on public.solicitacoes_privacidade for select to authenticated using (usuario_id = auth.uid() or public.eh_admin());
drop policy if exists "Admin gerencia pedidos de privacidade" on public.solicitacoes_privacidade;
create policy "Admin gerencia pedidos de privacidade" on public.solicitacoes_privacidade for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
grant select, insert on public.solicitacoes_privacidade to authenticated;
grant update (status, observacao, atualizado_em, concluido_em) on public.solicitacoes_privacidade to authenticated;
create index if not exists idx_solicitacoes_privacidade_status_criado on public.solicitacoes_privacidade (status, criado_em desc);
create index if not exists idx_solicitacoes_privacidade_usuario_criado on public.solicitacoes_privacidade (usuario_id, criado_em desc);
