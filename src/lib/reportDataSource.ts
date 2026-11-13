import type { Tables, TableName } from "./reportDataTypes";

export type ReportQuery = { eq?: Record<string, unknown>; in?: Record<string, unknown[]>; order?: string; ascending?: boolean; limit?: number };
/** Read-only boundary shared by reports, template tests and future device storage. */
export interface ReportDataSource {
  readonly schoolId: string;
  readonly warnings?: string[];
  read<T extends TableName>(table: T, query?: ReportQuery): Promise<Tables<T>[]>;
  assetUrl(bucket: string, path: string | null | undefined): Promise<string | null>;
  fileBytes(bucket: string, path: string): Promise<Uint8Array>;
}

export interface DeviceReportStore {
  rows<T extends TableName>(schoolId: string, table: T): Promise<Tables<T>[]>;
  file(schoolId: string, bucket: string, path: string): Promise<Blob | null>;
}

/** Device database implementations supply records and original files, never expiring remote URLs. */
export class DeviceReportDataSource implements ReportDataSource {
  private urls = new Map<string, string>();
  constructor(readonly schoolId: string, private store: DeviceReportStore) {}
  async read<T extends TableName>(table: T, query: ReportQuery = {}): Promise<Tables<T>[]> {
    assertReportScope(this.schoolId, query);
    let rows = (await this.store.rows(this.schoolId, table)).filter(row => {
      const record = row as Record<string, unknown>;
      return record.school_id === this.schoolId && Object.entries(query.eq ?? {}).every(([k, v]) => record[k] === v)
        && Object.entries(query.in ?? {}).every(([k, values]) => values.includes(record[k]));
    });
    if (query.order) {
      const key = query.order;
      rows = rows.slice().sort((a, b) => {
        const av = (a as Record<string, unknown>)[key]; const bv = (b as Record<string, unknown>)[key];
        const order = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
        return query.ascending === false ? -order : order;
      });
    }
    return query.limit === undefined ? rows : rows.slice(0, query.limit);
  }
  async fileBytes(bucket: string, path: string) {
    const file = await this.store.file(this.schoolId, bucket, path);
    if (!file) throw new Error(`The saved ${bucket} file is not available on this device. Download this school's report files first.`);
    return new Uint8Array(await file.arrayBuffer());
  }
  async assetUrl(bucket: string, path: string | null | undefined) {
    if (!path) return null;
    const key = `${bucket}/${path}`;
    const existing = this.urls.get(key);
    if (existing) return existing;
    const bytes = await this.fileBytes(bucket, path);
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer]));
    this.urls.set(key, url);
    return url;
  }
  dispose() { this.urls.forEach(url => URL.revokeObjectURL(url)); this.urls.clear(); }
}

export function assertReportScope(schoolId: string, query: ReportQuery) {
  if (!schoolId || (query.eq?.school_id !== undefined && query.eq.school_id !== schoolId)) throw new Error("Report data must belong to the current school.");
}