import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { TransactionService } from './transaction.service';
import { EntryService } from './entry.service';
import { GoalService } from './goal.service';
import { CategoryService } from './category.service';
import { CreditCardService } from './credit-card.service';
import { CreditCardBillService } from './credit-card-bill.service';
import { Transaction } from '../models/interfaces/transaction.interface';
import { Entry } from '../models/interfaces/entry.interface';
import { Goal } from '../models/interfaces/goal.interface';
import { Category } from '../models/interfaces/category.interface';
import { CreditCard } from '../models/interfaces/credit-card.interface';
import { CreditCardBill } from '../models/interfaces/credit-card-bill.interface';
import { TransactionStatus } from '../models/enums/transaction-status.enum';
import { BillStatus } from '../models/enums/bill-status.enum';

export type AlertLevel = 'info' | 'warning' | 'danger';

export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
}

@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly transactionService = inject(TransactionService);
  private readonly entryService = inject(EntryService);
  private readonly goalService = inject(GoalService);
  private readonly categoryService = inject(CategoryService);
  private readonly cardService = inject(CreditCardService);
  private readonly billService = inject(CreditCardBillService);

  getAlerts(year: number, month: number): Observable<Alert[]> {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    return forkJoin({
      transactions: this.transactionService.getByMonth({ year, month }),
      prevTransactions: this.transactionService.getByMonth({ year: prevYear, month: prevMonth }),
      entries: this.entryService.getByMonth({ year, month }),
      goals: this.goalService.getByMonth(year, month),
      categories: this.categoryService.getAll(),
      cards: this.cardService.getAll(false),
      bills: this.billService.getByMonth(year, month),
    }).pipe(
      map(({ transactions, prevTransactions, entries, goals, categories, cards, bills }) =>
        this.compute(year, month, transactions, prevTransactions, entries, goals, categories, cards, bills)
      )
    );
  }

  private compute(
    year: number,
    month: number,
    transactions: Transaction[],
    prevTransactions: Transaction[],
    entries: Entry[],
    goals: Goal[],
    categories: Category[],
    cards: CreditCard[],
    bills: CreditCardBill[]
  ): Alert[] {
    const alerts: Alert[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const realized = transactions.filter((t) => t.status === TransactionStatus.Realized);
    const allTx = transactions;

    const totalIncome = entries.reduce((s, e) => s + e.amount, 0);
    const totalRealizedExpense = realized.reduce((s, t) => s + t.amount, 0);
    const totalProjectedExpense = allTx.reduce((s, t) => s + t.amount, 0);

    // 1. Projected negative balance
    const projectedBalance = totalIncome - totalProjectedExpense;
    if (projectedBalance < 0) {
      alerts.push({
        id: 'projected-negative',
        level: 'danger',
        title: 'Saldo projetado negativo',
        detail: `O saldo projetado do mês é −R$ ${Math.abs(projectedBalance).toFixed(2).replace('.', ',')}`,
      });
    } else if (projectedBalance < totalIncome * 0.1 && totalIncome > 0) {
      alerts.push({
        id: 'projected-low',
        level: 'warning',
        title: 'Saldo projetado baixo',
        detail: `Restam apenas R$ ${projectedBalance.toFixed(2).replace('.', ',')} de saldo projetado`,
      });
    }

    // 2. Category goals — exceeded or close (≥80%)
    // Use allTx so future months with only PROJECTED transactions also trigger goal alerts
    const spentByCategory: Record<string, number> = {};
    for (const t of allTx) {
      if (t.categoryId) spentByCategory[t.categoryId] = (spentByCategory[t.categoryId] ?? 0) + t.amount;
    }

    for (const goal of goals) {
      const spent = spentByCategory[goal.categoryId] ?? 0;
      const cat = categories.find((c) => c.id === goal.categoryId);
      const catName = cat?.name ?? goal.categoryId;
      const pct = goal.monthlyLimit > 0 ? (spent / goal.monthlyLimit) * 100 : 0;

      if (spent > goal.monthlyLimit) {
        alerts.push({
          id: `goal-exceeded-${goal.id}`,
          level: 'danger',
          title: `Meta ultrapassada: ${catName}`,
          detail: `Gasto R$ ${spent.toFixed(2).replace('.', ',')} de R$ ${goal.monthlyLimit.toFixed(2).replace('.', ',')} (${pct.toFixed(0)}%)`,
        });
      } else if (pct >= 80) {
        alerts.push({
          id: `goal-near-${goal.id}`,
          level: 'warning',
          title: `Meta quase atingida: ${catName}`,
          detail: `${pct.toFixed(0)}% do limite mensal usado (R$ ${spent.toFixed(2).replace('.', ',')} / R$ ${goal.monthlyLimit.toFixed(2).replace('.', ',')})`,
        });
      }
    }

    // 3. Upcoming due dates (credit card bills) — within 3 and 7 days
    for (const bill of bills) {
      if (bill.status === BillStatus.Paid) continue;
      if (!bill.dueDate) continue;

      const due = new Date(bill.dueDate + 'T00:00:00');
      const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const card = cards.find((c) => c.id === bill.creditCardId);
      const cardName = card?.name ?? 'Cartão';

      if (diffDays < 0) {
        alerts.push({
          id: `bill-overdue-${bill.id}`,
          level: 'danger',
          title: `Fatura vencida: ${cardName}`,
          detail: `Fatura venceu há ${Math.abs(diffDays)} dia(s) — R$ ${(bill.totalAmount ?? 0).toFixed(2).replace('.', ',')}`,
        });
      } else if (diffDays <= 3) {
        alerts.push({
          id: `bill-due-3-${bill.id}`,
          level: 'danger',
          title: `Fatura vence em ${diffDays} dia(s): ${cardName}`,
          detail: `R$ ${(bill.totalAmount ?? 0).toFixed(2).replace('.', ',')} — vencimento ${bill.dueDate.slice(0, 10)}`,
        });
      } else if (diffDays <= 7) {
        alerts.push({
          id: `bill-due-7-${bill.id}`,
          level: 'warning',
          title: `Fatura vence em ${diffDays} dias: ${cardName}`,
          detail: `R$ ${(bill.totalAmount ?? 0).toFixed(2).replace('.', ',')} — vencimento ${bill.dueDate.slice(0, 10)}`,
        });
      }
    }

    // 4. Bill closed — summary notification
    for (const bill of bills) {
      if (bill.status === BillStatus.Closed) {
        const card = cards.find((c) => c.id === bill.creditCardId);
        alerts.push({
          id: `bill-closed-${bill.id}`,
          level: 'info',
          title: `Fatura fechada: ${card?.name ?? 'Cartão'}`,
          detail: `Total: R$ ${(bill.totalAmount ?? 0).toFixed(2).replace('.', ',')} — aguardando pagamento`,
        });
      }
    }

    // 5. Upcoming credit card closing dates (within 3 days)
    for (const card of cards) {
      const closingDate = new Date(year, month - 1, card.closingDay);
      if (closingDate < today) closingDate.setMonth(closingDate.getMonth() + 1);
      const diffDays = Math.ceil((closingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 3) {
        alerts.push({
          id: `closing-${card.id}`,
          level: 'info',
          title: `Fechamento em ${diffDays} dia(s): ${card.name}`,
          detail: `Cartão fecha dia ${card.closingDay} — lembre de lançar compras pendentes`,
        });
      }
    }

    // 6. Spending >30% above previous month (per category)
    const prevSpentByCategory: Record<string, number> = {};
    for (const t of prevTransactions) {
      if (t.categoryId) prevSpentByCategory[t.categoryId] = (prevSpentByCategory[t.categoryId] ?? 0) + t.amount;
    }

    for (const [catId, spent] of Object.entries(spentByCategory)) {
      const prev = prevSpentByCategory[catId] ?? 0;
      if (prev === 0 || spent <= prev) continue;
      const increase = ((spent - prev) / prev) * 100;
      if (increase >= 30) {
        const cat = categories.find((c) => c.id === catId);
        alerts.push({
          id: `above-avg-${catId}`,
          level: 'warning',
          title: `Gasto acima da média: ${cat?.name ?? catId}`,
          detail: `+${increase.toFixed(0)}% em relação ao mês anterior (R$ ${prev.toFixed(2).replace('.', ',')} → R$ ${spent.toFixed(2).replace('.', ',')})`,
        });
      }
    }

    // 7. Top 3 categories of the month (info)
    const topCats = Object.entries(spentByCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    if (topCats.length > 0 && totalProjectedExpense > 0) {
      const detail = topCats
        .map(([catId, amt]) => {
          const cat = categories.find((c) => c.id === catId);
          const pct = ((amt / totalProjectedExpense) * 100).toFixed(0);
          return `${cat?.name ?? catId}: R$ ${amt.toFixed(2).replace('.', ',')} (${pct}%)`;
        })
        .join(' · ');

      alerts.push({
        id: 'top-categories',
        level: 'info',
        title: 'Top 3 categorias do mês',
        detail,
      });
    }

    // 8. Month-over-month total comparison
    const prevTotal = Object.values(prevSpentByCategory).reduce((s, v) => s + v, 0);
    if (prevTotal > 0 && totalProjectedExpense > 0) {
      const diff = totalProjectedExpense - prevTotal;
      const diffPct = (diff / prevTotal) * 100;
      if (Math.abs(diffPct) >= 10) {
        alerts.push({
          id: 'mom-comparison',
          level: diff > 0 ? 'warning' : 'info',
          title: diff > 0 ? 'Gastos maiores que o mês anterior' : 'Gastos menores que o mês anterior',
          detail: `${diff > 0 ? '+' : ''}${diffPct.toFixed(0)}% em relação ao mês anterior (R$ ${prevTotal.toFixed(2).replace('.', ',')} → R$ ${totalProjectedExpense.toFixed(2).replace('.', ',')})`,
        });
      }
    }

    // Sort: danger first, then warning, then info
    const levelOrder: Record<AlertLevel, number> = { danger: 0, warning: 1, info: 2 };
    return alerts.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
  }
}
