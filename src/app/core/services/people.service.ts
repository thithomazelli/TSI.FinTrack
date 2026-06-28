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
