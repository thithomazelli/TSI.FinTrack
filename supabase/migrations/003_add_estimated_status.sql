-- Add ESTIMATED to transaction_status domain list for all existing users
insert into domain_list_items (owner_id, list_key, label, value, is_active, is_default, sort_order)
select
  p.id,
  'transaction_status',
  'Estimado',
  'ESTIMATED',
  true,
  false,
  3
from user_profiles p
where not exists (
  select 1 from domain_list_items d
  where d.owner_id = p.id
    and d.list_key = 'transaction_status'
    and d.value = 'ESTIMATED'
);
