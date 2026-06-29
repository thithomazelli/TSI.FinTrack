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

  /** Emite true assim que a sessão inicial foi determinada (getSession resolveu). */
  private readonly readySubject = new BehaviorSubject<boolean>(false);
  readonly ready$ = this.readySubject.asObservable();

  constructor() {
    this.supabase.client.auth.getSession().then(({ data }) => {
      this.sessionSubject.next(data.session);
      this.readySubject.next(true);
    });

    this.supabase.client.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        this.logger.info('Auth state changed', event);
        this.sessionSubject.next(session);
        this.readySubject.next(true);

        // Só redireciona em login real (usuário na tela de login).
        // Em restauração de sessão / refresh de token, mantém a rota atual.
        if (event === 'SIGNED_IN' && this.router.url.startsWith('/auth')) {
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
