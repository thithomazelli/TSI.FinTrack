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
UPLOADS_DIR = Path(r"D:\Google Drive\Arquivos Thiago\Meus Gastos\Orçamentos encerrados")
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


def to_date_str(val, fallback_year: int, fallback_month: int, enforce_month: bool = False) -> str | None:
    """Convert a cell value to an ISO date string.

    enforce_month=True: force the result into fallback_year/fallback_month (used for
    debit transactions whose date must belong to the sheet's month).
    """
    if isinstance(val, (datetime, date)):
        d = val if isinstance(val, date) else val.date()
        # Dates before 2000 almost certainly have the wrong year due to a cell
        # storing only the day number (e.g. 19 → 1900-01-19 instead of 2020-01-19).
        if d.year < 2000:
            last = calendar.monthrange(fallback_year, fallback_month)[1]
            return date(fallback_year, fallback_month, min(d.day, last)).isoformat()
        if enforce_month and (d.year != fallback_year or d.month != fallback_month):
            last = calendar.monthrange(fallback_year, fallback_month)[1]
            return date(fallback_year, fallback_month, min(d.day, last)).isoformat()
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

# Months after which 2026 entries/transactions become PROJECTED
PROJECTED_FROM = (2026, 7)  # July 2026 onwards

# Savings movements before this year are ignored (data histórica incompleta)
SAVINGS_MIN_YEAR = 2015

def row_status(year: int, month: int) -> str:
    if (year, month) >= PROJECTED_FROM:
        return "PROJECTED"
    return "REALIZED"


def parse_sheet(ws, year: int, month: int):
    entries      = []
    transactions = []
    savings      = []
    status       = row_status(year, month)

    in_income   = False
    in_expense  = False

    for row_cells in ws.iter_rows():
        row_num = row_cells[0].row
        raw_row = tuple(c.value for c in row_cells)
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

            dt_str = to_date_str(dt_val, year, month, enforce_month=True) or date(year, month, calendar.monthrange(year, month)[1]).isoformat()

            entries.append({
                "owner_id":    OWNER_ID,
                "description": item.strip(),
                "amount":      round(float(amount), 2),
                "date":        dt_str,
                "status":      status,
                "labels":      [],
                "position":    row_num,
            })

            # Renda com item == "Poupança" → renomeia descrição e registra retirada
            if item.strip().lower() == "poupança":
                entries[-1]["description"] = "Resgate Poupança"
                if year >= SAVINGS_MIN_YEAR:
                    savings.append({
                        "owner_id":    OWNER_ID,
                        "description": "Resgate Poupança",
                        "amount":      round(abs(float(amount)), 2),
                        "date":        dt_str,
                        "type":        "WITHDRAWAL",
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

            if card_name:
                # Credit: purchase date may be from previous month (normal for CC billing)
                purchase_dt = to_date_str(dt_val, year, month)
                due_day = CARD_DUE.get(card_name.lower(), 10)
                bill_dt  = payment_date(year, month, due_day)
                purch    = purchase_dt or bill_dt
            else:
                # Debit: date must belong to the sheet's month — enforce it
                purchase_dt = to_date_str(dt_val, year, month, enforce_month=True)
                bill_dt  = purchase_dt or date(year, month, calendar.monthrange(year, month)[1]).isoformat()
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
                "status":           status,
                "labels":           [],
                "position":         row_num,
            })

    # ── Savings: despesas categoria "Poupança" → DEPOSIT (apenas >= 2015) ───
    if year >= SAVINGS_MIN_YEAR:
        for t in transactions:
            if (t.get("category_name") or "").lower() != "poupança":
                continue
            savings.append({
                "owner_id":    OWNER_ID,
                "description": t["description"],
                "amount":      round(abs(t["amount"]), 2),
                "date":        t.get("purchase_date") or t["date"],
                "type":        "DEPOSIT",
            })

    return entries, transactions, savings


def parse_workbook(path: Path, year: int):
    wb = open_xlsx(path)
    all_entries      = []
    all_transactions = []
    all_savings      = []

    for sheet_name in wb.sheetnames:
        m = MONTH_RE.match(sheet_name)
        if not m:
            continue
        month = int(m.group(1))
        ws = wb[sheet_name]
        e, t, s = parse_sheet(ws, year, month)
        yr_str = str(year)
        # Only keep records whose date belongs to this workbook's year to avoid
        # duplicates when a previous year's file contains projected future months.
        e = [x for x in e if x["date"].startswith(yr_str)]
        t = [x for x in t if x["date"].startswith(yr_str)]
        all_entries.extend(e)
        all_transactions.extend(t)
        all_savings.extend(s)
        dep  = sum(1 for x in s if x["type"] == "DEPOSIT")
        wdw  = sum(1 for x in s if x["type"] == "WITHDRAWAL")
        print(f"  {year}/{month:02d} {sheet_name}: {len(e)} entries, {len(t)} transactions, {len(s)} savings ({dep}D/{wdw}W)")

    return all_entries, all_transactions, all_savings


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    # Find all xlsx files with a 4-digit year anywhere in the name
    year_files: dict[int, Path] = {}
    for f in sorted(UPLOADS_DIR.glob("*.xlsx")):
        if f.name.startswith("~$"): continue  # skip Excel temp/lock files
        m = re.search(r"(\d{4})", f.name)
        if not m: continue
        year = int(m.group(1))
        if year < 2000 or year > 2100: continue
        if year not in year_files or f.stat().st_mtime > year_files[year].stat().st_mtime:
            year_files[year] = f

    print(f"Encontrados {len(year_files)} arquivos:")
    for y, p in sorted(year_files.items()):
        print(f"  {y} → {p.name}")
    print()

    all_entries      = []
    all_transactions = []
    all_savings      = []

    for year in sorted(year_files):
        path = year_files[year]
        print(f"Processando {year} ({path.name})…")
        e, t, s = parse_workbook(path, year)
        all_entries.extend(e)
        all_transactions.extend(t)
        all_savings.extend(s)
        print(f"  → subtotal: {len(e)} entries, {len(t)} transactions, {len(s)} savings\n")

    result = {
        "meta": {"opening_balance": -305, "opened_at": "2009-05-01"},
        "entries":      all_entries,
        "transactions": all_transactions,
        "savings":      all_savings,
    }

    total_dep_n   = sum(1 for s in all_savings if s["type"] == "DEPOSIT")
    total_wdw_n   = sum(1 for s in all_savings if s["type"] == "WITHDRAWAL")
    total_dep_amt = sum(s["amount"] for s in all_savings if s["type"] == "DEPOSIT")
    total_wdw_amt = sum(s["amount"] for s in all_savings if s["type"] == "WITHDRAWAL")
    OUT_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"\n✅ {len(all_entries)} entries + {len(all_transactions)} transactions")
    print(f"   savings: {len(all_savings)} total")
    print(f"   DEPOSIT  : {total_dep_n:4d} movimentos  R$ {total_dep_amt:,.2f}")
    print(f"   WITHDRAWAL: {total_wdw_n:4d} movimentos  R$ {total_wdw_amt:,.2f}")
    print(f"   SALDO     :                  R$ {total_dep_amt - total_wdw_amt:,.2f}")
    print(f"   → {OUT_FILE}")


if __name__ == "__main__":
    main()
