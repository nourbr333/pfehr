import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface AgeGroupDTO {
  tranche: string;
  count: number;
}

export interface DepartementEvaluationDTO {
  departement: string;
  scoreMoyen: number;
}

export interface DashboardRhDTO {
  effectifTotal: number;
  ancienneteMoyenneAnnees: number;
  repartitionParDepartement: Record<string, number>;
  repartitionParGenre: Record<string, number>;
  pyramideAges: AgeGroupDTO[];
  evaluationsParDepartement: DepartementEvaluationDTO[];
  soldeCongeMoyen: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardRhService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8080/api/dashboard/rh/summary';

  getSummary(filters?: {
    departmentId?: number | null;
    ageBracket?: string | null;
    gender?: string | null;
    search?: string | null;
  }): Observable<DashboardRhDTO> {
    let params = new HttpParams();
    if (filters?.departmentId !== undefined && filters?.departmentId !== null) {
      params = params.set('departmentId', filters.departmentId);
    }
    if (filters?.ageBracket) {
      params = params.set('ageBracket', filters.ageBracket);
    }
    if (filters?.gender) {
      params = params.set('gender', filters.gender);
    }
    if (filters?.search) {
      params = params.set('search', filters.search.trim());
    }
    return this.http.get<DashboardRhDTO>(this.apiUrl, { params });
  }
}
