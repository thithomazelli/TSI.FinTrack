"""
Extrai dados dos xlsx anuais de orçamento e gera seed_data.json.

Uso:
  python3 scripts/parse-xlsx.py

Requer: pip install openpyxl msoffcrypto-tool
"""

import msoffcrypto, io, json, re, calendar
from pathlib import Path
import openpyxl
from datetime import date, datetime

PASSWORD    = "l#p01091910"
OWNER_ID    = "69f852bc-af5a-4f11-b293-37bf2f809018"
UPLOADS_DIR = Path("/root/.claude/uploads/2908ed1e-2b65-5b58-952d-703f6003d118")
OUT_FILE    = Path(__file__).parent / "seed_data.json"

# ── Card metadata (name → due_day) ───────────────────────────────────────────
CARD_DUE = {
    "crédito nubank":            29,
    "crédito latam pass":        27,
    "crédito itaú multi pontos": 27,
    "crédito mastercard":        10,
    "crédito visa":              10,
}

# Normalise raw tipo string from spreadsheet → canonical card name
TIPO_MAP = {
    "débito":                          None,  # debit – no card
    "crédito mastercard":              "Crédito Mastercard",
    "cartão de crédito mastercard":    "Crédito Mastercard",
    "crédito visa":                    "Crédito Visa",
    "crédito nubank":                  "Crédito Nubank",
    "crédito latam pass":              "Crédito Latam Pass",
    "crédito itaú multi pontos":       "Crédito Itaú Multi Pontos",
}

# Rows to skip (header/summary labels in col B)
SKIP_B = {
    "resumo anual", "saldo atual", "renda mensal", "item", "total",
    "despesas mensais", "tipo", "porcentagem da renda gasta",
    "rótulos de linha", "resumo", "grand total",
}

MONTH_RE = re.compile(r"^(\d{2})\.")  # "01. Janeiro" → group 1 = "01"

# Normalise category names that changed over the years
CAT_ALIAS = {
    "jogos":      "Games",
    "uber / 99":  "Uber/99",
    "cuidados pessoais": "Cuidados Pessoais",
    "despesas carro":    "Despesas Carro",
    "despesas casa":     "Despesas Casa",
    "despesas empresa":  "Despesas Empresa",
    "despesas terreno":  "Despesas Terreno",
}

# ── helpers ──────────────────────────────────────────────────────────────────

def open_xlsx(path: Path):
    with open(path, "rb") as f:
        try:
            office = msoffcrypto.OfficeFile(f)
            office.load_key(password=PASSWORD)
            buf = io.BytesIO()
            office.decrypt(buf)
        except Exception:
            f.seek(0)
            buf = io.BytesIO(f.read())
    buf.seek(0)
    return openpyxl.load_workbook(buf, data_only=True)


def to_date_str(val, fallback_year: int, fallback_month: int) -> str | None:
    if isinstance(val, (datetime, date)):
        d = val if isinstance(val, date) else val.date()
        # Dates before 2000 almost certainly have the wrong year due to a cell
        # storing only the day number (e.g. 19 → 1900-01-19 instead of 2020-01-19).
        # Replace year and month with the sheet's fallback values.
        if d.year < 2000:
            import calendar
            last = calendar.monthrange(fallback_year, fallback_month)[1]
            day = min(d.day, last)
            return date(fallback_year, fallback_month, day).isoformat()
        return d.isoformat()
    return None


def coerce_amount(val):
    """Return a float amount from val, handling cells mis-typed as datetime by Excel."""
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, (datetime, date)):
        # The cell has a numeric value stored with a date format; convert back to serial.
        d = val.date() if isinstance(val, datetime) else val
        t = (val.hour*3600 + val.minute*60 + val.second + val.microsecond/1e6
             if isinstance(val, datetime) else 0)
        days = (d - date(1900, 1, 1)).days + 1
        if d >= date(1900, 3, 1):  # Excel's phantom 1900-02-29 (serial 60)
            days += 1
        return days + t / 86400
    return None


def payment_date(year: int, month: int, due_day: int) -> str:
    """Return YYYY-MM-DD for due_day clamped to last day of month."""
    last = calendar.monthrange(year, month)[1]
    day = min(due_day, last)
    return date(year, month, day).isoformat()


# ── parser ───────────────────────────────────────────────────────────────────

