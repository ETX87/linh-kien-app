import { SL_HO_TRO_0D_SQL } from "./congNoKtv";

// Thong tin LIEN QUAN theo ma linh kien (2026-10-16) - dung CHUNG cho API doi tac GET /api/partner/v1/linh-kien/chi-tiet (nhieu ma,
// khong gioi han pham vi) va drawer xem LK o Bang gia GET /api/settings/linh-kien/:ma/lien-quan (1 ma, ton kho KTV theo pham vi nguoi
// xem). `masJson` = JSON array ma LK (1 bind json_each - khong vuong gioi han 100 tham so D1). Moi dong tra kem `ma` de gom theo LK.
const IN_MAS = "(SELECT value FROM json_each(?))";

export type ThayTheRow = { ma: string; nhom_id: number; ten_nhom: string; ma_thay_the: string; ten_thay_the: string | null; bat_tat: number | null };
export type ComboRow = { ma: string; ma_combo: string; ten_combo: string; bat_tat: number; so_luong_trong_combo: number; thanh_phan: string };
export type TonKtvRow = {
  ma: string; ma_ktv: string | null; ma_kho: string | null; ten_ktv: string | null; khu_vuc_ma: string | null;
  cuoi_ky: number | null; sl_ho_tro_0d: number; cong_no: number;
};
export type TonKhoRow = { ma: string; ma_kho: string; ten_kho: string | null; cuoi_ky: number | null };

// Pham vi ton kho KTV: whereSql tren alias `k` (ktv_lien_he) - xem scopeKtvTonKho() o lib/scopeDatMua.ts. null = khong gioi han
// (gom ca dong "mã kho chưa khớp" ma_ktv NULL); co pham vi thi chi dong da khop KTV trong pham vi.
export async function docLienQuanLk(
  db: D1Database, masJson: string, phamViKtv: { whereSql: string; binds: string[] } | null = null,
): Promise<{ phienBanTonKho: string | null; thayThe: ThayTheRow[]; combo: ComboRow[]; tuKhoa: { ma: string; tu_khoa: string }[]; tonKtv: TonKtvRow[]; tonKho: TonKhoRow[] }> {
  const [meta, thayThe, combo, tuKhoa, tonKtv, tonKho] = await Promise.all([
    db.prepare("SELECT updated_at FROM app_settings WHERE key = 'ktv_ton_kho_import_meta'").first<{ updated_at: string }>(),
    db.prepare(
      `SELECT ct.ma_lk AS ma, n.id AS nhom_id, n.ten_nhom, ct2.ma_lk AS ma_thay_the, COALESCE(lk2.ten_linh_kien, ct2.ten_lk) AS ten_thay_the, lk2.bat_tat
       FROM lk_nhom_thay_the_ct ct
       JOIN lk_nhom_thay_the n ON n.id = ct.nhom_id
       JOIN lk_nhom_thay_the_ct ct2 ON ct2.nhom_id = ct.nhom_id AND ct2.ma_lk <> ct.ma_lk
       LEFT JOIN linh_kien lk2 ON lk2.ma_linh_kien = ct2.ma_lk
       WHERE ct.ma_lk IN ${IN_MAS} ORDER BY n.id, ct2.stt, ct2.ma_lk`,
    ).bind(masJson).all<ThayTheRow>(),
    db.prepare(
      `SELECT x.ma_lk AS ma, cb.ma_combo, cb.ten_combo, cb.bat_tat, x.so_luong AS so_luong_trong_combo,
              (SELECT json_group_array(json_object('ma_linh_kien', t.ma_lk, 'so_luong', t.so_luong))
               FROM (SELECT ma_lk, so_luong FROM lk_combo_ct WHERE ma_combo = cb.ma_combo ORDER BY stt, ma_lk) t) AS thanh_phan
       FROM lk_combo_ct x JOIN lk_combo cb ON cb.ma_combo = x.ma_combo
       WHERE x.ma_lk IN ${IN_MAS} ORDER BY cb.ma_combo`,
    ).bind(masJson).all<ComboRow>(),
    db.prepare(`SELECT ma_linh_kien AS ma, tu_khoa FROM lk_tu_khoa WHERE ma_linh_kien IN ${IN_MAS}`).bind(masJson).all<{ ma: string; tu_khoa: string }>(),
    db.prepare(
      `SELECT t.ma_hang AS ma, t.ma_ktv, t.ma_kho, COALESCE(k.ten_hien_thi, k.ten_misa, t.ten_kho) AS ten_ktv, k.khu_vuc_ma, t.cuoi_ky,
              ${SL_HO_TRO_0D_SQL("t")} AS sl_ho_tro_0d,
              (t.cuoi_ky - ${SL_HO_TRO_0D_SQL("t")}) * COALESCE(lk.gia_tri_cong_no, 0) AS cong_no
       FROM ktv_ton_kho t
       LEFT JOIN ktv_lien_he k ON k.ma_ktv = t.ma_ktv
       LEFT JOIN linh_kien lk ON lk.ma_linh_kien = t.ma_hang
       WHERE t.ma_hang IN ${IN_MAS} ${phamViKtv ? `AND k.ma_ktv IS NOT NULL AND ${phamViKtv.whereSql}` : ""}
       ORDER BY t.ma_hang, t.ma_kho`,
    ).bind(masJson, ...(phamViKtv?.binds ?? [])).all<TonKtvRow>(),
    db.prepare(
      `SELECT t.ma_hang AS ma, t.kho_ma AS ma_kho, kc.ten AS ten_kho, t.cuoi_ky
       FROM kho_cong_ty_ton_kho t LEFT JOIN kho_cong_ty kc ON kc.ma = t.kho_ma
       WHERE t.ma_hang IN ${IN_MAS} ORDER BY t.ma_hang, t.kho_ma`,
    ).bind(masJson).all<TonKhoRow>(),
  ]);
  return {
    phienBanTonKho: meta?.updated_at ?? null,
    thayThe: thayThe.results, combo: combo.results, tuKhoa: tuKhoa.results, tonKtv: tonKtv.results, tonKho: tonKho.results,
  };
}
