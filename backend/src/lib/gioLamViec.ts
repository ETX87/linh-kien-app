/**
 * Gio lam viec dung cho MOI han SLA cua he thong (chot 2026-11-19, v1.527 — "các logic quá hạn SLA trên toàn bộ hệ thống từ
 * 24h =>8h, 48h => 16h làm việc (loại trừ 8h chủ nhật và 4h chiều thứ 7)").
 *
 * Tuan lam viec = 44 gio: Thu 2 - Thu 6 moi ngay 8 gio (08:00-12:00, 13:00-17:00), Thu 7 4 gio buoi sang (08:00-12:00),
 * Chu nhat nghi. Chua tru ngay le. Doi khung gio: sua CA_LAM_VIEC (moi han deu tu doi theo).
 *
 * Moc/han la chuoi gio VN "tho" "YYYY-MM-DD HH:MM:SS" (xem vnTime.ts) -> parse kem hau to "Z" de getUTC* doc dung gio VN.
 */

/** Khung lam viec theo thu (0 = CN … 6 = T7), don vi PHUT trong ngay [bat dau, ket thuc). */
const CA_LAM_VIEC: Record<number, [number, number][]> = {
  0: [],
  1: [[480, 720], [780, 1020]],
  2: [[480, 720], [780, 1020]],
  3: [[480, 720], [780, 1020]],
  4: [[480, 720], [780, 1020]],
  5: [[480, 720], [780, 1020]],
  6: [[480, 720]],
};

const PHUT = 60_000;
const NGAY = 86_400_000;

export function parseGioVn(s: string): Date {
  return new Date(s.replace(" ", "T").slice(0, 19) + "Z");
}
export function fmtGioVn(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function dauNgay(ms: number): number {
  return Math.floor(ms / NGAY) * NGAY;
}

/** Han = moc + `gio` GIO LAM VIEC. Moc ngoai gio lam viec -> bat dau dem tu dau ca ke tiep. Het dung cuoi ca -> han = cuoi ca
 * do (vd 17:00 thu 6), khong day sang ca sau. */
export function congGioLamViec(moc: Date, gio: number): Date {
  let con = Math.max(0, gio) * 3_600_000;
  let tuMs = moc.getTime();
  // Toi da ~10 nam - chi de chan vong lap vo han neu ai xoa het CA_LAM_VIEC.
  for (let i = 0; i < 3700; i++) {
    const ngay = dauNgay(tuMs);
    for (const [a, b] of CA_LAM_VIEC[new Date(ngay).getUTCDay()] ?? []) {
      const ketThuc = ngay + b * PHUT;
      const batDau = Math.max(ngay + a * PHUT, tuMs);
      if (batDau >= ketThuc) continue;
      if (ketThuc - batDau >= con) return new Date(batDau + con);
      con -= ketThuc - batDau;
    }
    tuMs = ngay + NGAY;
  }
  return new Date(tuMs);
}

/** So gio lam viec giua 2 moc (den <= tu -> 0). */
export function gioLamViecGiua(tu: Date, den: Date): number {
  let tong = 0;
  const denMs = den.getTime();
  for (let ngay = dauNgay(tu.getTime()); ngay < denMs; ngay += NGAY) {
    for (const [a, b] of CA_LAM_VIEC[new Date(ngay).getUTCDay()] ?? []) {
      const s = Math.max(ngay + a * PHUT, tu.getTime());
      const e = Math.min(ngay + b * PHUT, denMs);
      if (e > s) tong += e - s;
    }
  }
  return tong / 3_600_000;
}

/** Ban chuoi: han (chuoi gio VN) = moc + `gio` gio lam viec. */
export function hanGioLamViec(moc: string, gio: number): string {
  return fmtGioVn(congGioLamViec(parseGioVn(moc), gio));
}