def parse_sheet(ws, year: int, month: int):
    entries      = []
    transactions = []

    in_income   = False
    in_expense  = False

    for raw_row in ws.iter_rows(values_only=True):
        b = raw_row[1]  # col B

        # Section headers
        if isinstance(b, str):
            bl = b.strip().lower()
            if "renda mensal" in bl:
                in_income  = True
                in_expense = False
                continue
            if "despesas mensais" in bl:
                in_income  = False
                in_expense = True
                continue
            # Fallback: detect expense section from its column header row
            # (some months are missing the "DESPESAS MENSAIS" label)
            if bl == "tipo" and isinstance(raw_row[2], str) and raw_row[2].strip().lower() == "item":
                in_income  = False
                in_expense = True
                continue
            if bl == "total" and in_income:
                in_income = False
                continue
            if bl == "total" and in_expense:
                in_expense = False
                continue

        # ── Income row ────────────────────────────────────────────────────
        if in_income:
            item    = b                 # col B = item/description
            dt_val  = raw_row[2]        # col C = date
            amount  = raw_row[3]        # col D = amount

            if not item or not isinstance(item, str):
                continue
            if item.strip().lower() in SKIP_B:
                continue
            amount = coerce_amount(amount)
            if not amount:
                continue

            dt_str = to_date_str(dt_val, year, month) or date(year, month, 1).isoformat()

            entries.append({
                "owner_id":    OWNER_ID,
                "description": item.strip(),
                "amount":      round(float(amount), 2),
                "date":        dt_str,
                "status":      "REALIZED",
                "labels":      [],
            })

        # ── Expense row ───────────────────────────────────────────────────
        if in_expense:
            tipo    = b                 # col B = tipo (card / Débito)
            cat     = raw_row[2]        # col C = category
            dt_val  = raw_row[3]        # col D = date (purchase date)
            desc    = raw_row[4]        # col E = description
            amount  = raw_row[5]        # col F = amount

            if not tipo or not isinstance(tipo, str):
                continue
            tipo_l = tipo.strip().lower()
            if tipo_l in SKIP_B:
                continue
            if tipo_l not in TIPO_MAP:
                continue
            amount = coerce_amount(amount)
            if not amount:
                continue

            card_name = TIPO_MAP[tipo_l]   # None = debit
            purchase_dt = to_date_str(dt_val, year, month)

            if card_name:
                due_day = CARD_DUE.get(card_name.lower(), 10)
                bill_dt  = payment_date(year, month, due_day)
                purch    = purchase_dt or bill_dt
            else:
                # Debit: date = purchase date, no purchase_date field
                bill_dt  = purchase_dt or date(year, month, 1).isoformat()
                purch    = None

            cat_str = (cat or "").strip() if isinstance(cat, str) else ""
            cat_str = CAT_ALIAS.get(cat_str.lower(), cat_str)

            transactions.append({
                "owner_id":         OWNER_ID,
                "description":      (desc or cat or tipo).strip(),
                "amount":           round(float(amount), 2),
                "date":             bill_dt,
                "purchase_date":    purch,
                "category_name":    cat_str,
                "credit_card_name": card_name,
                "status":           "REALIZED",
                "labels":           [],
            })

    return entries, transactions


def parse_workbook(path: Path, year: int):
    wb = open_xlsx(path)
    all_entries      = []
    all_transactions = []

    for sheet_name in wb.sheetnames:
        m = MONTH_RE.match(sheet_name)
        if not m:
            continue
        month = int(m.group(1))
        ws = wb[sheet_name]
        e, t = parse_sheet(ws, year, month)
        all_entries.extend(e)
        all_transactions.extend(t)
        print(f"  {year}/{month:02d} {sheet_name}: {len(e)} entries, {len(t)} transactions")

    return all_entries, all_transactions


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    # Find all xlsx files and deduplicate (keep newest by mtime per year)
    year_files: dict[int, Path] = {}
    for f in sorted(UPLOADS_DIR.glob("*-Or_amento_Anual__*.xlsx")):
        m = re.search(r"(\d{4})\.xlsx$", f.name)
        if not m: continue
        year = int(m.group(1))
        # keep most recently modified file for each year
        if year not in year_files or f.stat().st_mtime > year_files[year].stat().st_mtime:
            year_files[year] = f

    # Also check Orc_amento variant
    for f in sorted(UPLOADS_DIR.glob("*-Orc_amento_Anual__*.xlsx")):
        m = re.search(r"(\d{4})\.xlsx$", f.name)
        if not m: continue
        year = int(m.group(1))
        if year not in year_files or f.stat().st_mtime > year_files[year].stat().st_mtime:
            year_files[year] = f

    print(f"Encontrados {len(year_files)} arquivos: {sorted(year_files)}\n")

    all_entries      = []
    all_transactions = []

    for year in sorted(year_files):
        path = year_files[year]
        print(f"Processando {year} ({path.name})…")
        e, t = parse_workbook(path, year)
        all_entries.extend(e)
        all_transactions.extend(t)
        print(f"  → subtotal: {len(e)} entries, {len(t)} transactions\n")

    result = {
        "meta": {"opening_balance": 0},
        "entries":      all_entries,
        "transactions": all_transactions,
    }

    OUT_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(f"\n✅ {len(all_entries)} entries + {len(all_transactions)} transactions → {OUT_FILE}")


if __name__ == "__main__":
    main()
