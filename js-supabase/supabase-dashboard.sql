-- Execute depois do supabase-setup.sql.
create table if not exists public.acionamentos (
  id uuid primary key default gen_random_uuid(), idoso_id uuid not null references public.idosos(id) on delete cascade,
  latitude numeric, longitude numeric, destinatarios text, status text not null default 'Recebido', criado_em timestamptz not null default now()
);
create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(), usuario_id uuid not null references auth.users(id) on delete cascade,
  assunto text not null, tipo text not null, mensagem text not null, resposta text, status text not null default 'aberta', criado_em timestamptz not null default now(), respondido_em timestamptz
);
create table if not exists public.perfis (
  usuario_id uuid primary key references auth.users(id) on delete cascade, tipo text not null default 'usuario' check (tipo in ('usuario', 'admin'))
);
alter table public.acionamentos enable row level security; alter table public.mensagens enable row level security; alter table public.perfis enable row level security;
create or replace function public.eh_admin() returns boolean language sql security definer set search_path = public as $$ select exists (select 1 from public.perfis where usuario_id = auth.uid() and tipo = 'admin'); $$;
create policy "Usuário vê seus acionamentos" on public.acionamentos for select to authenticated using (exists (select 1 from public.idosos where idosos.id = acionamentos.idoso_id and idosos.usuario_id = auth.uid()) or public.eh_admin());
create policy "Usuário cria seus acionamentos" on public.acionamentos for insert to authenticated with check (exists (select 1 from public.idosos where idosos.id = acionamentos.idoso_id and idosos.usuario_id = auth.uid()));
create policy "Admin gerencia acionamentos" on public.acionamentos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy "Admin gerencia idosos" on public.idosos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy "Admin gerencia enderecos" on public.enderecos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy "Admin gerencia familiares" on public.familiares for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy "Usuário gerencia mensagens" on public.mensagens for all to authenticated using (usuario_id = auth.uid() or public.eh_admin()) with check (usuario_id = auth.uid() or public.eh_admin());
create policy "Usuário vê o próprio perfil" on public.perfis for select to authenticated using (usuario_id = auth.uid());
create policy "Admin vê perfis" on public.perfis for select to authenticated using (public.eh_admin());
grant select, insert, update, delete on public.acionamentos, public.mensagens, public.perfis to authenticated;

-- Depois de criar sua conta, substitua o UUID abaixo pelo UUID do seu usuário em Authentication > Users.
-- insert into public.perfis (usuario_id, tipo) values ('COLE-O-UUID-AQUI', 'admin');
