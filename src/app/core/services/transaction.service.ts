import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { LoggingService } from './logging.service';
import { AuthService } from '../auth/auth.service';
import { Transaction } from '../models/interfaces/transaction.interface';
import { TransactionStatus } from '../models/enums/transaction-status.enum';

const TABLE = 'transactions';

export interface TransactionFilter {
  year: number;
  month: number;
  categoryId?: string;
  accountId?: string;
  creditCardId?: string;
  status?: TransactionStatus;
}

export interface CreateTransactionPayload {
  description: string;
  amount: number;
  date: string;
  purchaseDate?: string | null;
  categoryId: string | null;
  accountId: string | null;
  creditCardId: string | null;
  status: TransactionStatus;
  totalInstallments: number | null;
  recurringTemplateId: string | null;
  originalCurrency: string | null;
  originalAmount: number | null;
  exchangeRate: number | null;
  labels: string[];
}

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);
  private readonly auth = inject(AuthService);

  private get ownerId(): string {
    return this.auth.currentUser!.id;
  }

  getByMonth(filter: TransactionFilter): Observable<Transaction[]> {
    this.logger.debug('Fetching transactions', filter);
    const startDate = `${filter.year}-${String(filter.month).padStart(2, '0')}-01`;
    const endDate = new Date(filter.year, filter.month, 0)
      .toISOString()
      .split('T')[0];

    let query = this.supabase.client
      .from(TABLE)
      .select('*')
      .eq('owner_id', this.ownerId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (filter.categoryId) query = query.eq('category_id', filter.categoryId);
    if (filter.accountId) query = query.eq('account_id', filter.accountId);
    if (filter.creditCardId) query = query.eq('credit_card_id', filter.creditCardId);
    if (filter.status) query = query.eq('status', filter.status);

    return from(
      query.then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => this.toModel(r));
      })
    );
  }

  getByYear(year: number, status?: string): Observable<Transaction[]> {
    let query = this.supabase.client
      .from(TABLE)
      .select('id, date, amount, category_id, status')
      .eq('owner_id', this.ownerId)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`);
    if (status) query = query.eq('status', status);
    return from(
      query.then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => this.toModel(r));
      })
    );
  }

  create(payload: CreateTransactionPayload): Observable<Transaction[]> {
    this.logger.info('Creating transaction', payload.description);
    const ownerId = this.ownerId;

    if (payload.totalInstallments && payload.totalInstallments > 1) {
      return this.createInstallments(payload, ownerId);
    }

    return from(
      this.supabase.client
        .from(TABLE)
        .insert(this.toRow(payload, ownerId))
        .select()
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []).map((r: any) => this.toModel(r));
        })
    );
  }

  private createInstallments(
    payload: CreateTransactionPayload,
    ownerId: string
  ): Observable<Transaction[]> {
    const groupId = crypto.randomUUID();
    const total = payload.totalInstallments!;
    const baseDate = new Date(payload.date + 'T00:00:00');
    const installmentAmount = Math.round((payload.amount / total) * 100) / 100;

    const pad = (n: number) => String(n).padStart(2, '0');

    const rows = Array.from({ length: total }, (_, i) => {
      const installDate = new Date(baseDate);
      installDate.setMonth(installDate.getMonth() + i);
      const num = i + 1;
      const description = `${payload.description} - ${pad(num)}/${pad(total)}`;
      return {
        ...this.toRow(
          { ...payload, description, amount: installmentAmount, totalInstallments: total },
          ownerId
        ),
        installment_number: num,
        total_installments: total,
        installment_group_id: groupId,
        date: installDate.toISOString().split('T')[0],
      };
    });

    return from(
      this.supabase.client
        .from(TABLE)
        .insert(rows)
        .select()
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []).map((r: any) => this.toModel(r));
        })
    );
  }

  update(id: string, payload: Partial<CreateTransactionPayload>): Observable<Transaction> {
    this.logger.info('Updating transaction', id);
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.description !== undefined) row['description'] = payload.description;
    if (payload.amount !== undefined) row['amount'] = payload.amount;
    if (payload.date !== undefined) row['date'] = payload.date;
    if (payload.purchaseDate !== undefined) row['purchase_date'] = payload.purchaseDate ?? null;
    if (payload.categoryId !== undefined) row['category_id'] = payload.categoryId;
    if (payload.accountId !== undefined) row['account_id'] = payload.accountId;
    if (payload.creditCardId !== undefined) row['credit_card_id'] = payload.creditCardId;
    if (payload.status !== undefined) row['status'] = payload.status;
    if (payload.labels !== undefined) row['labels'] = payload.labels;
    if (payload.originalCurrency !== undefined) row['original_currency'] = payload.originalCurrency;
    if (payload.originalAmount !== undefined) row['original_amount'] = payload.originalAmount;
    if (payload.exchangeRate !== undefined) row['exchange_rate'] = payload.exchangeRate;

    return from(
      this.supabase.client
        .from(TABLE)
        .update(row)
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

  getByYear(year: number, status?: string): Observable<Transaction[]> {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    return from(
      this.supabase.client
        .from(TABLE)
        .select('id, date, amount, category_id, status')
        .eq('owner_id', this.ownerId)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('status', status ?? TransactionStatus.Realized)
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []).map((r: any) => ({ ...this.toModel(r) }));
        })
    );
  }

  getAllCreditCard(): Observable<Transaction[]> {
    return from(
      this.supabase.client
        .from(TABLE)
        .select('*')
        .eq('owner_id', this.ownerId)
        .not('credit_card_id', 'is', null)
        .order('date', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []).map((r: any) => this.toModel(r));
        })
    );
  }

  bulkUpdateStatusByCardMonth(creditCardId: string, year: number, month: number, status: TransactionStatus): Observable<void> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    return from(
      this.supabase.client
        .from(TABLE)
        .update({ status, updated_at: new Date().toISOString() })
        .eq('owner_id', this.ownerId)
        .eq('credit_card_id', creditCardId)
        .gte('date', startDate)
        .lte('date', endDate)
        .then(({ error }) => { if (error) throw error; })
    );
  }

  delete(id: string): Observable<void> {
    this.logger.info('Deleting transaction', id);
    return from(
      this.supabase.client
        .from(TABLE)
        .delete()
        .eq('id', id)
        .eq('owner_id', this.ownerId)
        .then(({ error }) => {
          if (error) throw error;
        })
    );
  }

  updatePosition(id: string, position: number): Observable<void> {
    return from(
      this.supabase.client
        .from(TABLE)
        .update({ position, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('owner_id', this.ownerId)
        .then(({ error }) => { if (error) throw error; })
    );
  }

  private toModel(r: any): Transaction {
    return {
      id: r.id, ownerId: r.owner_id, description: r.description,
      amount: r.amount, date: r.date, purchaseDate: r.purchase_date ?? null, status: r.status,
      categoryId: r.category_id, accountId: r.account_id,
      creditCardId: r.credit_card_id, creditCardBillId: r.credit_card_bill_id,
      installmentNumber: r.installment_number, totalInstallments: r.total_installments,
      installmentGroupId: r.installment_group_id, recurringTemplateId: r.recurring_template_id,
      originalCurrency: r.original_currency, originalAmount: r.original_amount,
      exchangeRate: r.exchange_rate, paymentDate: r.payment_date,
      paymentMethod: r.payment_method, labels: r.labels ?? [],
      position: r.position ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  private toRow(
    payload: CreateTransactionPayload,
    ownerId: string
  ): Record<string, unknown> {
    return {
      owner_id: ownerId,
      description: payload.description,
      amount: payload.amount,
      date: payload.date,
      purchase_date: payload.purchaseDate ?? null,
      category_id: payload.categoryId,
      account_id: payload.accountId,
      credit_card_id: payload.creditCardId,
      status: payload.status,
      installment_number: null,
      total_installments: null,
      installment_group_id: null,
      recurring_template_id: payload.recurringTemplateId,
      original_currency: payload.originalCurrency,
      original_amount: payload.originalAmount,
      exchange_rate: payload.exchangeRate,
      labels: payload.labels,
    };
  }
}
