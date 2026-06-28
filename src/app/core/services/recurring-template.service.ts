import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { RecurringTemplate } from '../models/interfaces/recurring-template.interface';

const TABLE = 'recurring_templates';

function mapRow(r: Record<string, unknown>): RecurringTemplate {
  return {
    id: r['id'] as string,
    ownerId: r['owner_id'] as string,
    description: r['description'] as string,
    amount: Number(r['amount']),
    categoryId: r['category_id'] as string | null,
    accountId: r['account_id'] as string | null,
    creditCardId: r['credit_card_id'] as string | null,
    type: r['type'] as 'TRANSACTION' | 'ENTRY',
    dayOfMonth: r['day_of_month'] as number,
    isActive: r['is_active'] as boolean,
    createdAt: r['created_at'] as string,
  };
}

@Injectable({ providedIn: 'root' })
export class RecurringTemplateService {
  private readonly supabase = inject(SupabaseService);

  getAll(): Observable<RecurringTemplate[]> {
    return from(
      this.supabase.client.from(TABLE).select('*').order('description')
        .then(({ data, error }) => {
          if (error) throw error;
          return (data as Record<string, unknown>[]).map(mapRow);
        })
    );
  }

  create(payload: Omit<RecurringTemplate, 'id' | 'ownerId' | 'createdAt'>): Observable<RecurringTemplate> {
    const row = {
      description: payload.description,
      amount: payload.amount,
      category_id: payload.categoryId,
      account_id: payload.accountId,
      credit_card_id: payload.creditCardId,
      type: payload.type,
      day_of_month: payload.dayOfMonth,
      is_active: payload.isActive,
    };
    return from(
      this.supabase.client.from(TABLE).insert(row).select().single()
        .then(({ data, error }) => {
          if (error) throw error;
          return mapRow(data as Record<string, unknown>);
        })
    );
  }

  update(id: string, payload: Partial<Omit<RecurringTemplate, 'id' | 'ownerId' | 'createdAt'>>): Observable<RecurringTemplate> {
    const row: Record<string, unknown> = {};
    if (payload.description !== undefined) row['description'] = payload.description;
    if (payload.amount !== undefined) row['amount'] = payload.amount;
    if (payload.categoryId !== undefined) row['category_id'] = payload.categoryId;
    if (payload.accountId !== undefined) row['account_id'] = payload.accountId;
    if (payload.creditCardId !== undefined) row['credit_card_id'] = payload.creditCardId;
    if (payload.type !== undefined) row['type'] = payload.type;
    if (payload.dayOfMonth !== undefined) row['day_of_month'] = payload.dayOfMonth;
    if (payload.isActive !== undefined) row['is_active'] = payload.isActive;
    return from(
      this.supabase.client.from(TABLE).update(row).eq('id', id).select().single()
        .then(({ data, error }) => {
          if (error) throw error;
          return mapRow(data as Record<string, unknown>);
        })
    );
  }

  delete(id: string): Observable<void> {
    return from(
      this.supabase.client.from(TABLE).delete().eq('id', id)
        .then(({ error }) => { if (error) throw error; })
    );
  }
}
