-- ROLLBACK — Execute agora para desfazer os dois passos anteriores

-- Passo 1: apaga todos os registros inseridos pelo script (created_at da última hora)
DELETE FROM transactions
WHERE owner_id   = '69f852bc-af5a-4f11-b293-37bf2f809018'
  AND created_at > NOW() - INTERVAL '2 hours';

-- Passo 2: zera o installment_group_id que foi atribuído pelo UPDATE
UPDATE transactions
SET   installment_group_id = NULL,
      updated_at            = NOW()
WHERE owner_id              = '69f852bc-af5a-4f11-b293-37bf2f809018'
  AND total_installments    > 1
  AND updated_at            > NOW() - INTERVAL '2 hours';
