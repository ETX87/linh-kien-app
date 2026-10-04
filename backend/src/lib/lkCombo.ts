// Combo linh kien (migration 0066_lk_combo.sql). Combo KHONG phai linh kien - form tao don / import Excel gui 1 dong ma
// combo, server tach thanh tung don LK thanh phan TRUOC moi buoc kiem tra (quy ma chuan, tra linh_kien, cong no, tu
// duyet...) nen moi don sinh ra di dung luong don thuong. Dung o POST /dat-mua-lk/phieu-dat + import don hang.

export interface ComboThanhPhan { ma_lk: string; so_luong: number }
export interface ComboDangBat { ma_combo: string; ten_combo: string; ct: ComboThanhPhan[] }

/** Chuan hoa ma combo: bo khoang trang, ";" -> "," (file cu ghi "a;b;c"). Dung CHUNG luc luu combo va luc tra cuu. */
export function chuanMaCombo(s: unknown): string {
  return String(s ?? "").trim().replace(/\s+/g, "").replace(/;/g, ",");
}

/** Cac combo DANG BAT co ma nam trong danh sach (da chuan hoa), kem thanh phan theo stt. 1 bind JSON (json_each). */
export async function layComboDangBat(db: D1Database, maList: unknown[]): Promise<Map<string, ComboDangBat>> {
  const ma = [...new Set(maList.map(chuanMaCombo).filter(Boolean))];
  const map = new Map<string, ComboDangBat>();
  if (ma.length === 0) return map;
  const { results } = await db
    .prepare(
      `SELECT c.ma_combo, c.ten_combo, ct.ma_lk, ct.so_luong
       FROM lk_combo c JOIN lk_combo_ct ct ON ct.ma_combo = c.ma_combo
       WHERE c.bat_tat = 1 AND c.ma_combo IN (SELECT value FROM json_each(?))
       ORDER BY c.ma_combo, ct.stt, ct.ma_lk`,
    )
    .bind(JSON.stringify(ma))
    .all<{ ma_combo: string; ten_combo: string; ma_lk: string; so_luong: number }>();
  for (const r of results) {
    let c = map.get(r.ma_combo);
    if (!c) map.set(r.ma_combo, (c = { ma_combo: r.ma_combo, ten_combo: r.ten_combo, ct: [] }));
    c.ct.push({ ma_lk: r.ma_lk, so_luong: r.so_luong });
  }
  return map;
}

/**
 * Tach cac dong la ma combo thanh tung dong LK thanh phan (giu nguyen moi truong khac cua dong, SL = SL combo x SL thanh
 * phan, gan combo_ma). Dong khong phai combo giu nguyen. `goc` = vi tri dong ban dau (bao loi theo dong file import).
 */
export async function tachComboDong<T extends object>(
  db: D1Database,
  dong: T[],
  layMa: (d: T) => unknown,
  laySl: (d: T) => number,
  dung: (d: T, maLk: string, soLuong: number, comboMa: string) => T,
): Promise<{ dong: T; goc: number; comboMa: string | null }[]> {
  const combos = await layComboDangBat(db, dong.map(layMa));
  const out: { dong: T; goc: number; comboMa: string | null }[] = [];
  dong.forEach((d, i) => {
    const combo = combos.get(chuanMaCombo(layMa(d)));
    if (!combo) {
      out.push({ dong: d, goc: i, comboMa: null });
      return;
    }
    for (const tp of combo.ct) out.push({ dong: dung(d, tp.ma_lk, laySl(d) * tp.so_luong, combo.ma_combo), goc: i, comboMa: combo.ma_combo });
  });
  return out;
}
