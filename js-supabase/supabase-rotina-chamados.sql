-- Rotina automática de encerramento dos chamados.
-- Execute este arquivo no SQL Editor do Supabase depois das tabelas principais.
-- Horário usado: America/Sao_Paulo.

alter table public.acionamentos
  add column if not exists encerrado_automaticamente_em timestamptz;

create or replace function public.encerrar_chamados_do_dia_anterior()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inicio_do_dia_atual timestamptz;
  quantidade_encerrada integer;
begin
  -- A virada acontece à meia-noite no horário brasileiro.
  inicio_do_dia_atual := date_trunc('day', now() at time zone 'America/Sao_Paulo')
    at time zone 'America/Sao_Paulo';

  update public.acionamentos
     set status = 'Resolvido',
         encerrado_automaticamente_em = now()
   where criado_em < inicio_do_dia_atual
     and status <> 'Resolvido';

  get diagnostics quantidade_encerrada = row_count;
  return quantidade_encerrada;
end;
$$;

-- Permite que a rotina seja executada pelo agendador do Supabase.
grant execute on function public.encerrar_chamados_do_dia_anterior() to service_role;

-- O pg_cron trabalha em UTC por padrão. 03:00 UTC corresponde a 00:00 em
-- America/Sao_Paulo. O bloco evita criar o mesmo agendamento duas vezes.
create extension if not exists pg_cron with schema extensions;

do $job$
begin
  if exists (select 1 from cron.job where jobname = 'encerrar-chamados-diariamente') then
    perform cron.unschedule('encerrar-chamados-diariamente');
  end if;

  perform cron.schedule(
    'encerrar-chamados-diariamente',
    '0 3 * * *',
    $sql$select public.encerrar_chamados_do_dia_anterior();$sql$
  );
end;
$job$;

-- Para testar sem esperar a meia-noite, execute:
-- select public.encerrar_chamados_do_dia_anterior();
