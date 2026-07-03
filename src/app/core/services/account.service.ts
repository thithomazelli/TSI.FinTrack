import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
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

  getAll(includeArchived = false): Observable<Account[]> {
    this.logger.debug('Fetching accounts');
    let query = this.supabase.client
      .from(TABLE)
      .select('*')
      .eq('owner_id', this.ownerId)
      .order('name');
    if (!includeArchived) {
      query = query.eq('is_archived', false);
    }
    return from(
      query.then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map(fromDb);
      })
    );
  }

  create(payload: Pick<Account, 'name' | 'typeId' | 'balance'>): Observable<Account> {
    this.logger.info('Creating account', payload.name);
    return from(
      this.supabase.client
        .from(TABLE)
        .insert({
          name: payload.name,
          type_id: payload.typeId,
          balance: payload.balance,
          owner_id: this.ownerId,
        })
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return fromDb(data);
        })
    );
  }

  update(id: string, payload: Partial<Pick<Account, 'name' | 'typeId' | 'balance'>>): Observable<Account> {
    this.logger.info('Updating account', id);
    return from(
      this.supabase.client
        .from(TABLE)
        .update({
          ...(payload.name !== undefined && { name: payload.name }),
          ...(payload.typeId !== undefined && { type_id: payload.typeId }),
          ...(payload.balance !== undefined && { balance: payload.balance }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('owner_id', this.ownerId)
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return fromDb(data);
        })
    );
  }

  archive(id: string): Observable<void> {
    this.logger.info('Archiving account', id);
    return from(
      this.supabase.client
        .from(TABLE)
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('owner_id', this.ownerId)
        .then(({ error }) => {
          if (error) throw error;
        })
    );
  }

  restore(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from(TABLE)
        .update({ is_archived: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('owner_id', this.ownerId)
        .then(({ error }) => {
          if (error) throw error;
        })
    );
  }
}
