-- Recalculates credit_card_bills.total_amount whenever a transaction
-- with a credit_card_id is inserted, updated, or deleted.

CREATE OR REPLACE FUNCTION recalculate_bill_total(
  p_credit_card_id uuid,
  p_year integer,
  p_month integer,
  p_owner_id uuid
) RETURNS void AS $$
BEGIN
  UPDATE credit_card_bills
  SET total_amount = (
    SELECT COALESCE(SUM(amount), 0)
    FROM transactions
    WHERE credit_card_id = p_credit_card_id
      AND EXTRACT(YEAR  FROM date::date) = p_year
      AND EXTRACT(MONTH FROM date::date) = p_month
      AND owner_id = p_owner_id
  ),
  updated_at = now()
  WHERE credit_card_id = p_credit_card_id
    AND year  = p_year
    AND month = p_month
    AND owner_id = p_owner_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_fn_update_bill_total() RETURNS TRIGGER AS $$
BEGIN
  -- Update bill for the NEW row's card/month
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.credit_card_id IS NOT NULL THEN
    PERFORM recalculate_bill_total(
      NEW.credit_card_id,
      EXTRACT(YEAR  FROM NEW.date)::integer,
      EXTRACT(MONTH FROM NEW.date)::integer,
      NEW.owner_id
    );
  END IF;

  -- If UPDATE changed card or date, also recalculate the OLD card/month
  IF TG_OP = 'UPDATE' AND OLD.credit_card_id IS NOT NULL AND (
    OLD.credit_card_id IS DISTINCT FROM NEW.credit_card_id OR
    OLD.date            IS DISTINCT FROM NEW.date
  ) THEN
    PERFORM recalculate_bill_total(
      OLD.credit_card_id,
      EXTRACT(YEAR  FROM OLD.date)::integer,
      EXTRACT(MONTH FROM OLD.date)::integer,
      OLD.owner_id
    );
  END IF;

  -- On DELETE, recalculate the OLD card/month
  IF TG_OP = 'DELETE' AND OLD.credit_card_id IS NOT NULL THEN
    PERFORM recalculate_bill_total(
      OLD.credit_card_id,
      EXTRACT(YEAR  FROM OLD.date)::integer,
      EXTRACT(MONTH FROM OLD.date)::integer,
      OLD.owner_id
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_bill_total
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION trg_fn_update_bill_total();

-- Back-fill existing bills
UPDATE credit_card_bills b
SET total_amount = (
  SELECT COALESCE(SUM(t.amount), 0)
  FROM transactions t
  WHERE t.credit_card_id = b.credit_card_id
    AND EXTRACT(YEAR  FROM t.date::date) = b.year
    AND EXTRACT(MONTH FROM t.date::date) = b.month
    AND t.owner_id = b.owner_id
),
updated_at = now();
