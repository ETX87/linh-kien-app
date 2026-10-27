import type { Env } from "../types";

// Env cua Worker cho cac ham thu vien KHONG nhan env qua tham so (vd canBangPxk o lib/quyKtv.ts - goi tu hang chuc cho) ma doi khi can
// chay tiep 1 buoc co thong bao (2026-10-27: phieu du tien bang quy tu "Kế toán đã duyệt" -> xet lai don "Chờ thanh toán" trong phieu,
// giong luc Ke toan bam duyet). Gan o dau moi request / cron (index.ts). Bindings cua 1 Worker khong doi giua cac request nen dung chung an toan.
let envHienTai: Env | null = null;

export function ganEnvToanCuc(env: Env): void {
  envHienTai = env;
}

export function layEnvToanCuc(): Env | null {
  return envHienTai;
}
