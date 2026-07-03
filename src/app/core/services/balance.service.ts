import { Injectable, inject, signal } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { AuthService } from '../auth/auth.service';

export interface BalanceSummary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  currentBill: number;
}

@Injectable({ providedIn: 'root' })
export class BalanceService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  readonly version = signal(0);
  invalidate(): void { this.version.update(v => v + 1); }

  private get ownerId(): string { return this.auth.currentUser!.id; }

  /** Saldo realizado acumulado — apenas registros REALIZED (todo o histórico). */
  getAvailableBalance(): Observable<number> {
    return from(
      this.supabase.client
        .from('v_available_balance')
        .select('available')
        .eq('owner_id', this.ownerId)
        .maybeSingle()
    ).pipe(map(res => Number((res.data as { available: number } | null)?.available ?? 0)));
  }

  /**
   * Saldo do mês (todos os status): entradas do mês - despesas do mês.
   * Regra A (mês passado) e Regra B projetado (mês corrente).
   */
  getMonthBalance(year: number, month: number): Observable<number> {
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    const uid = this.ownerId;
    return from(Promise.all([
      this.supabase.client.from('entries').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end).range(0, 9999),
      this.supabase.client.from('transactions').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end).range(0, 9999),
    ])).pipe(map(([entries, txs]) => {
      const income   = (entries.data ?? []).reduce((s: number, e: { amount: number }) => s + e.amount, 0);
      const expenses = (txs.data ?? []).reduce((s: number, t: { amount: number }) => s + t.amount, 0);
      return income - expenses;
    }));
  }

  /**
   * Saldo acumulado de TODOS os registros (qualquer status) até endDate.
   * Usa RPC server-side para evitar o limite de 1000 linhas do PostgREST.
   */
  getBalanceUpTo(endDate: string): Observable<number> {
    return from(
      this.supabase.client.rpc('get_balance_up_to', { end_date: endDate })
    ).pipe(map(res => Number(res.data ?? 0)));
  }

  /** Saldo projetado acumulado (realized + projected), todo o histórico. */
  getProjectedBalance(): Observable<number> {
    return from(
      this.supabase.client
        .from('v_projected_balance')
        .select('projected')
        .eq('owner_id', this.ownerId)
        .maybeSingle()
    ).pipe(map(res => Number((res.data as { projected: number } | null)?.projected ?? 0)));
  }

  getSummary(year: number, month: number): Observable<BalanceSummary> {
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    const uid = this.ownerId;
    return from(Promise.all([
      this.supabase.client.from('entries').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end).eq('status', 'REALIZED'),
      this.supabase.client.from('transactions').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end).eq('status', 'REALIZED'),
    ])).pipe(map(([entriesRes, txRes]) => {
      const totalIncome   = (entriesRes.data ?? []).reduce((s, e) => s + e.amount, 0);
      const totalExpenses = (txRes.data ?? []).reduce((s, t) => s + t.amount, 0);
      return { totalIncome, totalExpenses, balance: totalIncome - totalExpenses, currentBill: totalExpenses };
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
