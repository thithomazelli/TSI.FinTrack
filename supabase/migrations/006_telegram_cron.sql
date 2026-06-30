-- Agendamento diário das notificações do Telegram via pg_cron + pg_net.
-- A Edge Function telegram-notify tem verify_jwt = false, então o cron a
-- chama sem precisar de nenhuma chave secreta na migration.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamento anterior (idempotente)
do $$
begin
  perform cron.unschedule('telegram-daily-notify');
exception when others then
  null;
end $$;

-- Dispara todo dia às 12:00 UTC (09:00 horário de Brasília).
-- Sem "type" no corpo, a função roda o conjunto diário:
--   resumo diário + faturas (vencidas e a vencer) + metas ultrapassadas
--   (e, no dia 1º, também o resumo mensal).
select cron.schedule(
  'telegram-daily-notify',
  '0 12 * * *',
  $$
  select net.http_post(
    url     := 'https://rknjcrcvsetspfvexjsu.supabase.co/functions/v1/telegram-notify',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);
