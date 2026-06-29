import { Injectable, inject } from '@angular/core';
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

  private get ownerId(): string { return this.auth.currentUser!.id; }

  getSummary(year: number, month: number): Observable<BalanceSummary> {
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    const uid = this.ownerId;

    return from(Promise.all([
      this.supabase.client.from('entries').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end).eq('status', 'REALIZED'),
      this.supabase.client.from('transactions').select('amount').eq('owner_id', uid).gte('date', start).lte('date', end).eq('status', 'REALIZED'),
    ])).pipe(map(([entriesRes, txRes]) => {
      const totalIncome = (entriesRes.data ?? []).reduce((s, e) => s + e.amount, 0);
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
