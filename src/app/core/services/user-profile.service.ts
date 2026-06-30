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
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw error;
          if (!data) return { id, email: '', fullName: '', avatarUrl: null, createdAt: '', updatedAt: '' } as UserProfile;
          return {
            id: data['id'],
            email: data['email'],
            fullName: data['full_name'],
            avatarUrl: data['avatar_url'],
            createdAt: data['created_at'],
            updatedAt: data['updated_at'],
          } as UserProfile;
        })
    );
  }

  uploadAvatar(userId: string, file: File): Observable<string> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${userId}/avatar.${ext}`;
    return from(
      this.supabase.client.storage.from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
        .then(({ data, error }) => {
          if (error) throw error;
          const { data: urlData } = this.supabase.client.storage.from('avatars').getPublicUrl(data.path);
          return urlData.publicUrl;
        })
    );
  }

  upsert(profile: Partial<UserProfile> & { id: string }): Observable<UserProfile> {
    this.logger.info('Upserting user profile', profile.id);
    const row: Record<string, unknown> = { id: profile.id };
    if (profile.fullName !== undefined) row['full_name'] = profile.fullName;
    if (profile.email !== undefined) row['email'] = profile.email;
    if (profile.avatarUrl !== undefined) row['avatar_url'] = profile.avatarUrl;
    return from(
      this.supabase.client
        .from(TABLE)
        .upsert(row)
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return {
            id: data['id'],
            email: data['email'],
            fullName: data['full_name'],
            avatarUrl: data['avatar_url'],
            createdAt: data['created_at'],
            updatedAt: data['updated_at'],
          } as UserProfile;
        })
    );
  }
}
