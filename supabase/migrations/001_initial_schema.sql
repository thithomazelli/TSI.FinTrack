-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =====================
-- USER PROFILES
-- =====================
create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_profiles enable row level security;

create policy "Users manage own profile"
  on user_profiles for all
  using (auth.uid() = id);

-- =====================
-- FAMILY INVITES
-- =====================
create table family_invites (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  invited_email text not null,
  role text not null check (role in ('VIEWER', 'EDITOR')),
  token uuid not null default uuid_generate_v4(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(owner_id, invited_email)
);

alter table family_invites enable row level security;

create policy "Owner manages invites"
  on family_invites for all
  using (auth.uid() = owner_id);

-- =====================
-- FAMILY MEMBERS
-- =====================
create table family_members (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  member_id uuid not null references user_profiles(id) on delete cascade,
  role text not null check (role in ('VIEWER', 'EDITOR')),
  created_at timestamptz not null default now(),
  unique(owner_id, member_id)
);

alter table family_members enable row level security;

create policy "Owner manages family members"
  on family_members for all
  using (auth.uid() = owner_id);

create policy "Member reads own membership"
  on family_members for select
  using (auth.uid() = member_id);

-- =====================
-- DOMAIN LISTS
-- =====================
create table domain_lists (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  code text not null,
  name text not null,
  value text not null,
  color text,
  is_default boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table domain_lists enable row level security;

create policy "Owner manages domain lists"
  on domain_lists for all
  using (auth.uid() = owner_id);

create policy "Family members read domain lists"
  on domain_lists for select
  using (
    exists (
      select 1 from family_members
      where owner_id = domain_lists.owner_id
        and member_id = auth.uid()
    )
  );

-- =====================
-- ACCOUNTS
-- =====================
create table accounts (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  name text not null,
  type_id uuid references domain_lists(id),
  balance numeric(15, 2) not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table accounts enable row level security;

create policy "Owner manages accounts"
  on accounts for all
  using (auth.uid() = owner_id);

create policy "Family members access accounts"
  on accounts for select
  using (
    exists (
      select 1 from family_members
      where owner_id = accounts.owner_id
        and member_id = auth.uid()
    )
  );

create policy "Family editors insert accounts"
  on accounts for insert
  with check (
    exists (
      select 1 from family_members
      where owner_id = accounts.owner_id
        and member_id = auth.uid()
        and role = 'EDITOR'
    )
  );

create policy "Family editors update accounts"
  on accounts for update
  using (
    exists (
      select 1 from family_members
      where owner_id = accounts.owner_id
        and member_id = auth.uid()
        and role = 'EDITOR'
    )
  );

-- =====================
-- CREDIT CARDS
-- =====================
create table credit_cards (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  name text not null,
  last_four_digits text,
  credit_limit numeric(15, 2),
  closing_day integer,
  due_day integer,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table credit_cards enable row level security;

create policy "Owner manages credit cards"
  on credit_cards for all
  using (auth.uid() = owner_id);

create policy "Family members read credit cards"
  on credit_cards for select
  using (
    exists (
      select 1 from family_members
      where owner_id = credit_cards.owner_id
        and member_id = auth.uid()
    )
  );

-- =====================
-- CATEGORIES
-- =====================
create table categories (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table categories enable row level security;

create policy "Owner manages categories"
  on categories for all
  using (auth.uid() = owner_id);

create policy "Family members read categories"
  on categories for select
  using (
    exists (
      select 1 from family_members
      where owner_id = categories.owner_id
        and member_id = auth.uid()
    )
  );

-- =====================
-- CREDIT CARD BILLS
-- =====================
create table credit_card_bills (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  credit_card_id uuid not null references credit_cards(id) on delete cascade,
  year integer not null,
  month integer not null,
  total_amount numeric(15, 2) not null default 0,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED', 'PAID')),
  closing_date date,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(credit_card_id, year, month)
);

alter table credit_card_bills enable row level security;

create policy "Owner manages bills"
  on credit_card_bills for all
  using (auth.uid() = owner_id);

create policy "Family members read bills"
  on credit_card_bills for select
  using (
    exists (
      select 1 from family_members
      where owner_id = credit_card_bills.owner_id
        and member_id = auth.uid()
    )
  );

-- =====================
-- RECURRING TEMPLATES
-- =====================
create table recurring_templates (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  description text not null,
  amount numeric(15, 2) not null,
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  credit_card_id uuid references credit_cards(id),
  type text not null check (type in ('TRANSACTION', 'ENTRY')),
  day_of_month integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table recurring_templates enable row level security;

create policy "Owner manages recurring templates"
  on recurring_templates for all
  using (auth.uid() = owner_id);

-- =====================
-- TRANSACTIONS
-- =====================
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  description text not null,
  amount numeric(15, 2) not null,
  date date not null,
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  credit_card_id uuid references credit_cards(id),
  credit_card_bill_id uuid references credit_card_bills(id),
  status text not null default 'PROJECTED' check (status in ('REALIZED', 'PROJECTED')),
  installment_number integer,
  total_installments integer,
  installment_group_id uuid,
  recurring_template_id uuid references recurring_templates(id),
  original_currency text,
  original_amount numeric(15, 2),
  exchange_rate numeric(10, 6),
  labels text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transactions enable row level security;

create policy "Owner manages transactions"
  on transactions for all
  using (auth.uid() = owner_id);

create policy "Family members read transactions"
  on transactions for select
  using (
    exists (
      select 1 from family_members
      where owner_id = transactions.owner_id
        and member_id = auth.uid()
    )
  );

create policy "Family editors insert transactions"
  on transactions for insert
  with check (
    exists (
      select 1 from family_members
      where owner_id = transactions.owner_id
        and member_id = auth.uid()
        and role = 'EDITOR'
    )
  );

create policy "Family editors update transactions"
  on transactions for update
  using (
    exists (
      select 1 from family_members
      where owner_id = transactions.owner_id
        and member_id = auth.uid()
        and role = 'EDITOR'
    )
  );

-- =====================
-- ENTRIES
-- =====================
create table entries (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  description text not null,
  amount numeric(15, 2) not null,
  date date not null,
  type_id uuid references domain_lists(id),
  account_id uuid references accounts(id),
  recurring_template_id uuid references recurring_templates(id),
  labels text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table entries enable row level security;

create policy "Owner manages entries"
  on entries for all
  using (auth.uid() = owner_id);

create policy "Family members read entries"
  on entries for select
  using (
    exists (
      select 1 from family_members
      where owner_id = entries.owner_id
        and member_id = auth.uid()
    )
  );

create policy "Family editors insert entries"
  on entries for insert
  with check (
    exists (
      select 1 from family_members
      where owner_id = entries.owner_id
        and member_id = auth.uid()
        and role = 'EDITOR'
    )
  );

create policy "Family editors update entries"
  on entries for update
  using (
    exists (
      select 1 from family_members
      where owner_id = entries.owner_id
        and member_id = auth.uid()
        and role = 'EDITOR'
    )
  );

-- =====================
-- SAVINGS MOVEMENTS
-- =====================
create table savings_movements (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  description text not null,
  amount numeric(15, 2) not null,
  date date not null,
  type_id uuid references domain_lists(id),
  account_id uuid not null references accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table savings_movements enable row level security;

create policy "Owner manages savings"
  on savings_movements for all
  using (auth.uid() = owner_id);

create policy "Family members read savings"
  on savings_movements for select
  using (
    exists (
      select 1 from family_members
      where owner_id = savings_movements.owner_id
        and member_id = auth.uid()
    )
  );

-- =====================
-- GOALS
-- =====================
create table goals (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  monthly_limit numeric(15, 2) not null,
  year integer not null,
  month integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, category_id, year, month)
);

alter table goals enable row level security;

create policy "Owner manages goals"
  on goals for all
  using (auth.uid() = owner_id);

create policy "Family members read goals"
  on goals for select
  using (
    exists (
      select 1 from family_members
      where owner_id = goals.owner_id
        and member_id = auth.uid()
    )
  );

-- =====================
-- PEOPLE (labels)
-- =====================
create table people (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(owner_id, name)
);

alter table people enable row level security;

create policy "Owner manages people"
  on people for all
  using (auth.uid() = owner_id);
