-- =====================
-- TELEGRAM
-- =====================

-- One-time tokens used to link a Telegram chat to a Supabase user
create table telegram_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  token text not null unique,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

alter table telegram_links enable row level security;

-- Only the owner can read/create their own link tokens
create policy "Owner manages telegram links"
  on telegram_links for all
  using (auth.uid() = user_id);

-- Active subscription linking a user to a Telegram chat
create table telegram_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade unique,
  chat_id bigint not null,
  notifications_enabled boolean not null default true,
  linked_at timestamptz not null default now()
);

alter table telegram_subscriptions enable row level security;

create policy "Owner manages telegram subscription"
  on telegram_subscriptions for all
  using (auth.uid() = user_id);

-- Indexes
create index telegram_links_token_idx on telegram_links(token) where not used;
create index telegram_subscriptions_chat_idx on telegram_subscriptions(chat_id);
