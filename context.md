# TSI.FinTrack — Project Context

## Overview
Personal finance tracker for Thiago Thomazelli Ferreira and his wife.
Each user has their own financial profile. Users can invite others as family members with configurable roles (VIEWER or EDITOR).

## Tech Stack
- **Frontend:** Angular 17+ (Standalone Components, Signals, OnPush)
- **Backend/DB:** Supabase (PostgreSQL + Auth + RLS)
- **Hosting:** GitHub Pages
- **CI/CD:** GitHub Actions
- **Tests:** Jest (100% coverage required)
- **Styling:** SCSS

## Repository
- **GitHub user:** thithomazelli
- **Repo:** fintrack
- **Prefix:** tsi (component selector prefix)
- **Namespace:** TSI (company namespace)

## Supabase
- **Project URL:** https://rknjcrcvsetspfvexjsu.supabase.co
- **Anon key:** (user must paste from Supabase dashboard — Settings → API → anon public)

## Code Standards
- TypeScript strict mode — zero `any`
- English only — all code, variables, classes, files
- No comments — self-explanatory code only
- SOLID principles throughout
- Design patterns: Repository, Factory, Strategy, Observer
- Feature-based folder structure
- Smart/Dumb component separation
- Standalone components only — no NgModules
- OnPush change detection on all components
- RxJS with takeUntilDestroyed() — no memory leaks
- AsyncPipe always — no manual subscribe in templates
- shareReplay(1) for cached observables
- LoggingService always — never console.log directly
- Logs: debug/info/warn/error levels
- Unit tests: 100% coverage, Jest
- No magic numbers — named constants always

## Folder Structure
```
src/
├── app/
│   ├── core/
│   │   ├── auth/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── models/
│   │   │   ├── enums/
│   │   │   └── interfaces/
│   │   └── services/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── transactions/
│   │   ├── entries/
│   │   ├── credit-cards/
│   │   ├── import/
│   │   ├── savings/
│   │   ├── goals/
│   │   ├── reports/
│   │   └── settings/
│   │       ├── profile/
│   │       ├── family/
│   │       ├── accounts/
│   │       ├── credit-cards/
│   │       ├── categories/
│   │       ├── goals/
│   │       └── domains/
│   ├── shared/
│   │   ├── components/
│   │   ├── pipes/
│   │   ├── directives/
│   │   └── utils/
│   └── layout/
│       ├── header/
│       └── sidebar/
└── environments/
```

## Database Schema

### Core Tables
```sql
user_profiles         -- one per auth user
family_members        -- accepted invites (owner_id → member_id + role)
family_invites        -- pending invites by email
accounts              -- checking/savings accounts (owner_id)
credit_cards          -- credit cards (owner_id)
categories            -- expense categories (owner_id)
domain_lists          -- all configurable dropdown values (owner_id)
credit_card_bills     -- monthly bills per card (owner_id)
transactions          -- expenses/debits (owner_id)
entries               -- income/credits (owner_id)
recurring_templates   -- recurring transaction templates (owner_id)
savings_movements     -- savings deposits/withdrawals (owner_id)
goals                 -- monthly spending limits per category (owner_id)
```

### Permission Model
- All tables use `owner_id` (not family_id)
- RLS: owner has full access; family members have access based on role
- VIEWER: SELECT only
- EDITOR: SELECT + INSERT + UPDATE
- OWNER: full access including DELETE

### Domain Lists (configurable dropdowns)
All dropdown values stored in `domain_lists` table:
- `transaction_status` → Realizado (REALIZED), Projetado (PROJECTED) [system, rename only]
- `transaction_type` → Débito (DEBIT), Crédito (CREDIT) [system, rename only]
- `entry_type` → Salário, Reembolso, Transferência, Outro [fully editable]
- `account_type` → Conta Corrente, Poupança [system, rename only]
- `savings_movement_type` → Depósito, Resgate [system, rename only]
- `bill_status` → Aberta, Fechada, Paga [system, rename only]

### domain_lists table
```sql
id, owner_id, code, name, value, color, is_default, is_system, sort_order
```
- is_system = true → can rename but not delete
- is_system = false → full CRUD

## Features

### Phase 1 — Core
- Google + Apple OAuth (Supabase Auth)
- User profile creation on first login
- Dashboard with monthly summary
- Entries (income) — CRUD with recurring support
- Transactions (expenses) — CRUD with installments + recurring
- Credit card bills — per card, monthly, with detail view
- Accounts management
- Categories management
- Goals (monthly limits per category)
- Reports with dynamic charts (Chart.js)
- Settings area — all dropdowns configurable
- Family management — invite by email, set role, revoke

### Phase 2 — Import + Bot
- PDF parser for Itaú credit card bills (no AI)
- PDF parser for Itaú debit statement
- Telegram bot — notifications + quick entry + queries

### Phase 3 — Automation
- Apple Pay via iOS Shortcuts
- Advanced rule-based financial analysis

## Itaú PDF Structure (for parser)
Two cards identified:
- Latam Pass Black (final 2550) — larger bill
- Personnalitê (final 9367) — smaller bill

