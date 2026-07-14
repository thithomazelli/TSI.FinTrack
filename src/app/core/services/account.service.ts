import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { LoggingService } from './logging.service';
import { AuthService } from '../auth/auth.service';
import { Account } from '../models/interfaces/account.interface';

const TABLE = 'accounts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDb(row: any): Account {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    typeId: row.type_id,
    balance: row.balance,
    openedAt: row.opened_at ?? null,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);
  private readonly auth = inject(AuthService);

  private get ownerId(): string {
    return this.auth.currentUser!.id;
  }

  async getAll(includeArchived = false): Promise<Account[]> {
    this.logger.debug('Fetching accounts');
    let query = this.supabase.client
      .from(TABLE)
      .select('*')
      .eq('owner_id', this.ownerId)
      .order('name');
    if (!includeArchived) {
      query = query.eq('is_archived', false);
    }
    return query.then(({ data, error }) => {
      if (error) throw error;
      return (data ?? []).map(fromDb);
    });
  }

  async create(payload: Pick<Account, 'name' | 'typeId' | 'balance' | 'openedAt'>): Promise<Account> {
    this.logger.info('Creating account', payload.name);
    return this.supabase.client
      .from(TABLE)
      .insert({
        name: payload.name,
        type_id: payload.typeId,
        balance: payload.balance,
        opened_at: payload.openedAt || null,
        owner_id: this.ownerId,
      })
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) throw error;
        return fromDb(data);
      });
  }

  async update(id: string, payload: Partial<Pick<Account, 'name' | 'typeId' | 'balance' | 'openedAt'>>): Promise<Account> {
    this.logger.info('Updating account', id);
    return this.supabase.client
      .from(TABLE)
      .update({
        ...(payload.name !== undefined && { name: payload.name }),
        ...(payload.typeId !== undefined && { type_id: payload.typeId }),
        ...(payload.balance !== undefined && { balance: payload.balance }),
        ...(payload.openedAt !== undefined && { opened_at: payload.openedAt || null }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('owner_id', this.ownerId)
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) throw error;
        return fromDb(data);
      });
  }

  async archive(id: string): Promise<void> {
    this.logger.info('Archiving account', id);
    return this.supabase.client
      .from(TABLE)
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', this.ownerId)
      .then(({ error }) => {
        if (error) throw error;
      });
  }

  async restore(id: string): Promise<void> {
    return this.supabase.client
      .from(TABLE)
      .update({ is_archived: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', this.ownerId)
      .then(({ error }) => {
        if (error) throw error;
      });
  }
}
