-- Execute depois de supabase-setup.sql e supabase-dashboard.sql.
alter table public.acionamentos add column if not exists device_id text;
alter table public.acionamentos add column if not exists occurred_at timestamptz;
alter table public.acionamentos add column if not exists event_type text not null default 'manual';
alter table public.acionamentos add column if not exists source text not null default 'site';
alter table public.familiares add column if not exists email text;

create table if not exists public.dispositivos (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  idoso_id uuid references public.idosos(id) on delete set null,
  token_hash text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.dispositivos enable row level security;
drop policy if exists "Admin gerencia dispositivos" on public.dispositivos;
create policy "Admin gerencia dispositivos" on public.dispositivos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
grant select, insert, update, delete on public.dispositivos to authenticated;

-- O token_hash deve ser SHA-256 do token usado pelo ESP8266.
-- Gere fora do banco, por exemplo: echo -n 'um-token-longo' | sha256sum
-- insert into public.dispositivos (device_id, idoso_id, token_hash)
-- values ('protege-001', 'UUID_DO_IDOSO', 'HASH_SHA256_DO_TOKEN');
