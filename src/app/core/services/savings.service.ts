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
        .select('*, domain_lists!type_id(value)')
        .eq('owner_id', this.ownerId)
        .order('date', { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []).map((r: any) => this.toModel(r));
        })
    );
  }

  getByMonth(year: number, month: number): Observable<SavingsMovement[]> {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    return from(
      this.supabase.client
        .from(TABLE)
        .select('*, domain_lists!type_id(value)')
        .eq('owner_id', this.ownerId)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []).map((r: any) => this.toModel(r));
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
          return this.toModel(data);
        })
    );
  }

  private toModel(r: any): SavingsMovement {
    return {
      id: r.id,
      ownerId: r.owner_id,
      description: r.description,
      amount: Number(r.amount),
      date: r.date,
      typeId: r.type_id,
      typeCode: r.domain_lists?.value ?? '',
      accountId: r.account_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
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
