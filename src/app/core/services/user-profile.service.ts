import { Injectable, inject } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { LoggingService } from './logging.service';
import { UserProfile } from '../models/interfaces/user-profile.interface';

const TABLE = 'user_profiles';

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);

  getById(id: string): Observable<UserProfile> {
    this.logger.debug('Fetching user profile', id);
    return from(
      this.supabase.client
        .from(TABLE)
        .select('*')
        .eq('id', id)
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return data as UserProfile;
        })
    );
  }

  upsert(profile: Partial<UserProfile> & { id: string }): Observable<UserProfile> {
    this.logger.info('Upserting user profile', profile.id);
    return from(
      this.supabase.client
        .from(TABLE)
        .upsert(profile)
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return data as UserProfile;
        })
    );
  }
}
