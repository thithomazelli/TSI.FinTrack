-- Stores in-progress guided /lancamento flows per Telegram chat
create table if not exists telegram_sessions (
  chat_id   bigint      primary key,
  step      text        not null,
  data      jsonb       not null default '{}',
  updated_at timestamptz not null default now()
);
