import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export function roleGuard(allowedRoles: string[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const role = auth.getCurrentUser()?.role;

    if (role && allowedRoles.includes(role)) {
      return true;
    }
    return router.parseUrl('/login');
  };
}
