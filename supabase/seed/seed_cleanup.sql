-- Remove TODOS os dados do usuário de TODAS as tabelas.
-- Mantém apenas o user_profile (criado pelo Auth).
-- Seguro para rodar múltiplas vezes antes de reimportar o seed.
do $$ declare uid uuid := '69f852bc-af5a-4f11-b293-37bf2f809018'; begin

  -- Dados financeiros (dependências primeiro)
  delete from transactions       where owner_id = uid;
  delete from entries            where owner_id = uid;
  delete from savings_movements  where owner_id = uid;
  delete from goals              where owner_id = uid;
  delete from recurring_templates where owner_id = uid;
  delete from credit_card_bills  where owner_id = uid;

  -- Contas, cartões, categorias
  delete from credit_cards  where owner_id = uid;
  delete from accounts      where owner_id = uid;
  delete from categories    where owner_id = uid;

  -- Família
  delete from family_members where owner_id = uid;
  delete from family_invites where invited_by = uid;

  -- Domínios / listas de configuração
  delete from domain_lists where owner_id = uid;

  -- Pessoas
  delete from people where owner_id = uid;

  raise notice 'Limpeza total concluída para usuário %', uid;
end $$;
