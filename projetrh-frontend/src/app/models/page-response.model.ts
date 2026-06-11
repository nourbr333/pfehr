export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
  tabCounts?: Record<string, number>;
}

export interface PageRequestParams {
  page?: number;
  size?: number;
  unpaged?: boolean;
}
