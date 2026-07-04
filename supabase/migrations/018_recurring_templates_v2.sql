-- Add frequency, months, and position fields to recurring_templates
alter table recurring_templates
  add column if not exists frequency text not null default 'monthly'
    check (frequency in ('monthly', 'sporadic')),
  add column if not exists months int[] not null default '{}',
  add column if not exists position float8 not null default 0;

-- Initialize position from row order (by description, so existing data gets a stable order)
with ordered as (
  select id, row_number() over (partition by owner_id order by description) * 10 as pos
  from recurring_templates
)
update recurring_templates rt
set position = o.pos
from ordered o
where rt.id = o.id;
