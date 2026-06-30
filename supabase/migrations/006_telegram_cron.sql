-- Agendamento das notificações do Telegram via pg_cron + pg_net.
-- A Edge Function telegram-notify tem verify_jwt = false, então o cron a
-- chama sem precisar de nenhuma chave secreta na migration.
--
-- Dois entry points automáticos:
--   1) DIÁRIO   — todo dia às 09:00 BRT (12:00 UTC): resumo do dia,
--                 faturas (vencidas/a vencer), contas pendentes, metas.
--   2) MENSAL   — 3x no mês (dia 1, dia 16 e último dia): fechamento do mês
--                 anterior, saúde financeira de meio de mês e resumo final.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamentos anteriores (idempotente)
do $$
begin
  perform cron.unschedule('telegram-daily-notify');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('telegram-monthly-notify');
exception when others then null;
end $$;

-- 1) Resumo diário — todo dia às 12:00 UTC (09:00 BRT)
select cron.schedule(
  'telegram-daily-notify',
  '0 12 * * *',
  $$
  select net.http_post(
    url     := 'https://rknjcrcvsetspfvexjsu.supabase.co/functions/v1/telegram-notify',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{"type":"daily"}'::jsonb
  );
  $$
);

-- 2) Resumo mensal — roda 12:10 UTC nos dias candidatos (1, 16 e fins de mês);
--    a própria função decide se hoje é dia 1, dia 16 ou o último dia do mês.
select cron.schedule(
  'telegram-monthly-notify',
  '10 12 1,16,28,29,30,31 * *',
  $$
  select net.http_post(
    url     := 'https://rknjcrcvsetspfvexjsu.supabase.co/functions/v1/telegram-notify',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{"type":"monthly"}'::jsonb
  );
  $$
);
