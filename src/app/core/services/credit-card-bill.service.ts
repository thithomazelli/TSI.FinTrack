import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { LoggingService } from './logging.service';
import { AuthService } from '../auth/auth.service';
import { CreditCardBill } from '../models/interfaces/credit-card-bill.interface';
import { BillStatus } from '../models/enums/bill-status.enum';

const TABLE = 'credit_card_bills';

@Injectable({ providedIn: 'root' })
export class CreditCardBillService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);
  private readonly auth = inject(AuthService);

  private get ownerId(): string {
    return this.auth.currentUser!.id;
  }

  getByMonth(year: number, month: number): Observable<CreditCardBill[]> {
    this.logger.debug('Fetching bills', year, month);
    return from(
      this.supabase.client
        .from(TABLE)
        .select('*, credit_cards(name, last_four_digits)')
        .eq('owner_id', this.ownerId)
        .eq('year', year)
        .eq('month', month)
        .order('created_at')
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []).map((r: any) => this.toModel(r));
        })
    );
  }

  private toModel(r: any): CreditCardBill & { credit_cards?: { name: string; last_four_digits: string } } {
    return {
      id: r.id,
      ownerId: r.owner_id,
      creditCardId: r.credit_card_id,
      year: r.year,
      month: r.month,
      totalAmount: Number(r.total_amount ?? 0),
      status: r.status as BillStatus,
      closingDate: r.closing_date ?? null,
      dueDate: r.due_date ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      credit_cards: r.credit_cards ?? undefined,
    };
  }

  getByCard(creditCardId: string): Observable<CreditCardBill[]> {
    return from(
      this.supabase.client
        .from(TABLE)
        .select('*')
        .eq('owner_id', this.ownerId)
        .eq('credit_card_id', creditCardId)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as CreditCardBill[];
        })
    );
  }

  upsert(payload: Pick<CreditCardBill, 'creditCardId' | 'year' | 'month'>): Observable<CreditCardBill> {
    return from(
      this.supabase.client
        .from(TABLE)
        .upsert(
          {
            owner_id: this.ownerId,
            credit_card_id: payload.creditCardId,
            year: payload.year,
            month: payload.month,
          },
          { onConflict: 'credit_card_id,year,month' }
        )
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return this.toModel(data);
        })
    );
  }

  /** Mark all OPEN bills up to (and including) the given year/month as CLOSED. */
  closeHistoricalBills(upToYear: number, upToMonth: number): Observable<void> {
    return from(
      this.supabase.client
        .from(TABLE)
        .update({ status: BillStatus.Closed, updated_at: new Date().toISOString() })
        .eq('owner_id', this.ownerId)
        .eq('status', BillStatus.Open)
        .or(`year.lt.${upToYear},and(year.eq.${upToYear},month.lte.${upToMonth})`)
        .then(({ error }) => { if (error) throw error; })
    );
  }

  updateStatus(id: string, status: BillStatus): Observable<CreditCardBill> {
    this.logger.info('Updating bill status', id, status);
    return from(
      this.supabase.client
        .from(TABLE)
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('owner_id', this.ownerId)
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return this.toModel(data);
        })
    );
  }
}
