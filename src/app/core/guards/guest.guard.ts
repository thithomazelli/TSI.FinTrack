import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, switchMap, take } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Aguarda a sessão inicial ser determinada para não liberar/bloquear
  // a tela de login com base no valor inicial (null).
  return authService.ready$.pipe(
    filter(ready => ready),
    take(1),
    switchMap(() => authService.session$.pipe(take(1))),
    map(session => {
      if (!session) return true;
      router.navigate(['/dashboard']);
      return false;
    })
  );
};
