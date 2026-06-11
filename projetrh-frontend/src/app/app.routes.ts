import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login';
import { AccueilManagerComponent } from './pages/accueil-manager/accueil-manager';
import { AccueilRespComponent } from './pages/accueil-resp/accueil-resp-page';
import { NotesRespComponent } from './pages/notes-resp/notes-resp';
import { ProfilComponent } from './pages/profil/profil';
import { EmployesComponent } from './pages/employes/employes';
import { DepartementsComponent } from './pages/departements/departements';
import { CalendrierComponent } from './pages/calendrier/calendrier';
import { ManagerEquipeComponent } from './pages/manager-equipe/manager-equipe';
import { ManagerRapportsComponent } from './pages/manager-rapports/manager-rapports';
import { ManagerOkrComponent } from './pages/manager-okr/manager-okr';
import { ManagerAdvancedAbsencesComponent } from './pages/manager-advanced-absences/manager-advanced-absences';
import { ManagerEvaluationsComponent } from './pages/manager-evaluations/manager-evaluations';
import { RhRapportsComponent } from './rh/rapports/rh-rapports.component';
import { PerformancesEvaluationsComponent } from './rh/performances-evaluations/performances-evaluations.component';
import { AdminGuard } from './admin/admin.guard';
import { adminRoutes } from './admin/admin-routing.module';
import { HomeComponent } from './home/home';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';

const managerRoles = ['MANAGER', 'ADMIN'];
const rhRoles = ['RESPONSABLE_RH', 'ADMIN'];

export const routes: Routes = [
  { path: '',                component: HomeComponent, pathMatch: 'full' },
  { path: 'home',            component: HomeComponent },
  { path: 'login',           component: LoginComponent },
  { path: 'signup',          redirectTo: '/login', pathMatch: 'full' },
  { path: 'accueil-admin',   redirectTo: '/accueil-resp', pathMatch: 'full' },
  { path: 'accueil-manager', component: AccueilManagerComponent, canActivate: [authGuard, roleGuard(managerRoles)] },
  { path: 'accueil-resp',    component: AccueilRespComponent, canActivate: [authGuard, roleGuard(rhRoles)] },
  { path: 'resp/notes',      component: NotesRespComponent, canActivate: [authGuard, roleGuard(rhRoles)] },
  { path: 'profil',          component: ProfilComponent, canActivate: [authGuard] },
  { path: 'employes',        component: EmployesComponent, canActivate: [authGuard] },
  { path: 'departements',    component: DepartementsComponent, canActivate: [authGuard] },
  { path: 'calendrier',      component: CalendrierComponent, canActivate: [authGuard] },
  { path: 'manager/calendrier', component: CalendrierComponent, canActivate: [authGuard, roleGuard(managerRoles)] },
  { path: 'manager/equipe',  component: ManagerEquipeComponent, canActivate: [authGuard, roleGuard(managerRoles)] },
  { path: 'manager/absences-avancees', component: ManagerAdvancedAbsencesComponent, canActivate: [authGuard, roleGuard(managerRoles)] },
  { path: 'manager/okr', component: ManagerOkrComponent, canActivate: [authGuard, roleGuard(managerRoles)] },
  { path: 'manager/evaluations', component: ManagerEvaluationsComponent, canActivate: [authGuard, roleGuard(managerRoles)] },
  { path: 'manager/rapports', component: ManagerRapportsComponent, canActivate: [authGuard, roleGuard(managerRoles)] },
  { path: 'rh/rapports', component: RhRapportsComponent, canActivate: [authGuard, roleGuard(rhRoles)] },
  { path: 'performances-evaluations', component: PerformancesEvaluationsComponent, canActivate: [authGuard, roleGuard(rhRoles)] },
  {
    path: 'absences-conges',
    canActivate: [authGuard, roleGuard(rhRoles)],
    loadComponent: () => import('./rh/absences-conges/absences-conges.component').then((m) => m.AbsencesCongesComponent)
  },
  {
    path: 'admin',
    canActivate: [authGuard, AdminGuard],
    children: adminRoutes
  },
  { path: '**',              redirectTo: 'home' }
];
