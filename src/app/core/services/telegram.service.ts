import { Injectable, inject } from '@angular/core';
import { from, Observable, switchMap, map } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface TelegramSubscription {
  id: string;
  userId: string;
  chatId: number;
  notificationsEnabled: boolean;
  linkedAt: string;
}

@Injectable({ providedIn: 'root' })
export class TelegramService {
  private readonly supabase = inject(SupabaseService).client;

  getSubscription(userId: string): Observable<TelegramSubscription | null> {
    return from(
      this.supabase
        .from('telegram_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
    ).pipe(
      map((res) => {
        if (!res.data) return null;
        const d = res.data;
        return {
          id: d.id,
          userId: d.user_id,
          chatId: d.chat_id,
          notificationsEnabled: d.notifications_enabled,
          linkedAt: d.linked_at,
        };
      })
    );
  }

  generateLinkToken(userId: string, botUsername: string): Observable<string> {
    const token = crypto.randomUUID().replace(/-/g, '');
    return from(
      this.supabase.from('telegram_links').insert({ user_id: userId, token })
    ).pipe(map(() => `https://t.me/${botUsername}?start=${token}`));
  }

  disconnect(userId: string): Observable<void> {
    return from(
      this.supabase.from('telegram_subscriptions').delete().eq('user_id', userId)
    ).pipe(map(() => undefined));
  }

  setNotifications(userId: string, enabled: boolean): Observable<void> {
    return from(
      this.supabase
        .from('telegram_subscriptions')
        .update({ notifications_enabled: enabled })
        .eq('user_id', userId)
    ).pipe(map(() => undefined));
  }
}
