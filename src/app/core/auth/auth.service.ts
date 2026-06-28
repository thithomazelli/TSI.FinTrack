import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { Observable, from, BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../services/supabase.service';
import { LoggingService } from '../services/logging.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly logger = inject(LoggingService);

  private readonly sessionSubject = new BehaviorSubject<Session | null>(null);
  readonly session$ = this.sessionSubject.asObservable();

  constructor() {
    this.supabase.client.auth.getSession().then(({ data }) => {
      this.sessionSubject.next(data.session);
    });

    this.supabase.client.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        this.logger.info('Auth state changed', event);
        this.sessionSubject.next(session);

        if (event === 'SIGNED_IN') {
          this.router.navigate(['/dashboard']);
        } else if (event === 'SIGNED_OUT') {
          this.router.navigate(['/auth/login']);
        }
      }
    );
  }

  get currentUser(): User | null {
    return this.sessionSubject.value?.user ?? null;
  }

  private readonly redirectTo = `${window.location.origin}/TSI.FinTrack/`;

  signInWithGoogle(): Observable<void> {
    return from(
      this.supabase.client.auth
        .signInWithOAuth({ provider: 'google', options: { redirectTo: this.redirectTo } })
        .then(() => undefined)
    );
  }

  signInWithApple(): Observable<void> {
    return from(
      this.supabase.client.auth
        .signInWithOAuth({ provider: 'apple', options: { redirectTo: this.redirectTo } })
        .then(() => undefined)
    );
  }

  signOut(): Observable<void> {
    return from(
      this.supabase.client.auth.signOut().then(() => undefined)
    );
  }
}