PDF sections:
1. Header: titular, card last 4 digits, posting date, due date, closing date, next closing forecast, total amount, credit limit
2. Pagamentos efetuados: DATE | DESCRIPTION | VALUE (negative)
3. Lançamentos compras e saques: DATE | ESTABLISHMENT [INSTALLMENT] | VALUE (2 lines: category + city)
   - Installment pattern: "ESTABLISHMENT XX/YY" where XX=current, YY=total
4. Lançamentos internacionais: DATE | ESTABLISHMENT | USD | BRL + exchange rate
5. Lançamentos produtos e serviços: DATE | DESCRIPTION | VALUE (PIX installments with principal + interest breakdown)
6. Compras parceladas próximas faturas: future installments for projection

## Charts (Phase 1)
Using Chart.js via ng2-charts:
1. % renda gasta por mês (gauge/bar with configurable target)
2. Despesas por categoria no mês (pie/horizontal bar)
3. Evolução mensal renda x despesa x saldo (dual line)
4. Ranking categorias no ano (vertical bars)
5. Fluxo de caixa projetado próximos meses (line)
6. Comparativo ano a ano por categoria (grouped bars)
7. Evolução de categoria específica (line, last 24 months)
8. Despesa por cartão/pagamento tipo (donut)
9. Média mensal por categoria (horizontal bar)
10. Calendário financeiro (vencimentos e faturas)
11. Evolução saldo poupança (line)

All charts with filters: period, year, category, account/card, status

## Rule-based Financial Alerts (no AI)
- Projected negative balance this month
- Category goal reached or exceeded
- Upcoming due dates (3 and 7 days)
- Credit card bill closed — summary notification
- Monthly auto-analysis on 1st of each month
- Spending X% above historical average per category
- Top 3 categories of the month
- Month-over-month comparison
- Year-over-year same month comparison

## Telegram Bot (Phase 2)
- Notifications: due dates, goals, bill summaries, monthly analysis
- Queries: current balance, savings balance, open bill by card, category spending, available by goal, month summary, projected balance
- Quick entry: "ifood 45.90 alimentação" → confirm with inline buttons

## Key Business Rules
1. Installments: system auto-generates all installments when one is created
2. Recurring: template generates isolated monthly instances (edit one without affecting others)
3. Credit card bill: transactions link to bill by card + month; bill shows as single line in statement with drill-down
4. Savings: separate area with deposit/withdrawal history and balance evolution
5. Investments: treated as regular expense (category: Investimentos) for now
6. Projected transactions: highlighted differently in UI (yellow tint, like spreadsheet)
7. International transactions: store original currency + exchange rate + converted BRL amount
8. PDF import: show preview for user review before confirming import
9. Family member sees owner's data based on role; cannot see other members' data
10. Archive (not delete) for accounts and credit cards to preserve history

## Default Categories (seed data)
Alimentação/Mercado, Assinaturas, Celular, Combustível, Convênio Médico,
Cuidados Pessoais, Despesas Carro, Despesas Casa, Despesas Empresa,
Despesas Terreno, Estudo, Empréstimo Bancário, Empréstimo Pessoal,
Enxoval, Farmácia, Games, Investimentos, Lazer, Médico, Pets,
Poupança, Presente, Roupas, Tarifas/Juros, TI, Transporte Público,
Uber/99, Viagem

## User Info
- Name: Thiago Thomazelli Ferreira
- Email: thiago.thomazelli@gmail.com
- GitHub: thithomazelli
- OS: Windows
- Experience: 20 years, Angular + .NET Core expert
- Learning: Next.js, AI/prompts

## Labels (Participants)

### Concept
Transactions and entries have an optional `labels` field to associate people with a financial movement.
Useful for tracking shared expenses, reimbursements, or identifying who participated in a transaction.

### Behavior
- Optional field on both `transactions` and `entries` tables
- Multi-select: one transaction can have multiple labels
- A person is created automatically the first time their name is typed and confirmed — no separate registration screen
- Two sources combined in the same autocomplete dropdown:
  - Previously used names (from `people` table — auto-suggested as user types)
  - Family members names (auto-suggested)
  - New free text name: user types and presses Enter to add — saved automatically to `people` table for future suggestions
- Stored as text array: `labels text[]` on transactions/entries
- Examples: ["Ana"], ["Emeric", "Samatec"], ["Léo", "Ana"]

### Database
```sql
-- People table: auto-populated, no manual registration screen
create table people (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references user_profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(owner_id, name)
);

-- Add to transactions and entries tables
labels text[] not null default '{}';
```

### UI behavior
- Autocomplete dropdown shows:
  1. Family member names (always on top)
  2. Previously used people names (sorted by usage frequency)
- User types a new name → press Enter → added as chip AND saved to people table automatically
- Selected labels shown as removable chips/badges
- No dedicated settings page for people — managed entirely through the field itself

### Reports integration
- Filter transactions/entries by label
- Summary view: total spent/received per label
- "quanto gastei com Emeric esse ano?"
- "quais entradas vieram da Ana?"
- "resumo por pessoa no mês"