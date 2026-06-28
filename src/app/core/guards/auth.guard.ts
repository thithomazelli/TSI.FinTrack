import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.session$.pipe(
    take(1),
    map(session => {
      if (session) return true;
      router.navigate(['/auth/login']);
      return false;
    })
  );
};
