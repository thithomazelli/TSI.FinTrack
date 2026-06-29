-- Limpa todos os dados históricos do usuário (mantém categorias, contas e cartões)
-- Seguro para rodar múltiplas vezes
do $$ declare uid uuid := '69f852bc-af5a-4f11-b293-37bf2f809018'; begin
  delete from transactions where owner_id = uid;
  delete from entries where owner_id = uid;
  raise notice 'Limpeza concluída para usuário %', uid;
end $$;
