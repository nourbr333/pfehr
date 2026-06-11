import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ToastEvent, ToastService } from './toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss'
})
export class ToastComponent implements OnInit, OnDestroy {
  toasts: ToastEvent[] = [];
  private sub: Subscription | null = null;

  constructor(private toastService: ToastService) {}

  ngOnInit(): void {
    this.sub = this.toastService.toasts$.subscribe(t => {
      if (t.dismiss) {
        this.dismiss(t.id);
        return;
      }
      const existingIndex = this.toasts.findIndex(x => x.id === t.id);
      if (existingIndex >= 0) {
        this.toasts[existingIndex] = t;
        this.toasts = [...this.toasts];
      } else {
        this.toasts = [t, ...this.toasts].slice(0, 4);
      }
      if (!t.sticky) {
        const durationMs = t.durationMs ?? 3000;
        window.setTimeout(() => {
          this.dismiss(t.id);
        }, durationMs);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  dismiss(id: string): void {
    this.toasts = this.toasts.filter(x => x.id !== id);
  }
}

