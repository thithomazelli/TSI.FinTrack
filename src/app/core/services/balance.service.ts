import { Injectable, inject, signal } from '@angular/core';
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
  async getAvailableBalance(): Promise<number> {
    const res = await this.supabase.client
      .from('v_available_balance')
      .select('available')
      .eq('owner_id', this.ownerId)
      .maybeSingle();
    return Number((res.data as { available: number } | null)?.available ?? 0);
  }

  /**
   * Saldo do mês (todos os status): entradas do mês - despesas do mês.
   * Regra A (mês passado) e Regra B projetado (mês corrente).
   */
  async getMonthBalance(year: number, month: number): Promise<number> {
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    const uid = this.ownerId;
    const [entries, txs] = await Promise.all([
      this.supabase.client.from('entries').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end).range(0, 9999),
      this.supabase.client.from('transactions').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end).range(0, 9999),
    ]);
    const income   = (entries.data ?? []).reduce((s: number, e: { amount: number }) => s + e.amount, 0);
    const expenses = (txs.data ?? []).reduce((s: number, t: { amount: number }) => s + t.amount, 0);
    return income - expenses;
  }

  /**
   * Saldo acumulado de TODOS os registros (qualquer status) até endDate.
   * Usa RPC server-side para evitar o limite de 1000 linhas do PostgREST.
   */
  async getBalanceUpTo(endDate: string): Promise<number> {
    const res = await this.supabase.client.rpc('get_balance_up_to', { end_date: endDate });
    return Number(res.data ?? 0);
  }

  /** Saldo projetado acumulado (realized + projected), todo o histórico. */
  async getProjectedBalance(): Promise<number> {
    const res = await this.supabase.client
      .from('v_projected_balance')
      .select('projected')
      .eq('owner_id', this.ownerId)
      .maybeSingle();
    return Number((res.data as { projected: number } | null)?.projected ?? 0);
  }

  async getSummary(year: number, month: number): Promise<BalanceSummary> {
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    const uid = this.ownerId;
    const [entriesRes, txRes] = await Promise.all([
      this.supabase.client.from('entries').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end).eq('status', 'REALIZED'),
      this.supabase.client.from('transactions').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end).eq('status', 'REALIZED'),
    ]);
    const totalIncome   = (entriesRes.data ?? []).reduce((s, e) => s + e.amount, 0);
    const totalExpenses = (txRes.data ?? []).reduce((s, t) => s + t.amount, 0);
    return { totalIncome, totalExpenses, balance: totalIncome - totalExpenses, currentBill: totalExpenses };
  }

  /**
   * Saldo acumulado dentro de um intervalo.
   * Inclui accounts.balance apenas das contas cuja opened_at cai dentro do período.
   */
  async getBalanceInRange(startDate: string, endDate: string): Promise<number> {
    const res = await this.supabase.client.rpc('get_balance_in_range', { start_date: startDate, end_date: endDate });
    return Number(res.data ?? 0);
  }

  /** Totais de entradas e saídas para um período via RPC — sem limite de linhas. */
  async getPeriodTotals(startDate: string, endDate: string): Promise<{ totalEntries: number; totalTransactions: number }> {
    const res = await this.supabase.client.rpc('get_period_totals', { start_date: startDate, end_date: endDate });
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    return {
      totalEntries: Number(row?.total_entries ?? 0),
      totalTransactions: Number(row?.total_transactions ?? 0),
    };
  }

  async getAvailableBalanceByAccount(accountId: string, openingBalance: number): Promise<number> {
    const uid = this.ownerId;
    const [entriesRes, txRes] = await Promise.all([
      this.supabase.client.from('entries').select('amount').eq('owner_id', uid).eq('account_id', accountId).eq('status', 'REALIZED'),
      this.supabase.client.from('transactions').select('amount').eq('owner_id', uid).eq('account_id', accountId).eq('status', 'REALIZED'),
    ]);
    const income   = (entriesRes.data ?? []).reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0);
    const expenses = (txRes.data ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0);
    return openingBalance + income - expenses;
  }

  async getBalanceUpToByAccount(endDate: string, accountId: string, openingBalance: number): Promise<number> {
    const uid = this.ownerId;
    const [entriesRes, txRes] = await Promise.all([
      this.supabase.client.from('entries').select('amount').eq('owner_id', uid).eq('account_id', accountId).lte('date', endDate),
      this.supabase.client.from('transactions').select('amount').eq('owner_id', uid).eq('account_id', accountId).lte('date', endDate),
    ]);
    const income   = (entriesRes.data ?? []).reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0);
    const expenses = (txRes.data ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0);
    return openingBalance + income - expenses;
  }

  async getCurrentBillByCard(creditCardId: string, year: number, month: number): Promise<number> {
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    const res = await this.supabase.client.from('transactions').select('amount').eq('owner_id', this.ownerId).eq('credit_card_id', creditCardId).gte('date', start).lte('date', end);
    return (res.data ?? []).reduce((s, t) => s + t.amount, 0);
  }
}
