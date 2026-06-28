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
      .order('date', { ascending: false });

    if (filter.accountId) query = query.eq('account_id', filter.accountId);
    if (filter.typeId) query = query.eq('type_id', filter.typeId);

    return from(
      query.then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as Entry[];
      })
    );
  }

  create(payload: CreateEntryPayload): Observable<Entry> {
    this.logger.info('Creating entry', payload.description);
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
          return data as Entry;
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
          return data as Entry;
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
