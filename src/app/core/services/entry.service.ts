import { Injectable, inject } from '@angular/core';
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
  position?: number | null;
}

@Injectable({ providedIn: 'root' })
export class EntryService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);
  private readonly auth = inject(AuthService);

  private get ownerId(): string {
    return this.auth.currentUser!.id;
  }

  async getByMonth(filter: EntryFilter): Promise<Entry[]> {
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

    return query.then(({ data, error }) => {
      if (error) throw error;
      return (data ?? []).map((r: any) => this.toModel(r));
    });
  }

  async create(payload: CreateEntryPayload): Promise<Entry> {
    this.logger.info('Creating entry', payload.description);
    if (payload.totalInstallments && payload.totalInstallments > 1) {
      return this.createInstallments(payload);
    }
    return this.supabase.client
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
        position: payload.position ?? null,
      })
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) throw error;
        return this.toModel(data);
      });
  }

  private async createInstallments(payload: CreateEntryPayload): Promise<Entry> {
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

    return this.supabase.client
      .from(TABLE)
      .insert(rows)
      .select()
      .then(({ data, error }) => {
        if (error) throw error;
        return this.toModel((data as any[])[0]);
      });
  }

  async update(id: string, payload: Partial<CreateEntryPayload>): Promise<Entry> {
    this.logger.info('Updating entry', id);
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.description !== undefined) row['description'] = payload.description;
    if (payload.amount !== undefined) row['amount'] = payload.amount;
    if (payload.date !== undefined) row['date'] = payload.date;
    if (payload.typeId !== undefined) row['type_id'] = payload.typeId;
    if (payload.accountId !== undefined) row['account_id'] = payload.accountId;
    if (payload.labels !== undefined) row['labels'] = payload.labels;
    if (payload.status !== undefined) row['status'] = payload.status;

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

  async updatePosition(id: string, position: number): Promise<void> {
    return this.supabase.client
      .from(TABLE)
      .update({ position, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', this.ownerId)
      .then(({ error }) => { if (error) throw error; });
  }

  private toModel(r: any): Entry {
    const installMatch = r.description?.match(/ - (\d+)\/(\d+)$/);
    return {
      id: r.id, ownerId: r.owner_id, description: r.description,
      amount: r.amount, date: r.date, status: r.status,
      typeId: r.type_id, accountId: r.account_id,
      recurringTemplateId: r.recurring_template_id,
      labels: r.labels ?? [], position: r.position ?? undefined,
      installmentNumber: installMatch ? parseInt(installMatch[1]) : null,
      totalInstallments: installMatch ? parseInt(installMatch[2]) : null,
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  async getByDescriptionPrefix(baseDescription: string): Promise<Entry[]> {
    return this.supabase.client
      .from(TABLE)
      .select('*')
      .eq('owner_id', this.ownerId)
      .like('description', `${baseDescription} - %/%`)
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => this.toModel(r));
      });
  }

  async delete(id: string): Promise<void> {
    this.logger.info('Deleting entry', id);
    return this.supabase.client
      .from(TABLE)
      .delete()
      .eq('id', id)
      .eq('owner_id', this.ownerId)
      .then(({ error }) => {
        if (error) throw error;
      });
  }
}
