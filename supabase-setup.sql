-- Execute este arquivo uma vez no Supabase em SQL Editor.
create table if not exists public.idosos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  rg text not null,
  cpf text not null unique,
  telefone text not null,
  data_nascimento date,
  criado_em timestamptz not null default now()
);

create table if not exists public.enderecos (
  id uuid primary key default gen_random_uuid(),
  idoso_id uuid not null references public.idosos(id) on delete cascade,
  cep text not null,
  logradouro text not null,
  numero text not null,
  bairro text not null,
  cidade text not null,
  estado text not null,
  complemento text
);

create table if not exists public.familiares (
  id uuid primary key default gen_random_uuid(),
  idoso_id uuid not null references public.idosos(id) on delete cascade,
  nome text not null,
  parentesco text not null,
  telefone text not null,
  prioridade integer not null check (prioridade in (1, 2))
);

alter table public.idosos enable row level security;
alter table public.enderecos enable row level security;
alter table public.familiares enable row level security;

create policy "Usuário gerencia seu idoso" on public.idosos
  for all to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create policy "Usuário gerencia endereço do seu idoso" on public.enderecos
  for all to authenticated using (exists (select 1 from public.idosos where idosos.id = enderecos.idoso_id and idosos.usuario_id = auth.uid()))
  with check (exists (select 1 from public.idosos where idosos.id = enderecos.idoso_id and idosos.usuario_id = auth.uid()));

create policy "Usuário gerencia familiares do seu idoso" on public.familiares
  for all to authenticated using (exists (select 1 from public.idosos where idosos.id = familiares.idoso_id and idosos.usuario_id = auth.uid()))
  with check (exists (select 1 from public.idosos where idosos.id = familiares.idoso_id and idosos.usuario_id = auth.uid()));

grant select, insert, update, delete on public.idosos, public.enderecos, public.familiares to authenticated;
