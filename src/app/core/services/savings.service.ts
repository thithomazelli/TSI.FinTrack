import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { LoggingService } from './logging.service';
import { AuthService } from '../auth/auth.service';
import { SavingsMovement } from '../models/interfaces/savings-movement.interface';

const TABLE = 'savings_movements';

@Injectable({ providedIn: 'root' })
export class SavingsService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);
  private readonly auth = inject(AuthService);

  private get ownerId(): string {
    return this.auth.currentUser!.id;
  }

  getAll(): Observable<SavingsMovement[]> {
    return from(
      this.supabase.client
        .from(TABLE)
        .select('*')
        .eq('owner_id', this.ownerId)
        .order('date', { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as SavingsMovement[];
        })
    );
  }

  create(payload: Pick<SavingsMovement, 'description' | 'amount' | 'date' | 'typeId' | 'accountId'>): Observable<SavingsMovement> {
    this.logger.info('Creating savings movement', payload.description);
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
        })
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return data as SavingsMovement;
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
