import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { LoggingService } from './logging.service';
import { AuthService } from '../auth/auth.service';
import { CreditCard } from '../models/interfaces/credit-card.interface';

const TABLE = 'credit_cards';

@Injectable({ providedIn: 'root' })
export class CreditCardService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);
  private readonly auth = inject(AuthService);

  private get ownerId(): string {
    return this.auth.currentUser!.id;
  }

  getAll(includeArchived = false): Observable<CreditCard[]> {
    this.logger.debug('Fetching credit cards');
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
        return (data ?? []) as CreditCard[];
      })
    );
  }

  create(payload: Omit<CreditCard, 'id' | 'ownerId' | 'isArchived' | 'createdAt' | 'updatedAt'>): Observable<CreditCard> {
    this.logger.info('Creating credit card', payload.name);
    return from(
      this.supabase.client
        .from(TABLE)
        .insert({
          name: payload.name,
          last_four_digits: payload.lastFourDigits,
          credit_limit: payload.creditLimit,
          closing_day: payload.closingDay,
          due_day: payload.dueDay,
          owner_id: this.ownerId,
        })
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return data as CreditCard;
        })
    );
  }

  update(id: string, payload: Partial<Omit<CreditCard, 'id' | 'ownerId' | 'isArchived' | 'createdAt' | 'updatedAt'>>): Observable<CreditCard> {
    this.logger.info('Updating credit card', id);
    return from(
      this.supabase.client
        .from(TABLE)
        .update({
          ...(payload.name !== undefined && { name: payload.name }),
          ...(payload.lastFourDigits !== undefined && { last_four_digits: payload.lastFourDigits }),
          ...(payload.creditLimit !== undefined && { credit_limit: payload.creditLimit }),
          ...(payload.closingDay !== undefined && { closing_day: payload.closingDay }),
          ...(payload.dueDay !== undefined && { due_day: payload.dueDay }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('owner_id', this.ownerId)
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return data as CreditCard;
        })
    );
  }

  archive(id: string): Observable<void> {
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
