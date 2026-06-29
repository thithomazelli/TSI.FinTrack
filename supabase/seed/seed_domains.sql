-- Popula as listas de domínio (Configurações > Domínios) — rodar uma vez no SQL Editor
do $$ declare uid uuid := '69f852bc-af5a-4f11-b293-37bf2f809018'; begin
  insert into domain_lists (owner_id, code, name, value, is_system, is_default, sort_order)
  select uid, d.code, d.name, d.value, d.is_system, d.is_default, d.sort_order
  from (values
    ('transaction_status','Realizado','REALIZED',true,true,1),
    ('transaction_status','Projetado','PROJECTED',true,false,2),
    ('transaction_type','Débito','DEBIT',true,true,1),
    ('transaction_type','Crédito','CREDIT',true,false,2),
    ('entry_type','Salário','SALARY',false,true,1),
    ('entry_type','Reembolso','REIMBURSEMENT',false,false,2),
    ('entry_type','Transferência','TRANSFER',false,false,3),
    ('entry_type','Outro','OTHER',false,false,4),
    ('account_type','Conta Corrente','CHECKING',true,true,1),
    ('account_type','Poupança','SAVINGS',true,false,2),
    ('savings_movement_type','Depósito','DEPOSIT',true,true,1),
    ('savings_movement_type','Resgate','WITHDRAWAL',true,false,2),
    ('bill_status','Aberta','OPEN',true,true,1),
    ('bill_status','Fechada','CLOSED',true,false,2),
    ('bill_status','Paga','PAID',true,false,3)
  ) as d(code,name,value,is_system,is_default,sort_order)
  where not exists (
    select 1 from domain_lists dl
    where dl.owner_id = uid and dl.code = d.code and dl.value = d.value
  );
  raise notice 'Domínios populados';
end $$;
