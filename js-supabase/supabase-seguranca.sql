-- Endurecimento de segurança do P.R.O.T.E.G.E.
-- Execute no SQL Editor depois das demais migrações do projeto.

-- A função administrativa usa nomes totalmente qualificados e não herda
-- um search_path controlável por outro usuário.
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.perfis
     where usuario_id = (select auth.uid())
       and tipo = 'admin'
  );
$$;

revoke all on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated, service_role;

-- Mensagens: o cliente lê e cria as próprias mensagens. A única coluna que
-- ele pode atualizar diretamente é lida_em. Resposta e status ficam com o admin.
drop policy if exists "Usuário gerencia mensagens" on public.mensagens;
drop policy if exists "Usuário consulta suas mensagens" on public.mensagens;
drop policy if exists "Usuário cria suas mensagens" on public.mensagens;
drop policy if exists "Usuário marca suas mensagens como lidas" on public.mensagens;
drop policy if exists "Admin consulta mensagens" on public.mensagens;

create policy "Usuário consulta suas mensagens"
on public.mensagens for select to authenticated
using (usuario_id = (select auth.uid()));

create policy "Usuário cria suas mensagens"
on public.mensagens for insert to authenticated
with check (
  usuario_id = (select auth.uid())
  and resposta is null
  and respondido_em is null
  and status = 'aberta'
  and length(trim(assunto)) between 1 and 150
  and length(trim(tipo)) between 1 and 60
  and length(trim(mensagem)) between 1 and 5000
);

create policy "Usuário marca suas mensagens como lidas"
on public.mensagens for update to authenticated
using (usuario_id = (select auth.uid()))
with check (usuario_id = (select auth.uid()));

create policy "Admin consulta mensagens"
on public.mensagens for select to authenticated
using (public.eh_admin());

revoke update, delete on public.mensagens from authenticated;
grant select, insert on public.mensagens to authenticated;
grant update (lida_em) on public.mensagens to authenticated;

-- A resposta administrativa ocorre por esta operação estreita. Mesmo que
-- alguém tente chamá-la manualmente, a função verifica o perfil de admin.
create or replace function public.responder_mensagem_admin(
  p_mensagem_id uuid,
  p_resposta text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Acesso negado';
  end if;
  if p_resposta is null or length(trim(p_resposta)) < 1 or length(p_resposta) > 5000 then
    raise exception 'Resposta inválida';
  end if;

  update public.mensagens
     set resposta = trim(p_resposta),
         status = 'respondida',
         respondido_em = now(),
         lida_em = null
   where id = p_mensagem_id;

  if not found then
    raise exception 'Mensagem não encontrada';
  end if;
end;
$$;

revoke all on function public.responder_mensagem_admin(uuid, text) from public, anon;
grant execute on function public.responder_mensagem_admin(uuid, text) to authenticated;

-- Chamados: clientes só podem mudar o status dos próprios registros para
-- Resolvido. Administradores continuam podendo alterar qualquer status.
drop policy if exists "Usuário cria seus acionamentos" on public.acionamentos;
create policy "Usuário cria seus acionamentos"
on public.acionamentos for insert to authenticated
with check (
  exists (
    select 1 from public.idosos
     where idosos.id = acionamentos.idoso_id
       and idosos.usuario_id = (select auth.uid())
  )
  and device_id is null
  and source = 'site'
  and (
    (event_type = 'assistance' and status = 'Recebido')
    or (event_type = 'emergency' and status = 'Emergência')
  )
);

drop policy if exists "Usuário resolve seus acionamentos" on public.acionamentos;
create policy "Usuário resolve seus acionamentos"
on public.acionamentos for update to authenticated
using (
  exists (
    select 1 from public.idosos
     where idosos.id = acionamentos.idoso_id
       and idosos.usuario_id = (select auth.uid())
  )
)
with check (
  status = 'Resolvido'
  and exists (
    select 1 from public.idosos
     where idosos.id = acionamentos.idoso_id
       and idosos.usuario_id = (select auth.uid())
  )
);

revoke update on public.acionamentos from authenticated;
grant update (status) on public.acionamentos to authenticated;

-- Evita que o mesmo evento do dispositivo seja registrado repetidamente.
create unique index if not exists idx_acionamentos_evento_dispositivo_unico
on public.acionamentos (device_id, occurred_at, event_type)
where device_id is not null and occurred_at is not null;

-- Funções de rotina não devem ser executadas diretamente pelo navegador.
revoke all on function public.registrar_data_resolucao_chamado() from public, anon, authenticated;
revoke all on function public.encerrar_chamados_do_dia_anterior() from public, anon, authenticated;
grant execute on function public.encerrar_chamados_do_dia_anterior() to service_role;

-- Novas tabelas e funções não receberão permissões amplas automaticamente.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
