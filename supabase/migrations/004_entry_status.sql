alter table entries add column if not exists status text not null default 'REALIZED' check (status in ('REALIZED', 'PROJECTED'));
