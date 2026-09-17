import type { Env } from "../types";
import { fetchEtxNhanSuAll, type EtxNhanSuItem } from "./etxNhanSuClient";
import { nowVN } from "./vnTime";

// Dong bo (PULL, 1 chieu tu ETX ve) danh ba etx_nhan_su - chay 1 lan/7 ngay qua cron (xem index.ts
// scheduled(), gate theo thu+gio UTC) hoac bam tay qua routes/etxNhanSuSync.ts. Full-refresh moi lan
// (doi tac khong ho tro tham so "since") nen DIFF tai day - CHI ghi dong nao THUC SU khac, giong het
// tinh than gia88Sync.ts. Rieng ma_ktv la cot Admin tu quan ly (xem routes/etxNhanSuSync.ts PATCH
// /:maNhanSu/ma-ktv) - sync KHONG BAO GIO doc/ghi cot nay trong cau UPDATE thuong.

interface EtxNhanSuRow {
  ma_nhan_su: string;
  ho_ten: string;
  chuc_danh: string | null;
  ma_chuc_danh: string | null;
  gmail: string | null;
  trang_thai_lam_viec: string;
  tai_khoan_lada_ma: string | null;
  tai_khoan_lada_ten: string | null;
  quan_ly_truc_tiep: string | null;
  ma_ktv: string | null;
}

export interface EtxNhanSuSyncResult {
  changedCount: number;
  insertedCount: number;
  total: number;
}

const CHUNK_SIZE = 500;

function normalFieldsDiffer(existing: EtxNhanSuRow, item: EtxNhanSuItem, maChucDanhJson: string, quanLyTrucTiepJson: string): boolean {
  return (
    existing.ho_ten !== item.hoTen ||
    existing.chuc_danh !== item.chucDanh ||
    existing.ma_chuc_danh !== maChucDanhJson ||
    existing.gmail !== item.gmail ||
    existing.tai_khoan_lada_ma !== (item.taiKhoanLada?.maLada ?? null) ||
    existing.tai_khoan_lada_ten !== (item.taiKhoanLada?.tenLada ?? null) ||
    existing.quan_ly_truc_tiep !== quanLyTrucTiepJson
  );
}

async function runInChunks(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    await db.batch(statements.slice(i, i + CHUNK_SIZE));
  }
}

export async function runEtxNhanSuSync(env: Env, db: D1Database): Promise<EtxNhanSuSyncResult> {
  const items = await fetchEtxNhanSuAll(env);

  const { results: existingRows } = await db
    .prepare(
      "SELECT ma_nhan_su, ho_ten, chuc_danh, ma_chuc_danh, gmail, trang_thai_lam_viec, tai_khoan_lada_ma, tai_khoan_lada_ten, quan_ly_truc_tiep, ma_ktv FROM etx_nhan_su",
    )
    .all<EtxNhanSuRow>();
  const existingMap = new Map(existingRows.map((r) => [r.ma_nhan_su, r]));

  const now = nowVN();
  const writeStatements: D1PreparedStatement[] = [];
  // { maKtv, biKhoa } - danh sach can cascade khoa/mo khoa users sau khi ghi xong danh ba (tranh doc
  // du lieu chua commit).
  const toggles: { maKtv: string; biKhoa: 0 | 1 }[] = [];
  let changedCount = 0;
  let insertedCount = 0;

  for (const item of items) {
    const ma = item.maNhanSu?.trim();
    if (!ma) continue;
    const maChucDanhJson = JSON.stringify(item.maChucDanh ?? []);
    const quanLyTrucTiepJson = JSON.stringify(item.quanLyTrucTiep ?? []);
    const existing = existingMap.get(ma);

    if (!existing) {
      writeStatements.push(
        db
          .prepare(
            `INSERT INTO etx_nhan_su (ma_nhan_su, ho_ten, chuc_danh, ma_chuc_danh, gmail, trang_thai_lam_viec, tai_khoan_lada_ma, tai_khoan_lada_ten, quan_ly_truc_tiep, ma_ktv, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          )
          .bind(
            ma, item.hoTen, item.chucDanh, maChucDanhJson, item.gmail, item.trangThaiLamViec,
            item.taiKhoanLada?.maLada ?? null, item.taiKhoanLada?.tenLada ?? null, quanLyTrucTiepJson,
            now, now,
          ),
      );
      insertedCount++;
      continue;
    }

    let rowChanged = false;
    if (normalFieldsDiffer(existing, item, maChucDanhJson, quanLyTrucTiepJson) || existing.trang_thai_lam_viec !== item.trangThaiLamViec) {
      writeStatements.push(
        db
          .prepare(
            `UPDATE etx_nhan_su SET ho_ten = ?, chuc_danh = ?, ma_chuc_danh = ?, gmail = ?, trang_thai_lam_viec = ?, tai_khoan_lada_ma = ?, tai_khoan_lada_ten = ?, quan_ly_truc_tiep = ?, updated_at = ? WHERE ma_nhan_su = ?`,
          )
          .bind(
            item.hoTen, item.chucDanh, maChucDanhJson, item.gmail, item.trangThaiLamViec,
            item.taiKhoanLada?.maLada ?? null, item.taiKhoanLada?.tenLada ?? null, quanLyTrucTiepJson,
            now, ma,
          ),
      );
      rowChanged = true;
    }
    if (rowChanged) changedCount++;

    // So sanh voi gia tri DANG LUU TRONG DB (khong phai tin hieu nao khac) - phat hien dung 1 lan
    // chuyen trang thai giua 2 lan dong bo. ma_ktv doc tu Map (sync khong dung cot nay nen van dung).
    if (existing.trang_thai_lam_viec !== item.trangThaiLamViec && existing.ma_ktv) {
      toggles.push({ maKtv: existing.ma_ktv, biKhoa: item.trangThaiLamViec === "off" ? 1 : 0 });
    }
  }

  if (writeStatements.length > 0) await runInChunks(db, writeStatements);

  if (toggles.length > 0) {
    await runInChunks(
      db,
      toggles.map((t) =>
        db
          .prepare(
            `UPDATE users SET bi_khoa = ? WHERE email IN (SELECT email_dang_nhap FROM ktv_lien_he WHERE ma_ktv = ? AND email_dang_nhap IS NOT NULL)`,
          )
          .bind(t.biKhoa, t.maKtv),
      ),
    );
  }

  return { changedCount, insertedCount, total: items.length };
}

// Wrapper dung boi CA cron (scheduled(), 1 lan/7 ngay) LAN nut "Dong bo ngay" thu cong
// (routes/etxNhanSuSync.ts) - boc try/catch de 1 lan loi (ETX down/sai key) khong lam crash cron, va
// LUON ghi lai etx_nhan_su_sync_state (thanh cong hay loi) de UI biet lan chay gan nhat the nao -
// giong het pattern runGia88SyncWithState().
export async function runEtxNhanSuSyncWithState(env: Env, db: D1Database): Promise<void> {
  try {
    const result = await runEtxNhanSuSync(env, db);
    await db
      .prepare("UPDATE etx_nhan_su_sync_state SET last_run_at = ?, last_status = 'ok', changed_count = ?, last_error = NULL WHERE id = 1")
      .bind(nowVN(), result.changedCount + result.insertedCount)
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .prepare("UPDATE etx_nhan_su_sync_state SET last_run_at = ?, last_status = 'error', last_error = ? WHERE id = 1")
      .bind(nowVN(), message.slice(0, 500))
      .run();
  }
}
