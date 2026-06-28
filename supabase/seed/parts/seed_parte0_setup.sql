-- PARTE 0: Cartões de crédito
do $$ declare uid uuid := '69f852bc-af5a-4f11-b293-37bf2f809018'; begin
  insert into credit_cards (owner_id,name,last_four_digits,credit_limit,closing_day,due_day,is_active) select uid,'Nubank','0000',0,1,10,true where not exists(select 1 from credit_cards where owner_id=uid and name='Nubank');
  insert into credit_cards (owner_id,name,last_four_digits,credit_limit,closing_day,due_day,is_active) select uid,'Latam Pass','0000',0,1,10,true where not exists(select 1 from credit_cards where owner_id=uid and name='Latam Pass');
  insert into credit_cards (owner_id,name,last_four_digits,credit_limit,closing_day,due_day,is_active) select uid,'Itaú Multi Pontos','0000',0,1,10,true where not exists(select 1 from credit_cards where owner_id=uid and name='Itaú Multi Pontos');
  insert into credit_cards (owner_id,name,last_four_digits,credit_limit,closing_day,due_day,is_active) select uid,'Mastercard','0000',0,1,10,true where not exists(select 1 from credit_cards where owner_id=uid and name='Mastercard');
  insert into credit_cards (owner_id,name,last_four_digits,credit_limit,closing_day,due_day,is_active) select uid,'Visa','0000',0,1,10,true where not exists(select 1 from credit_cards where owner_id=uid and name='Visa');
end $$;
