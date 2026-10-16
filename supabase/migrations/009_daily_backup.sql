-- =====================================================================
-- Backup diário do banco (pg_cron) com retenção de 7 dias
-- =====================================================================
-- Todo dia às 06:00 UTC (03:00 BRT) copia todas as tabelas do schema
-- public para backup.rows (uma linha jsonb por registro) e apaga as cópias
-- com mais de 7 dias. O schema backup não é exposto pela API (PostgREST).
--
-- Consultas úteis:
--   -- Snapshots disponíveis e quantos registros cada tabela tinha
--   select id, taken_at, row_counts from backup.snapshots order by id desc;
--
--   -- Tirar um snapshot agora (ex.: antes de uma operação em massa)
--   select backup.take_snapshot();
--
--   -- Recolocar registros apagados (só os que não existem mais, pelo id).
--   -- Restaure as tabelas "pai" antes das "filhas" (ex.: credit_card_bills antes de transactions).
--   select backup.restore_missing(<snapshot_id>, 'transactions');
--   select backup.restore_missing(<snapshot_id>, 'entries');
--
--   -- Espaço ocupado pelos backups
--   select pg_size_pretty(pg_total_relation_size('backup.rows'));
-- =====================================================================

create extension if not exists pg_cron;

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;

create table if not exists backup.snapshots (
  id         bigserial primary key,
  taken_at   timestamptz not null default now(),
  row_counts jsonb not null default '{}'
);

create table if not exists backup.rows (
  snapshot_id bigint not null references backup.snapshots(id) on delete cascade,
  table_name  text   not null,
  data        jsonb  not null
);
create index if not exists rows_snapshot_table_idx on backup.rows (snapshot_id, table_name);

-- Copia todas as tabelas de public e remove snapshots mais antigos que p_keep_days
create or replace function backup.take_snapshot(p_keep_days int default 7)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id     bigint;
  v_table  text;
  v_count  bigint;
  v_counts jsonb := '{}';
begin
  insert into backup.snapshots default values returning id into v_id;

  for v_table in
    select tablename from pg_catalog.pg_tables where schemaname = 'public' order by tablename
  loop
    execute format(
      'insert into backup.rows (snapshot_id, table_name, data) select $1, $2, to_jsonb(t) from public.%I t',
      v_table
    ) using v_id, v_table;
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object(v_table, v_count);
  end loop;

  update backup.snapshots set row_counts = v_counts where id = v_id;

  delete from backup.snapshots where taken_at < now() - make_interval(days => p_keep_days);

  return v_id;
end;
$$;

-- Reinsere em public.<p_table> os registros do snapshot cujo id não existe mais
create or replace function backup.restore_missing(p_snapshot_id bigint, p_table text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_count bigint;
begin
  execute format(
    'insert into public.%1$I
       select (jsonb_populate_record(null::public.%1$I, r.data)).*
       from backup.rows r
       where r.snapshot_id = $1
         and r.table_name = %2$L
         and not exists (select 1 from public.%1$I t where t.id = (r.data->>''id'')::uuid)',
    p_table, p_table
  ) using p_snapshot_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function backup.take_snapshot(int)            from public, anon, authenticated;
revoke all on function backup.restore_missing(bigint, text) from public, anon, authenticated;

-- Agenda (recria se já existir)
select cron.unschedule(jobid) from cron.job where jobname = 'backup-diario';
select cron.schedule('backup-diario', '0 6 * * *', $$select backup.take_snapshot(7)$$);
