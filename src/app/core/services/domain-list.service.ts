import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { LoggingService } from './logging.service';
import { AuthService } from '../auth/auth.service';
import { DomainList } from '../models/interfaces/domain-list.interface';

const TABLE = 'domain_lists';

@Injectable({ providedIn: 'root' })
export class DomainListService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);
  private readonly auth = inject(AuthService);

  private get ownerId(): string {
    return this.auth.currentUser!.id;
  }

  async getByCode(code: string): Promise<DomainList[]> {
    this.logger.debug('Fetching domain list', code);
    return this.supabase.client
      .from(TABLE)
      .select('*')
      .eq('owner_id', this.ownerId)
      .eq('code', code)
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as DomainList[];
      });
  }

  async getAll(): Promise<DomainList[]> {
    return this.supabase.client
      .from(TABLE)
      .select('*')
      .eq('owner_id', this.ownerId)
      .order('code')
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as DomainList[];
      });
  }

  async create(payload: Pick<DomainList, 'code' | 'name' | 'value' | 'color' | 'sortOrder'>): Promise<DomainList> {
    this.logger.info('Creating domain list item', payload.code, payload.name);
    return this.supabase.client
      .from(TABLE)
      .insert({
        owner_id: this.ownerId,
        code: payload.code,
        name: payload.name,
        value: payload.value,
        color: payload.color,
        sort_order: payload.sortOrder,
        is_system: false,
        is_default: false,
      })
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) throw error;
        return data as DomainList;
      });
  }

  async update(id: string, payload: Pick<DomainList, 'name' | 'color' | 'sortOrder'>): Promise<DomainList> {
    this.logger.info('Updating domain list item', id);
    return this.supabase.client
      .from(TABLE)
      .update({
        name: payload.name,
        color: payload.color,
        sort_order: payload.sortOrder,
      })
      .eq('id', id)
      .eq('owner_id', this.ownerId)
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) throw error;
        return data as DomainList;
      });
  }

  async delete(id: string): Promise<void> {
    this.logger.info('Deleting domain list item', id);
    return this.supabase.client
      .from(TABLE)
      .delete()
      .eq('id', id)
      .eq('owner_id', this.ownerId)
      .eq('is_system', false)
      .then(({ error }) => {
        if (error) throw error;
      });
  }
}
