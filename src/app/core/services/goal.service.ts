import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { LoggingService } from './logging.service';
import { AuthService } from '../auth/auth.service';
import { Goal } from '../models/interfaces/goal.interface';

const TABLE = 'goals';

@Injectable({ providedIn: 'root' })
export class GoalService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);
  private readonly auth = inject(AuthService);

  private get ownerId(): string {
    return this.auth.currentUser!.id;
  }

  async getByMonth(year: number, month: number): Promise<Goal[]> {
    return this.supabase.client
      .from(TABLE)
      .select('*')
      .eq('owner_id', this.ownerId)
      .eq('year', year)
      .eq('month', month)
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as Goal[];
      });
  }

  async upsert(payload: Pick<Goal, 'categoryId' | 'monthlyLimit' | 'year' | 'month'>): Promise<Goal> {
    this.logger.info('Upserting goal', payload.categoryId);
    return this.supabase.client
      .from(TABLE)
      .upsert(
        {
          owner_id: this.ownerId,
          category_id: payload.categoryId,
          monthly_limit: payload.monthlyLimit,
          year: payload.year,
          month: payload.month,
        },
        { onConflict: 'owner_id,category_id,year,month' }
      )
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) throw error;
        return data as Goal;
      });
  }

  async delete(id: string): Promise<void> {
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
