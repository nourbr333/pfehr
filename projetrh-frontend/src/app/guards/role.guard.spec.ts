import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';

import { roleGuard } from './role.guard';
import { AuthService } from '../services/auth';

describe('roleGuard', () => {
  const guard = roleGuard(['MANAGER', 'ADMIN']);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
  });

  it('allows access for an authorized role', () => {
    TestBed.overrideProvider(AuthService, {
      useValue: {
        getCurrentUser: () => ({ role: 'MANAGER' }),
      },
    });

    const result = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('redirects to login for an unauthorized role', () => {
    TestBed.overrideProvider(AuthService, {
      useValue: {
        getCurrentUser: () => ({ role: 'RESPONSABLE_RH' }),
      },
    });

    const result = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    const router = TestBed.inject(Router);

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe(router.parseUrl('/login').toString());
  });
});
