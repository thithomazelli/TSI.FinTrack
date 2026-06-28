import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
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

  getByMonth(year: number, month: number): Observable<Goal[]> {
    return from(
      this.supabase.client
        .from(TABLE)
        .select('*')
        .eq('owner_id', this.ownerId)
        .eq('year', year)
        .eq('month', month)
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as Goal[];
        })
    );
  }

  upsert(payload: Pick<Goal, 'categoryId' | 'monthlyLimit' | 'year' | 'month'>): Observable<Goal> {
    this.logger.info('Upserting goal', payload.categoryId);
    return from(
      this.supabase.client
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
        })
    );
  }

  delete(id: string): Observable<void> {
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
