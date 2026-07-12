import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { LoggingService } from './logging.service';
import { AuthService } from '../auth/auth.service';
import { Entry } from '../models/interfaces/entry.interface';

const TABLE = 'entries';

export interface EntryFilter {
  year: number;
  month: number;
  accountId?: string;
  typeId?: string;
}

export interface CreateEntryPayload {
  description: string;
  amount: number;
  date: string;
  typeId: string | null;
  accountId: string | null;
  labels: string[];
  status?: string;
  totalInstallments?: number | null;
  /** When true, `amount` is already the per-installment value — do not divide. */
  installmentAmountIsFixed?: boolean;
}

@Injectable({ providedIn: 'root' })
export class EntryService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);
  private readonly auth = inject(AuthService);

  private get ownerId(): string {
    return this.auth.currentUser!.id;
  }

  getByMonth(filter: EntryFilter): Observable<Entry[]> {
    this.logger.debug('Fetching entries', filter);
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

    if (filter.accountId) query = query.eq('account_id', filter.accountId);
    if (filter.typeId) query = query.eq('type_id', filter.typeId);

    return from(
      query.then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => this.toModel(r));
      })
    );
  }

  create(payload: CreateEntryPayload): Observable<Entry> {
    this.logger.info('Creating entry', payload.description);
    if (payload.totalInstallments && payload.totalInstallments > 1) {
      return this.createInstallments(payload);
    }
    return from(
      this.supabase.client
        .from(TABLE)
        .insert({
          owner_id: this.ownerId,
          description: payload.description,
          amount: payload.amount,
          date: payload.date,
          type_id: payload.typeId,
          account_id: payload.accountId,
          labels: payload.labels,
          status: payload.status ?? 'REALIZED',
        })
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return this.toModel(data);
        })
    );
  }

  private createInstallments(payload: CreateEntryPayload): Observable<Entry> {
    const total = payload.totalInstallments!;
    const installmentAmount = payload.installmentAmountIsFixed
      ? payload.amount
      : Math.round((payload.amount / total) * 100) / 100;
    const baseDate = new Date(payload.date + 'T00:00:00');
    const pad = (n: number) => String(n).padStart(2, '0');
    const ownerId = this.ownerId;

    const rows = Array.from({ length: total }, (_, i) => {
      const d = new Date(baseDate);
      d.setDate(1);
      d.setMonth(baseDate.getMonth() + i);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(baseDate.getDate(), lastDay));
      return {
        owner_id: ownerId,
        description: `${payload.description} - ${pad(i + 1)}/${pad(total)}`,
        amount: installmentAmount,
        date: d.toISOString().split('T')[0],
        type_id: payload.typeId,
        account_id: payload.accountId,
        labels: payload.labels,
        status: payload.status ?? 'REALIZED',
      };
    });

    return from(
      this.supabase.client
        .from(TABLE)
        .insert(rows)
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return this.toModel(data);
        })
    );
  }

  update(id: string, payload: Partial<CreateEntryPayload>): Observable<Entry> {
    this.logger.info('Updating entry', id);
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.description !== undefined) row['description'] = payload.description;
    if (payload.amount !== undefined) row['amount'] = payload.amount;
    if (payload.date !== undefined) row['date'] = payload.date;
    if (payload.typeId !== undefined) row['type_id'] = payload.typeId;
    if (payload.accountId !== undefined) row['account_id'] = payload.accountId;
    if (payload.labels !== undefined) row['labels'] = payload.labels;
    if (payload.status !== undefined) row['status'] = payload.status;

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

  private toModel(r: any): Entry {
    return {
      id: r.id, ownerId: r.owner_id, description: r.description,
      amount: r.amount, date: r.date, status: r.status,
      typeId: r.type_id, accountId: r.account_id,
      recurringTemplateId: r.recurring_template_id,
      labels: r.labels ?? [], position: r.position ?? undefined,
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  getByDescriptionPrefix(baseDescription: string): Observable<Entry[]> {
    return from(
      this.supabase.client
        .from(TABLE)
        .select('*')
        .eq('owner_id', this.ownerId)
        .like('description', `${baseDescription} - %/%`)
        .order('date', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []).map((r: any) => this.toModel(r));
        })
    );
  }

  delete(id: string): Observable<void> {
    this.logger.info('Deleting entry', id);
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
}
