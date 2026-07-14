import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { SupabaseService } from '../services/supabase.service';
import { LoggingService } from '../services/logging.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly logger = inject(LoggingService);

  readonly session = signal<Session | null>(null);

  private readyResolve!: () => void;
  /** Resolves once the initial session has been determined. */
  readonly readyPromise = new Promise<void>(resolve => { this.readyResolve = resolve; });

  constructor() {
    this.supabase.client.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
      this.readyResolve();
    });

    this.supabase.client.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        this.logger.info('Auth state changed', event);
        this.session.set(session);
        this.readyResolve();

        if (event === 'SIGNED_IN' && this.router.url.startsWith('/auth')) {
          this.router.navigate(['/dashboard']);
        } else if (event === 'SIGNED_OUT') {
          this.router.navigate(['/auth/login']);
        }
      }
    );
  }

  get currentUser(): User | null {
    return this.session()?.user ?? null;
  }

  private readonly redirectTo = window.location.hostname === 'localhost'
    ? `${window.location.origin}/`
    : `${window.location.origin}/TSI.FinTrack/`;

  async signInWithGoogle(): Promise<void> {
    await this.supabase.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: this.redirectTo } });
  }

  async signInWithApple(): Promise<void> {
    await this.supabase.client.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: this.redirectTo } });
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
  }
}
