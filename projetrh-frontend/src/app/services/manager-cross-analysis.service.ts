import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ManagerCrossAnalysis } from './manager-advanced-absences.service';

@Injectable({ providedIn: 'root' })
export class ManagerCrossAnalysisService {
  private readonly baseUrl = 'http://localhost:8080/api/managers';

  constructor(private http: HttpClient) {}

  getCrossAnalysis(managerId: number): Observable<ManagerCrossAnalysis> {
    return this.http.get<ManagerCrossAnalysis>(`${this.baseUrl}/${managerId}/cross-analysis`);
  }
}
