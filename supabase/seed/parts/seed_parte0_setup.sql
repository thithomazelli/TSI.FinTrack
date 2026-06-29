-- PARTE 0: Cartões de crédito + Categorias
do $$ declare uid uuid := '69f852bc-af5a-4f11-b293-37bf2f809018'; begin

  -- Cartões de crédito e débito
  insert into credit_cards (owner_id,name,last_four_digits,credit_limit,closing_day,due_day) select uid,'Crédito Nubank','0000',0,1,10 where not exists(select 1 from credit_cards where owner_id=uid and name='Crédito Nubank');
  insert into credit_cards (owner_id,name,last_four_digits,credit_limit,closing_day,due_day) select uid,'Crédito Latam Pass','0000',0,1,10 where not exists(select 1 from credit_cards where owner_id=uid and name='Crédito Latam Pass');
  insert into credit_cards (owner_id,name,last_four_digits,credit_limit,closing_day,due_day) select uid,'Crédito Itaú Multi Pontos','0000',0,1,10 where not exists(select 1 from credit_cards where owner_id=uid and name='Crédito Itaú Multi Pontos');
  insert into credit_cards (owner_id,name,last_four_digits,credit_limit,closing_day,due_day) select uid,'Crédito Mastercard','0000',0,1,10 where not exists(select 1 from credit_cards where owner_id=uid and name='Crédito Mastercard');
  insert into credit_cards (owner_id,name,last_four_digits,credit_limit,closing_day,due_day) select uid,'Crédito Visa','0000',0,1,10 where not exists(select 1 from credit_cards where owner_id=uid and name='Crédito Visa');
  insert into credit_cards (owner_id,name,last_four_digits,credit_limit,closing_day,due_day) select uid,'Débito Itaú','0000',0,1,10 where not exists(select 1 from credit_cards where owner_id=uid and name='Débito Itaú');

  -- Categorias
  insert into categories (owner_id,name,color) select uid,'Alimentação/Mercado','#f59e0b' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Alimentação/Mercado'));
  insert into categories (owner_id,name,color) select uid,'Assinaturas','#8b5cf6' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Assinaturas'));
  insert into categories (owner_id,name,color) select uid,'Bike','#10b981' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Bike'));
  insert into categories (owner_id,name,color) select uid,'Celular','#6366f1' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Celular'));
  insert into categories (owner_id,name,color) select uid,'Combustível','#f97316' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Combustível'));
  insert into categories (owner_id,name,color) select uid,'Convênio Médico','#ec4899' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Convênio Médico'));
  insert into categories (owner_id,name,color) select uid,'Cuidados Pessoais','#f43f5e' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Cuidados Pessoais'));
  insert into categories (owner_id,name,color) select uid,'Despesas Carro','#78716c' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Despesas Carro'));
  insert into categories (owner_id,name,color) select uid,'Despesas Casa','#84cc16' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Despesas Casa'));
  insert into categories (owner_id,name,color) select uid,'Despesas Empresa','#0ea5e9' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Despesas Empresa'));
  insert into categories (owner_id,name,color) select uid,'Despesas Terreno','#a3e635' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Despesas Terreno'));
  insert into categories (owner_id,name,color) select uid,'Diversos','#6b7280' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Diversos'));
  insert into categories (owner_id,name,color) select uid,'Empréstimo Bancário','#dc2626' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Empréstimo Bancário'));
  insert into categories (owner_id,name,color) select uid,'Empréstimo Pessoal','#b91c1c' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Empréstimo Pessoal'));
  insert into categories (owner_id,name,color) select uid,'Enxoval','#db2777' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Enxoval'));
  insert into categories (owner_id,name,color) select uid,'Estudo','#2563eb' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Estudo'));
  insert into categories (owner_id,name,color) select uid,'Farmácia','#16a34a' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Farmácia'));
  insert into categories (owner_id,name,color) select uid,'Futebol','#15803d' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Futebol'));
  insert into categories (owner_id,name,color) select uid,'Games','#7c3aed' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Games'));
  insert into categories (owner_id,name,color) select uid,'Instrumentos','#b45309' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Instrumentos'));
  insert into categories (owner_id,name,color) select uid,'Investimentos','#0d9488' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Investimentos'));
  insert into categories (owner_id,name,color) select uid,'Lazer','#d97706' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Lazer'));
  insert into categories (owner_id,name,color) select uid,'Médico','#059669' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Médico'));
  insert into categories (owner_id,name,color) select uid,'Parcela carro','#475569' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Parcela carro'));
  insert into categories (owner_id,name,color) select uid,'Pets','#92400e' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Pets'));
  insert into categories (owner_id,name,color) select uid,'Poupança','#065f46' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Poupança'));
  insert into categories (owner_id,name,color) select uid,'Presente','#be185d' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Presente'));
  insert into categories (owner_id,name,color) select uid,'Roupas','#9333ea' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Roupas'));
  insert into categories (owner_id,name,color) select uid,'TI','#1d4ed8' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('TI'));
  insert into categories (owner_id,name,color) select uid,'Tarifas/Juros','#991b1b' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Tarifas/Juros'));
  insert into categories (owner_id,name,color) select uid,'Telefone celular','#0369a1' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Telefone celular'));
  insert into categories (owner_id,name,color) select uid,'Transporte Público','#1e40af' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Transporte Público'));
  insert into categories (owner_id,name,color) select uid,'Tênis','#7e22ce' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Tênis'));
  insert into categories (owner_id,name,color) select uid,'Uber/99','#1c1917' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Uber/99'));
  insert into categories (owner_id,name,color) select uid,'Viagem','#0891b2' where not exists(select 1 from categories where owner_id=uid and lower(name)=lower('Viagem'));

end $$;
