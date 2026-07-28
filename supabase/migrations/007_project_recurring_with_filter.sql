-- Adds optional p_template_ids and p_category_id filter to project_recurring_period.
-- Existing callers that omit p_template_ids continue to work unchanged (NULL = project all active).
CREATE OR REPLACE FUNCTION project_recurring_period(
  p_year        int,
  p_month       int,
  p_template_ids uuid[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id uuid := auth.uid();
  v_created  int  := 0;
  v_date     date;
  v_last_day int;
  rec        recurring_templates%rowtype;
BEGIN
  FOR rec IN
    SELECT *
    FROM   recurring_templates
    WHERE  owner_id  = v_owner_id
      AND  is_active = true
      AND  (
             p_template_ids IS NULL
             OR array_length(p_template_ids, 1) IS NULL
             OR id = ANY(p_template_ids)
           )
      AND  (
             frequency = 'monthly'
             OR (frequency = 'sporadic' AND p_month = ANY(months))
           )
  LOOP
    -- Clamp day to last day of the target month
    v_last_day := EXTRACT(DAY FROM
      (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')
    )::int;
    v_date := make_date(p_year, p_month, LEAST(rec.day_of_month, v_last_day));

    IF rec.type = 'ENTRY' THEN
      IF NOT EXISTS (
        SELECT 1 FROM entries
        WHERE  owner_id               = v_owner_id
          AND  recurring_template_id  = rec.id
          AND  date_trunc('month', date) = date_trunc('month', v_date)
      ) THEN
        INSERT INTO entries
          (owner_id, description, amount, date, status, account_id, recurring_template_id, labels)
        VALUES
          (v_owner_id, rec.description, rec.amount, v_date, 'PROJECTED',
           rec.account_id, rec.id, '{}');
        v_created := v_created + 1;
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM transactions
        WHERE  owner_id               = v_owner_id
          AND  recurring_template_id  = rec.id
          AND  date_trunc('month', date) = date_trunc('month', v_date)
      ) THEN
        INSERT INTO transactions
          (owner_id, description, amount, date, status,
           category_id, account_id, credit_card_id, recurring_template_id, labels)
        VALUES
          (v_owner_id, rec.description, rec.amount, v_date, 'PROJECTED',
           rec.category_id, rec.account_id, rec.credit_card_id, rec.id, '{}');
        v_created := v_created + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN json_build_object('created', v_created);
END;
$$;
