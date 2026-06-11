import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastEvent {
  id: string;
  type: ToastType;
  message: string;
  sticky?: boolean;
  durationMs?: number;
  dismiss?: boolean;
}

export interface ToastOptions {
  id?: string;
  sticky?: boolean;
  durationMs?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly subject = new Subject<ToastEvent>();
  readonly toasts$ = this.subject.asObservable();

  success(message: string, options?: ToastOptions) {
    this.emit('success', message, options);
  }

  error(message: string, options?: ToastOptions) {
    this.emit('error', message, options);
  }

  warning(message: string, options?: ToastOptions) {
    this.emit('warning', message, options);
  }

  info(message: string, options?: ToastOptions) {
    this.emit('info', message, options);
  }

  dismiss(id: string) {
    this.subject.next({
      id,
      type: 'info',
      message: '',
      dismiss: true
    });
  }

  private emit(type: ToastType, message: string, options?: ToastOptions) {
    const id = options?.id ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    this.subject.next({
      id,
      type,
      message,
      sticky: options?.sticky ?? false,
      durationMs: options?.durationMs
    });
  }
}

