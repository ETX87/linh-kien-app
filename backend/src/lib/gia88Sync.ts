import type { Env } from "../types";
import { fetchGia88Prices, type Gia88Item } from "./gia88Client";
import { computeAndStoreHash } from "./contentHash";
import { nowVN } from "./vnTime";

// Dong bo (PULL, 1 chieu tu doi tac ve) danh muc linh_kien tu API gia88 - chay 1 lan/dem qua cron
// (xem index.ts scheduled(), gate theo gio UTC=17 tuc 0h VN) hoac bam tay qua routes/gia88Sync.ts.
// Doi tac KHONG ho tro tham so "since"/mock thay doi (xem api-lk-prices_gia88.md) nen luon PULL FULL
// roi tu DIFF tai day - CHI ghi (UPDATE/INSERT) dong nao THUC SU khac, tranh bump ngay_cap_nhat hang
// loat lam dvbhSyncClient.ts tuong toan bo danh muc "vua doi" moi dem.
//
// gia_tri_cong_no (map tu giaKTV) la NGOAI LE: giu nguyen co che "im lang" da co tu migration 0017 -
// UPDATE rieng, KHONG dung ngay_cap_nhat/nguoi_cap_nhat, vi cot nay KHONG dong bo sang DVBH/suachua
// (xem routes/settingsDatMua.ts PATCH /linh-kien/:ma/gia-tri-cong-no).

interface LinhKienRow {
  ma_linh_kien: string;
  ten_linh_kien: string;
  gia_ban: number | null;
  gia_du_phong: number | null;
  gia_eu: number | null;
  don_vi_nhap: string | null;
  nhan_hang: string | null;
  thiet_bi: string | null;
  don_vi_tinh: string | null;
  ghi_chu_doi_tac: string | null;
  cam_ban: number;
  gia_tri_cong_no: number | null;
}

export interface Gia88SyncResult {
  changedCount: number;
  insertedCount: number;
  total: number;
}

function normalFieldsDiffer(existing: LinhKienRow, item: Gia88Item): boolean {
  return (
    existing.ten_linh_kien !== item.tenLinhKien ||
    existing.gia_ban !== item.giaNY ||
    existing.gia_du_phong !== item.giaDuPhong ||
    existing.gia_eu !== item.giaEU ||
    existing.don_vi_nhap !== item.donViNhap ||
    existing.nhan_hang !== item.nhanHang ||
    existing.thiet_bi !== item.thietBi ||
    existing.don_vi_tinh !== item.donViTinh ||
    existing.ghi_chu_doi_tac !== item.ghiChuDacBiet ||
    !!existing.cam_ban !== item.camBan
  );
}

export async function runGia88Sync(env: Env, db: D1Database): Promise<Gia88SyncResult> {
  const items = await fetchGia88Prices(env);

  const { results: existingRows } = await db.prepare(
    "SELECT ma_linh_kien, ten_linh_kien, gia_ban, gia_du_phong, gia_eu, don_vi_nhap, nhan_hang, thiet_bi, don_vi_tinh, ghi_chu_doi_tac, cam_ban, gia_tri_cong_no FROM linh_kien",
  ).all<LinhKienRow>();
  const existingMap = new Map(existingRows.map((r) => [r.ma_linh_kien, r]));

  const now = nowVN();
  const statements: D1PreparedStatement[] = [];
  let changedCount = 0;
  let insertedCount = 0;

  for (const item of items) {
    const ma = item.ma?.trim();
    if (!ma) continue;
    const existing = existingMap.get(ma);

    if (!existing) {
      statements.push(
        db.prepare(
          `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_ban, gia_du_phong, gia_eu, don_vi_nhap, nhan_hang, thiet_bi, don_vi_tinh, ghi_chu_doi_tac, cam_ban, gia_tri_cong_no, nguoi_cap_nhat, ngay_cap_nhat)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        ).bind(
          ma, item.tenLinhKien, item.giaNY, item.giaDuPhong, item.giaEU, item.donViNhap, item.nhanHang,
          item.thietBi, item.donViTinh, item.ghiChuDacBiet, item.camBan ? 1 : 0, item.giaKTV, now,
        ),
      );
      insertedCount++;
      continue;
    }

    let rowChanged = false;

    if (normalFieldsDiffer(existing, item)) {
      statements.push(
        db.prepare(
          `UPDATE linh_kien SET ten_linh_kien = ?, gia_ban = ?, gia_du_phong = ?, gia_eu = ?, don_vi_nhap = ?, nhan_hang = ?, thiet_bi = ?, don_vi_tinh = ?, ghi_chu_doi_tac = ?, cam_ban = ?, nguoi_cap_nhat = NULL, ngay_cap_nhat = ? WHERE ma_linh_kien = ?`,
        ).bind(
          item.tenLinhKien, item.giaNY, item.giaDuPhong, item.giaEU, item.donViNhap, item.nhanHang,
          item.thietBi, item.donViTinh, item.ghiChuDacBiet, item.camBan ? 1 : 0, now, ma,
        ),
      );
      rowChanged = true;
    }

    if (existing.gia_tri_cong_no !== item.giaKTV) {
      // Cau lenh RIENG, KHONG dung ngay_cap_nhat/nguoi_cap_nhat - xem giai thich dau file.
      statements.push(db.prepare("UPDATE linh_kien SET gia_tri_cong_no = ? WHERE ma_linh_kien = ?").bind(item.giaKTV, ma));
      rowChanged = true;
    }

    if (rowChanged) changedCount++;
  }

  if (statements.length > 0) {
    await db.batch(statements);
    const { results } = await db.prepare("SELECT * FROM linh_kien ORDER BY ma_linh_kien").all();
    await computeAndStoreHash(db, "linh_kien", results);
  }

  return { changedCount, insertedCount, total: items.length };
}

// Wrapper dung boi CA cron (scheduled(), 1 lan/dem) LAN nut "Dong bo ngay" thu cong
// (routes/gia88Sync.ts) - boc try/catch de 1 lan loi (doi tac down/sai key) khong lam crash cron, va
// LUON ghi lai gia88_sync_state (thanh cong hay loi) de UI "Dong bo Gia88" trong SettingsModule biet
// lan chay gan nhat the nao.
export async function runGia88SyncWithState(env: Env, db: D1Database): Promise<void> {
  try {
    const result = await runGia88Sync(env, db);
    await db
      .prepare("UPDATE gia88_sync_state SET last_run_at = ?, last_status = 'ok', changed_count = ?, last_error = NULL WHERE id = 1")
      .bind(nowVN(), result.changedCount + result.insertedCount)
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .prepare("UPDATE gia88_sync_state SET last_run_at = ?, last_status = 'error', last_error = ? WHERE id = 1")
      .bind(nowVN(), message.slice(0, 500))
      .run();
  }
}
