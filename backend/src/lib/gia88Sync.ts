import type { Env } from "../types";
import { fetchGia88Prices, type Gia88Item } from "./gia88Client";
import { computeAndStoreHash } from "./contentHash";
import { nowVN } from "./vnTime";
import { TT_MA, logLk } from "./linhKienXetDuyet";
import { bumpVersions } from "./dataVersions";

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
  trang_thai_ma: string;
  co_tren_gia88: number;
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
    "SELECT ma_linh_kien, ten_linh_kien, gia_ban, gia_du_phong, gia_eu, don_vi_nhap, nhan_hang, thiet_bi, don_vi_tinh, ghi_chu_doi_tac, cam_ban, gia_tri_cong_no, trang_thai_ma, co_tren_gia88 FROM linh_kien",
  ).all<LinhKienRow>();
  const existingMap = new Map(existingRows.map((r) => [r.ma_linh_kien, r]));

  const now = nowVN();
  const statements: D1PreparedStatement[] = [];
  let changedCount = 0;
  let insertedCount = 0;
  let tuDongDuyet = 0;

  for (const item of items) {
    const ma = item.ma?.trim();
    if (!ma) continue;
    const existing = existingMap.get(ma);

    if (!existing) {
      statements.push(
        db.prepare(
          `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_ban, gia_du_phong, gia_eu, don_vi_nhap, nhan_hang, thiet_bi, don_vi_tinh, ghi_chu_doi_tac, cam_ban, gia_tri_cong_no, nguoi_cap_nhat, ngay_cap_nhat, trang_thai_ma, co_tren_gia88)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'Da xac nhan', 1)`,
        ).bind(
          ma, item.tenLinhKien, item.giaNY, item.giaDuPhong, item.giaEU, item.donViNhap, item.nhanHang,
          item.thietBi, item.donViTinh, item.ghiChuDacBiet, item.camBan ? 1 : 0, item.giaKTV, now,
        ),
      );
      insertedCount++;
      continue;
    }

    // LK tao trong app dang "Cho xet duyet" ma gia88 co DUNG ma nay (chot 2026-09-30) -> lay ten + moi gia theo gia88,
    // chuyen "Tu dong duyet" (ngay_cap_nhat moi -> day sang DVBH/Sua chua + cache o chon tao don nhan ten moi). Ten tren
    // don dang dung ma cap nhat theo ten gia88 (giong Mua hang xac nhan co sua ten).
    if (existing.trang_thai_ma === TT_MA.CHO) {
      statements.push(
        db.prepare(
          `UPDATE linh_kien SET ten_linh_kien = ?, gia_ban = ?, gia_du_phong = ?, gia_eu = ?, don_vi_nhap = ?, nhan_hang = ?, thiet_bi = ?, don_vi_tinh = ?, ghi_chu_doi_tac = ?, cam_ban = ?, gia_tri_cong_no = ?,
             trang_thai_ma = ?, co_tren_gia88 = 1, nguoi_cap_nhat = NULL, ngay_cap_nhat = ? WHERE ma_linh_kien = ?`,
        ).bind(
          item.tenLinhKien, item.giaNY, item.giaDuPhong, item.giaEU, item.donViNhap, item.nhanHang,
          item.thietBi, item.donViTinh, item.ghiChuDacBiet, item.camBan ? 1 : 0, item.giaKTV, TT_MA.TU_DONG, now, ma,
        ),
        logLk(db, {
          ma, hanhDong: "Tu dong duyet", tenCu: existing.ten_linh_kien, tenMoi: existing.ten_linh_kien !== item.tenLinhKien ? item.tenLinhKien : null,
          ghiChu: "Mã có trên bảng giá gia88 - lấy tên và giá theo gia88", nguoi: null,
        }),
      );
      if (existing.ten_linh_kien !== item.tenLinhKien) {
        statements.push(db.prepare("UPDATE dat_don_hang SET ten_lk_snapshot = ? WHERE ma_lk = ?").bind(item.tenLinhKien, ma));
      }
      tuDongDuyet++;
      changedCount++;
      continue;
    }

    let rowChanged = false;

    // Danh dau "co tren gia88" (gia do gia88 quan ly, Mua hang khong nhap gia tam nua) - im lang, khong doi ngay_cap_nhat.
    if (!existing.co_tren_gia88) statements.push(db.prepare("UPDATE linh_kien SET co_tren_gia88 = 1 WHERE ma_linh_kien = ?").bind(ma));

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

  // Ma KHONG con trong danh sach gia88 (danh sach FULL moi lan) -> co_tren_gia88 = 0 (Mua hang nhap duoc gia tam). Bo qua
  // khi gia88 tra rong (tranh 1 lan loi doi tac lam mo khoa gia tam toan bo danh muc).
  const maGia88 = items.map((i) => i.ma?.trim()).filter((m): m is string => !!m);
  const tapGia88 = new Set(maGia88);
  const coDoiGia88 = maGia88.length > 0 && existingRows.some((r) => r.co_tren_gia88 && !tapGia88.has(r.ma_linh_kien));
  if (coDoiGia88) {
    statements.push(
      db.prepare("UPDATE linh_kien SET co_tren_gia88 = 0 WHERE co_tren_gia88 = 1 AND ma_linh_kien NOT IN (SELECT value FROM json_each(?))").bind(JSON.stringify(maGia88)),
    );
  }

  if (statements.length > 0) {
    await db.batch(statements);
    const { results } = await db.prepare("SELECT * FROM linh_kien ORDER BY ma_linh_kien").all();
    await computeAndStoreHash(db, "linh_kien", results);
  }
  if (tuDongDuyet > 0) await bumpVersions(db, ["dat_mua_lk"]);

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
