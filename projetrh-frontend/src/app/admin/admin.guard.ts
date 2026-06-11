import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(private router: Router, private auth: AuthService) {}

  canActivate(): boolean | UrlTree {
    if (!this.auth.getSsoToken() || !this.auth.getCurrentUser()) {
      return this.router.parseUrl('/login');
    }
    if (this.auth.getCurrentUser()?.role === 'ADMIN') {
      return true;
    }
    return this.router.parseUrl('/login');
  }
}

