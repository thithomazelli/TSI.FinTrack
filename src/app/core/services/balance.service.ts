import { Injectable, inject, signal } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { AuthService } from '../auth/auth.service';

export interface BalanceSummary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  projectedBalance: number;
  currentBill: number;
}

@Injectable({ providedIn: 'root' })
export class BalanceService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  /** Increment to trigger balance card refresh across the app. */
  readonly version = signal(0);
  invalidate(): void { this.version.update(v => v + 1); }

  private get ownerId(): string { return this.auth.currentUser!.id; }

  /** Saldo realizado acumulado (todo o histórico). */
  getAvailableBalance(): Observable<number> {
    return from(
      this.supabase.client
        .from('v_available_balance')
        .select('available')
        .eq('owner_id', this.ownerId)
        .maybeSingle()
    ).pipe(map(res => Number((res.data as { available: number } | null)?.available ?? 0)));
  }

  /** Saldo projetado acumulado (realizado + projetado, todo o histórico). */
  getProjectedBalance(): Observable<number> {
    return from(
      this.supabase.client
        .from('v_projected_balance')
        .select('projected')
        .eq('owner_id', this.ownerId)
        .maybeSingle()
    ).pipe(map(res => Number((res.data as { projected: number } | null)?.projected ?? 0)));
  }

  /** Saldo projetado até uma data específica: realizado (todo histórico) + projetado até endDate. */
  getProjectedBalanceUpTo(endDate: string): Observable<number> {
    const uid = this.ownerId;
    return from(
      Promise.all([
        this.supabase.client.from('v_available_balance').select('available').eq('owner_id', uid).maybeSingle(),
        this.supabase.client.from('entries').select('amount').eq('owner_id', uid).eq('status', 'PROJECTED').lte('date', endDate),
        this.supabase.client.from('transactions').select('amount').eq('owner_id', uid).eq('status', 'PROJECTED').lte('date', endDate),
      ])
    ).pipe(map(([bal, entries, txs]) => {
      const realized = Number((bal.data as { available: number } | null)?.available ?? 0);
      const projIncome = (entries.data ?? []).reduce((s: number, e: { amount: number }) => s + e.amount, 0);
      const projExpenses = (txs.data ?? []).reduce((s: number, t: { amount: number }) => s + t.amount, 0);
      return realized + projIncome - projExpenses;
    }));
  }

  getSummary(year: number, month: number): Observable<BalanceSummary> {
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    const uid = this.ownerId;

    return from(Promise.all([
      this.supabase.client.from('entries').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end).eq('status', 'REALIZED'),
      this.supabase.client.from('transactions').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end).eq('status', 'REALIZED'),
      this.supabase.client.from('entries').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end),
      this.supabase.client.from('transactions').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end),
    ])).pipe(map(([entriesRes, txRes, allEntriesRes, allTxRes]) => {
      const totalIncome = (entriesRes.data ?? []).reduce((s, e) => s + e.amount, 0);
      const totalExpenses = (txRes.data ?? []).reduce((s, t) => s + t.amount, 0);
      const allIncome = (allEntriesRes.data ?? []).reduce((s, e) => s + e.amount, 0);
      const allExpenses = (allTxRes.data ?? []).reduce((s, t) => s + t.amount, 0);
      return { totalIncome, totalExpenses, balance: totalIncome - totalExpenses, projectedBalance: allIncome - allExpenses, currentBill: totalExpenses };
    }));
  }

  /** Saldo projetado: soma de todos os registros (qualquer status) até o final do mês informado. */
  getMonthBalance(year: number, month: number): Observable<number> {
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    const uid = this.ownerId;
    return from(Promise.all([
      this.supabase.client.from('entries').select('amount').eq('owner_id', uid).lte('date', end),
      this.supabase.client.from('transactions').select('amount').eq('owner_id', uid).lte('date', end),
    ])).pipe(map(([entries, txs]) => {
      const income = (entries.data ?? []).reduce((s: number, e: { amount: number }) => s + e.amount, 0);
      const expenses = (txs.data ?? []).reduce((s: number, t: { amount: number }) => s + t.amount, 0);
      return income - expenses;
    }));
  }

  getCurrentBillByCard(creditCardId: string, year: number, month: number): Observable<number> {
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    return from(
      this.supabase.client.from('transactions').select('amount').eq('owner_id', this.ownerId).eq('credit_card_id', creditCardId).gte('date', start).lte('date', end)
    ).pipe(map(res => (res.data ?? []).reduce((s, t) => s + t.amount, 0)));
  }
}
