import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';

import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth';

describe('authGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
  });

  it('allows access when token and user are present', () => {
    TestBed.overrideProvider(AuthService, {
      useValue: {
        getSsoToken: () => 'token',
        getCurrentUser: () => ({ email: 'user@test.com', role: 'MANAGER' }),
      },
    });

    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('redirects to login when session is missing', () => {
    TestBed.overrideProvider(AuthService, {
      useValue: {
        getSsoToken: () => null,
        getCurrentUser: () => null,
      },
    });

    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    const router = TestBed.inject(Router);

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe(router.parseUrl('/login').toString());
  });
});
