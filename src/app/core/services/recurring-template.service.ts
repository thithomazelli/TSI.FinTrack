import { Injectable, inject } from '@angular/core';
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
    frequency: (r['frequency'] as string ?? 'monthly') as 'monthly' | 'sporadic',
    months: (r['months'] as number[]) ?? [],
    position: Number(r['position'] ?? 0),
    createdAt: r['created_at'] as string,
  };
}

@Injectable({ providedIn: 'root' })
export class RecurringTemplateService {
  private readonly supabase = inject(SupabaseService);

  async getAll(): Promise<RecurringTemplate[]> {
    return this.supabase.client.from(TABLE).select('*').order('created_at')
      .then(({ data, error }) => {
        if (error) throw error;
        const rows = (data as Record<string, unknown>[]).map(mapRow);
        // Sort by position client-side (position col may not exist on older DB)
        return rows.sort((a, b) => a.position - b.position);
      });
  }

  async create(payload: Omit<RecurringTemplate, 'id' | 'ownerId' | 'createdAt'>): Promise<RecurringTemplate> {
    const row = {
      description: payload.description,
      amount: payload.amount,
      category_id: payload.categoryId,
      account_id: payload.accountId,
      credit_card_id: payload.creditCardId,
      type: payload.type,
      day_of_month: payload.dayOfMonth,
      is_active: payload.isActive,
      frequency: payload.frequency,
      months: payload.months,
      position: payload.position,
    };
    return this.supabase.client.from(TABLE).insert(row).select().single()
      .then(({ data, error }) => {
        if (error) throw error;
        return mapRow(data as Record<string, unknown>);
      });
  }

  async update(id: string, payload: Partial<Omit<RecurringTemplate, 'id' | 'ownerId' | 'createdAt'>>): Promise<RecurringTemplate> {
    const row: Record<string, unknown> = {};
    if (payload.description !== undefined) row['description'] = payload.description;
    if (payload.amount !== undefined) row['amount'] = payload.amount;
    if (payload.categoryId !== undefined) row['category_id'] = payload.categoryId;
    if (payload.accountId !== undefined) row['account_id'] = payload.accountId;
    if (payload.creditCardId !== undefined) row['credit_card_id'] = payload.creditCardId;
    if (payload.type !== undefined) row['type'] = payload.type;
    if (payload.dayOfMonth !== undefined) row['day_of_month'] = payload.dayOfMonth;
    if (payload.isActive !== undefined) row['is_active'] = payload.isActive;
    if (payload.frequency !== undefined) row['frequency'] = payload.frequency;
    if (payload.months !== undefined) row['months'] = payload.months;
    if (payload.position !== undefined) row['position'] = payload.position;
    return this.supabase.client.from(TABLE).update(row).eq('id', id).select().single()
      .then(({ data, error }) => {
        if (error) throw error;
        return mapRow(data as Record<string, unknown>);
      });
  }

  async updatePosition(id: string, position: number): Promise<void> {
    return this.supabase.client.from(TABLE).update({ position }).eq('id', id)
      .then(({ error }) => { if (error) throw error; });
  }

  async delete(id: string): Promise<void> {
    return this.supabase.client.from(TABLE).delete().eq('id', id)
      .then(({ error }) => { if (error) throw error; });
  }

  /** Project all active templates for a given year/month via RPC */
  async projectPeriod(year: number, month: number): Promise<{ created: number }> {
    return this.supabase.client.rpc('project_recurring_period', { p_year: year, p_month: month })
      .then(({ data, error }) => {
        if (error) throw error;
        return data as { created: number };
      });
  }
}
