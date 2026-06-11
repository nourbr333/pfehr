import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.getSsoToken() && auth.getCurrentUser()) {
    return true;
  }
  return router.parseUrl('/login');
};
