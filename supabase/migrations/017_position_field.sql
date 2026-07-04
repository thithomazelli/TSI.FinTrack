-- Add position column to entries and transactions for custom drag-and-drop ordering.
-- Initialized from date DESC order so existing visual order is preserved.
alter table entries add column if not exists position float;
alter table transactions add column if not exists position float;

update entries set position = sub.rn * 1000
from (
  select id,
    row_number() over (partition by owner_id order by date desc, created_at desc) as rn
  from entries
) sub
where entries.id = sub.id;

update transactions set position = sub.rn * 1000
from (
  select id,
    row_number() over (partition by owner_id order by date desc, created_at desc) as rn
  from transactions
) sub
where transactions.id = sub.id;
