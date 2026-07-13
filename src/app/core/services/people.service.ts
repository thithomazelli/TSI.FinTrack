import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { AuthService } from '../auth/auth.service';
import { People } from '../models/interfaces/people.interface';

const TABLE = 'people';

@Injectable({ providedIn: 'root' })
export class PeopleService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private get ownerId(): string {
    return this.auth.currentUser!.id;
  }

  getAll(): Observable<People[]> {
    return from(
      this.supabase.client
        .from(TABLE)
        .select('*')
        .eq('owner_id', this.ownerId)
        .order('name')
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as People[];
        })
    );
  }

  update(id: string, name: string): Observable<People> {
    return from(
      this.supabase.client
        .from(TABLE)
        .update({ name })
        .eq('id', id)
        .eq('owner_id', this.ownerId)
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return data as People;
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

  upsertByName(name: string): Observable<People> {
    return from(
      this.supabase.client
        .from(TABLE)
        .upsert(
          { owner_id: this.ownerId, name },
          { onConflict: 'owner_id,name' }
        )
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return data as People;
        })
    );
  }
}
