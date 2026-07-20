import { Injectable, inject } from '@angular/core';
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
  /** When true, `amount` is already the per-installment value — do not divide. */
  installmentAmountIsFixed?: boolean;
  recurringTemplateId: string | null;
  originalCurrency: string | null;
  originalAmount: number | null;
  exchangeRate: number | null;
  labels: string[];
  position?: number | null;
}

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);
  private readonly auth = inject(AuthService);

  private get ownerId(): string {
    return this.auth.currentUser!.id;
  }

  async getByMonth(filter: TransactionFilter): Promise<Transaction[]> {
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
      .order('date', { ascending: true })
      .order('position', { ascending: true, nullsFirst: false });

    if (filter.categoryId) query = query.eq('category_id', filter.categoryId);
    if (filter.accountId) query = query.eq('account_id', filter.accountId);
    if (filter.creditCardId) query = query.eq('credit_card_id', filter.creditCardId);
    if (filter.status) query = query.eq('status', filter.status);

    return query.then(({ data, error }) => {
      if (error) throw error;
      return (data ?? []).map((r: any) => this.toModel(r));
    });
  }

  async getByYear(year: number, status?: string): Promise<Transaction[]> {
    let query = this.supabase.client
      .from(TABLE)
      .select('id, date, amount, category_id, status')
      .eq('owner_id', this.ownerId)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`);
    if (status) query = query.eq('status', status);
    return query.then(({ data, error }) => {
      if (error) throw error;
      return (data ?? []).map((r: any) => this.toModel(r));
    });
  }

  async create(payload: CreateTransactionPayload): Promise<Transaction[]> {
    this.logger.info('Creating transaction', payload.description);
    const ownerId = this.ownerId;

    if (payload.totalInstallments && payload.totalInstallments > 1) {
      return this.createInstallments(payload, ownerId);
    }

    return this.supabase.client
      .from(TABLE)
      .insert(this.toRow(payload, ownerId))
      .select()
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => this.toModel(r));
      });
  }

  private async createInstallments(
    payload: CreateTransactionPayload,
    ownerId: string
  ): Promise<Transaction[]> {
    const groupId = crypto.randomUUID();
    const total = payload.totalInstallments!;
    const baseDate = new Date(payload.date + 'T00:00:00');
    const installmentAmount = payload.installmentAmountIsFixed
      ? payload.amount
      : Math.round((payload.amount / total) * 100) / 100;

    const pad = (n: number) => String(n).padStart(2, '0');

    const rows = Array.from({ length: total }, (_, i) => {
      const installDate = new Date(baseDate);
      installDate.setDate(1);
      installDate.setMonth(baseDate.getMonth() + i);
      const lastDay = new Date(installDate.getFullYear(), installDate.getMonth() + 1, 0).getDate();
      installDate.setDate(Math.min(baseDate.getDate(), lastDay));
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

    return this.supabase.client
      .from(TABLE)
      .insert(rows)
      .select()
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => this.toModel(r));
      });
  }

  async update(id: string, payload: Partial<CreateTransactionPayload>): Promise<Transaction> {
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
    if (payload.totalInstallments !== undefined) {
      row['total_installments'] = payload.totalInstallments ?? null;
      row['installment_number'] = payload.totalInstallments ? 1 : null;
      row['installment_group_id'] = null;
    }

    return this.supabase.client
      .from(TABLE)
      .update(row)
      .eq('id', id)
      .eq('owner_id', this.ownerId)
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) throw error;
        return this.toModel(data);
      });
  }

  async getAllInstallments(): Promise<Transaction[]> {
    const PAGE = 1000;
    const fetchPage = (offset: number): Promise<Transaction[]> =>
      Promise.resolve(
        this.supabase.client
          .from(TABLE)
          .select('*')
          .eq('owner_id', this.ownerId)
          .gt('total_installments', 1)
          .order('date', { ascending: true })
          .range(offset, offset + PAGE - 1)
      ).then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => this.toModel(r));
      });

    const all: Transaction[] = [];
    let offset = 0;
    while (true) {
      const page = await fetchPage(offset);
      all.push(...page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    return all;
  }

  async getAllCreditCard(): Promise<Transaction[]> {
    return this.supabase.client
      .from(TABLE)
      .select('*')
      .eq('owner_id', this.ownerId)
      .not('credit_card_id', 'is', null)
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => this.toModel(r));
      });
  }

  async bulkUpdateStatusByCardMonth(creditCardId: string, year: number, month: number, status: TransactionStatus): Promise<void> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    return this.supabase.client
      .from(TABLE)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('owner_id', this.ownerId)
      .eq('credit_card_id', creditCardId)
      .neq('status', 'ESTIMATED')
      .gte('date', startDate)
      .lte('date', endDate)
      .then(({ error }) => { if (error) throw error; });
  }

  async delete(id: string): Promise<void> {
    this.logger.info('Deleting transaction', id);
    return this.supabase.client
      .from(TABLE)
      .delete()
      .eq('id', id)
      .eq('owner_id', this.ownerId)
      .then(({ error }) => {
        if (error) throw error;
      });
  }

  async getByInstallmentGroup(groupId: string): Promise<Transaction[]> {
    return this.supabase.client
      .from(TABLE)
      .select('*')
      .eq('owner_id', this.ownerId)
      .eq('installment_group_id', groupId)
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => this.toModel(r));
      });
  }

  async updatePosition(id: string, position: number): Promise<void> {
    return this.supabase.client
      .from(TABLE)
      .update({ position, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', this.ownerId)
      .then(({ error }) => { if (error) throw error; });
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
      position: payload.position ?? null,
    };
  }
}
