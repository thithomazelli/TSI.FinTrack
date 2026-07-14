import { Injectable, inject } from '@angular/core';
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

  async getSubscription(userId: string): Promise<TelegramSubscription | null> {
    const res = await this.supabase
      .from('telegram_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (!res.data) return null;
    const d = res.data;
    return {
      id: d.id,
      userId: d.user_id,
      chatId: d.chat_id,
      notificationsEnabled: d.notifications_enabled,
      linkedAt: d.linked_at,
    };
  }

  async generateLinkToken(userId: string, botUsername: string): Promise<{ url: string; token: string }> {
    const token = crypto.randomUUID().replace(/-/g, '');
    const res = await this.supabase.from('telegram_links').insert({ user_id: userId, token }).select();
    if (res.error) throw new Error(res.error.message);
    return { url: `https://t.me/${botUsername}?start=${token}`, token };
  }

  async disconnect(userId: string): Promise<void> {
    await this.supabase.from('telegram_subscriptions').delete().eq('user_id', userId);
  }

  async setNotifications(userId: string, enabled: boolean): Promise<void> {
    await this.supabase
      .from('telegram_subscriptions')
      .update({ notifications_enabled: enabled })
      .eq('user_id', userId);
  }
}
