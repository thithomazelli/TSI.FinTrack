import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { LoggingService } from './logging.service';
import { AuthService } from '../auth/auth.service';
import { Category } from '../models/interfaces/category.interface';

const TABLE = 'categories';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);
  private readonly auth = inject(AuthService);

  private get ownerId(): string {
    return this.auth.currentUser!.id;
  }

  async getAll(): Promise<Category[]> {
    this.logger.debug('Fetching categories');
    return this.supabase.client
      .from(TABLE)
      .select('*')
      .eq('owner_id', this.ownerId)
      .order('name')
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as Category[];
      });
  }

  async create(payload: Pick<Category, 'name' | 'color'>): Promise<Category> {
    this.logger.info('Creating category', payload.name);
    return this.supabase.client
      .from(TABLE)
      .insert({ ...payload, owner_id: this.ownerId })
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) throw error;
        return data as Category;
      });
  }

  async update(id: string, payload: Partial<Pick<Category, 'name' | 'color'>>): Promise<Category> {
    this.logger.info('Updating category', id);
    return this.supabase.client
      .from(TABLE)
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', this.ownerId)
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) throw error;
        return data as Category;
      });
  }

  async delete(id: string): Promise<void> {
    this.logger.info('Deleting category', id);
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
