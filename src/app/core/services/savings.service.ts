import { Injectable, inject } from '@angular/core';
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

  async getAll(): Promise<SavingsMovement[]> {
    return this.supabase.client
      .from(TABLE)
      .select('*, domain_lists(value)')
      .eq('owner_id', this.ownerId)
      .order('date', { ascending: false })
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => this.toModel(r));
      });
  }

  async getByDateRange(from: string, to: string): Promise<SavingsMovement[]> {
    return this.supabase.client
      .from(TABLE)
      .select('*, domain_lists(value)')
      .eq('owner_id', this.ownerId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => this.toModel(r));
      });
  }

  async getByMonth(year: number, month: number): Promise<SavingsMovement[]> {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    return this.supabase.client
      .from(TABLE)
      .select('*, domain_lists(value)')
      .eq('owner_id', this.ownerId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => this.toModel(r));
      });
  }

  async create(payload: Pick<SavingsMovement, 'description' | 'amount' | 'date' | 'typeId' | 'accountId'>): Promise<SavingsMovement> {
    this.logger.info('Creating savings movement', payload.description);
    return this.supabase.client
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
      });
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

  /** Saldo acumulado da poupança até endDate (inclusive). */
  async getBalanceUpTo(endDate: string): Promise<number> {
    return this.supabase.client
      .from('savings_movements')
      .select('amount, date, domain_lists(value)')
      .eq('owner_id', this.ownerId)
      .lte('date', endDate)
      .range(0, 9999)
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).reduce((sum: number, r: any) => {
          const isDeposit = (r.domain_lists?.value ?? '') === 'DEPOSIT';
          return sum + (isDeposit ? Number(r.amount) : -Number(r.amount));
        }, 0);
      });
  }

  async getBalanceUpToByAccount(endDate: string, accountId: string): Promise<number> {
    return this.supabase.client
      .from('savings_movements')
      .select('amount, domain_lists(value)')
      .eq('owner_id', this.ownerId)
      .eq('account_id', accountId)
      .lte('date', endDate)
      .range(0, 9999)
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).reduce((sum: number, r: any) => {
          const isDeposit = (r.domain_lists?.value ?? '') === 'DEPOSIT';
          return sum + (isDeposit ? Number(r.amount) : -Number(r.amount));
        }, 0);
      });
  }

  /** Totais de depósito e retirada dentro de um período. */
  async getPeriodTotals(startDate: string, endDate: string): Promise<{ deposits: number; withdrawals: number }> {
    return this.supabase.client
      .from('savings_movements')
      .select('amount, domain_lists(value)')
      .eq('owner_id', this.ownerId)
      .gte('date', startDate)
      .lte('date', endDate)
      .range(0, 9999)
      .then(({ data, error }) => {
        if (error) throw error;
        let deposits = 0, withdrawals = 0;
        for (const r of (data ?? []) as any[]) {
          if ((r.domain_lists?.value ?? '') === 'DEPOSIT') deposits += Number(r.amount);
          else withdrawals += Number(r.amount);
        }
        return { deposits, withdrawals };
      });
  }

  async update(id: string, payload: Pick<SavingsMovement, 'description' | 'amount' | 'date' | 'typeId' | 'accountId'>): Promise<SavingsMovement> {
    return this.supabase.client
      .from(TABLE)
      .update({
        description: payload.description,
        amount: payload.amount,
        date: payload.date,
        type_id: payload.typeId,
        account_id: payload.accountId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('owner_id', this.ownerId)
      .select('*, domain_lists(value)')
      .single()
      .then(({ data, error }) => {
        if (error) throw error;
        return this.toModel(data);
      });
  }

  async createDeposit(description: string, amount: number, date: string, accountId: string): Promise<void> {
    const { data: types } = await this.supabase.client
      .from('domain_lists')
      .select('id')
      .eq('owner_id', this.ownerId)
      .eq('code', 'savings_movement_type')
      .eq('value', 'DEPOSIT')
      .single();
    if (!types?.id) throw new Error('DEPOSIT type not found');
    await this.create({ description, amount, date, typeId: types.id, accountId });
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
