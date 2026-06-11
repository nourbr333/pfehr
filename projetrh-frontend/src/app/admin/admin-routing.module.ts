import { Routes } from '@angular/router';
import { AdminGuard } from './admin.guard';
import { DashboardAdminComponent } from '../pages/admin-dashboard/dashboard-admin.component';
import { UtilisateursComponent } from '../pages/admin-utilisateurs/utilisateurs.component';
import { LogsComponent } from '../pages/admin-logs/logs.component';
import { VueResponsablesComponent } from '../pages/admin-vue-responsables/vue-responsables.component';
import { VueManagersComponent } from '../pages/admin-vue-managers/vue-managers.component';

export const adminRoutes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    component: DashboardAdminComponent,
    canActivate: [AdminGuard]
  },
  {
    path: 'vue-responsables',
    component: VueResponsablesComponent,
    canActivate: [AdminGuard]
  },
  {
    path: 'vue-managers',
    component: VueManagersComponent,
    canActivate: [AdminGuard]
  },
  {
    path: 'utilisateurs',
    component: UtilisateursComponent,
    canActivate: [AdminGuard]
  },
  {
    path: 'logs',
    component: LogsComponent,
    canActivate: [AdminGuard]
  }
];

