import { Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AppNotification, NotificationService, NotificationType } from '../../services/notification.service';

@Component({
  selector: 'app-notifications-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications-panel.html',
  styleUrl: './notifications-panel.scss'
})
export class NotificationsPanelComponent implements OnInit, OnDestroy {
  isOpen = false;
  notifications: AppNotification[] = [];
  unreadCount = 0;

  private subscription?: Subscription;

  constructor(
    private notificationService: NotificationService,
    private elementRef: ElementRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.subscription = this.notificationService.notifications$.subscribe(notifications => {
      this.notifications = notifications;
      this.unreadCount = notifications.filter(n => !n.read).length;
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  close(): void {
    this.isOpen = false;
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
  }

  markAsRead(notification: AppNotification): void {
    if (!notification.read) {
      this.notificationService.markAsRead(notification.id);
    }
    const targetUrl = notification.targetUrl?.trim();
    if (targetUrl) {
      this.close();
      void this.router.navigateByUrl(targetUrl);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen && !this.elementRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  getTimeAgo(date: Date): string {
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days === 1) return 'Hier';
    return `Il y a ${days}j`;
  }

  getIcon(type: NotificationType): string {
    const icons: Record<NotificationType, string> = {
      conge: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
      absence: 'M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.97L13.75 4a2 2 0 00-3.5 0L3.32 16.03A2 2 0 005.07 19z',
      employe: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
      employe_embauche: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
      employe_equipe: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
      performance: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
      reunion: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
      systeme: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
      avertissement: 'M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.97L13.75 4a2 2 0 00-3.5 0L3.32 16.03A2 2 0 005.07 19z',
      validation: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      expired: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
      relance_eval: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
      invitation_equipe: 'M18 21a8 8 0 0 0-16 0M10 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8 8v6m3-3h-6'
    };
    return icons[type];
  }

  getIconColor(type: NotificationType): string {
    const colors: Record<NotificationType, string> = {
      conge: '#2563eb',
      absence: '#f59e0b',
      employe: '#22c55e',
      employe_embauche: '#22c55e',
      employe_equipe: '#16a34a',
      performance: '#8b5cf6',
      reunion: '#06b6d4',
      systeme: '#6b7280',
      avertissement: '#ef4444',
      validation: '#2563eb',
      expired: '#d97706',
      relance_eval: '#7c3aed',
      invitation_equipe: '#0ea5e9'
    };
    return colors[type];
  }

  getIconBg(type: NotificationType): string {
    const bgs: Record<NotificationType, string> = {
      conge: '#eff6ff',
      absence: '#fffbeb',
      employe: '#f0fdf4',
      employe_embauche: '#f0fdf4',
      employe_equipe: '#ecfdf5',
      performance: '#f5f3ff',
      reunion: '#ecfeff',
      systeme: '#f9fafb',
      avertissement: '#fef2f2',
      validation: '#eff6ff',
      expired: '#fff7ed',
      relance_eval: '#f5f3ff',
      invitation_equipe: '#f0f9ff'
    };
    return bgs[type];
  }
}
