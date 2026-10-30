// Ghi ton kho MISA vao D1 - DUNG CHUNG cho 2 duong vao (2026-10-30, docs/KE_HOACH_KHO_MISA.md ben repo phan-tich-ton-kho-3t):
//  (1) Ke toan import file "Tổng hợp tồn kho" (routes/ktvTonKho.ts POST /import) - nhu truoc nay.
//  (2) Keo tu app "Phan tich ton kho 3T" (lib/hubMisa.ts) - app do la noi nhap MISA goc.
// 1 logic phan loai duy nhat: ma_kho khop ktv_lien_he.ma_misa -> kho KTV; khop kho_cong_ty.ma -> kho cong ty; con lai ->
// kho KTV ma_ktv NULL ("mã kho chưa khớp", GET /ma-kho-chua-khop). Sua quy tac o day la doi ca 2 duong.
import { nowVN } from "./vnTime";

export interface DongTonMisa {
  ma_kho: string; ten_kho?: string | null; ma_hang: string; ten_hang?: string | null; dvt?: string | null;
  dau_ky?: number | null; nhap_kho?: number | null; xuat_kho?: number | null; cuoi_ky?: number | null;
}

// Bo bang: "tam" = bang tam Ke toan import; "hub_tam" = bang tam luong keo; "that" / "bong" = noi chot.
export const BANG = {
  tam: { ktv: "ktv_ton_kho_tam", kct: "kho_cong_ty_ton_kho_tam" },
  hub_tam: { ktv: "hub_ktv_ton_kho_tam", kct: "hub_kho_cong_ty_ton_kho_tam" },
  that: { ktv: "ktv_ton_kho", kct: "kho_cong_ty_ton_kho" },
  bong: { ktv: "hub_ktv_ton_kho", kct: "hub_kho_cong_ty_ton_kho" },
} as const;
type BoBang = (typeof BANG)[keyof typeof BANG];

// Ghi 1 lo dong vao bang tam (upsert theo ma kho + ma hang). Tra so dong khop + cac ma kho chua khop.
export async function ghiLoTonKho(db: D1Database, rows: DongTonMisa[], tam: BoBang): Promise<{ matched: number; unmatched: string[] }> {
  const { results: ktvRows } = await db.prepare("SELECT ma_ktv, ma_misa FROM ktv_lien_he WHERE ma_misa IS NOT NULL AND ma_misa != ''")
    .all<{ ma_ktv: string; ma_misa: string }>();
  const maMisaToKtv = new Map(ktvRows.map((r) => [r.ma_misa.trim().toLowerCase(), r.ma_ktv]));
  // Them 2026-09-11 ("Kho công ty" - xem lib/tonKhoCongTy.ts) - cung 1 file MISA co the chua LAN dong cua kho vat ly cong ty
  // (vd "6803", "6804-MB") xen giua cac khoi cua tung KTV. Dong khong khop ma_misa cua KTV nao se thu khop TIEP voi
  // kho_cong_ty.ma truoc khi roi vao nhom "chua khop" that su.
  const { results: khoRows } = await db.prepare("SELECT ma FROM kho_cong_ty").all<{ ma: string }>();
  const maKhoCongTySet = new Set(khoRows.map((r) => r.ma.trim().toLowerCase()));

  let matched = 0;
  const unmatched = new Set<string>();
  const statements: D1PreparedStatement[] = [];
  const sqlKtv = `INSERT INTO ${tam.ktv} (ma_ktv, ma_kho, ten_kho, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ma_kho, ma_hang) DO UPDATE SET
       ma_ktv = excluded.ma_ktv, ten_kho = excluded.ten_kho, ten_hang = excluded.ten_hang, dvt = excluded.dvt,
       dau_ky = excluded.dau_ky, nhap_kho = excluded.nhap_kho, xuat_kho = excluded.xuat_kho, cuoi_ky = excluded.cuoi_ky`;
  for (const row of rows) {
    const maKho = row.ma_kho?.trim();
    const maHang = row.ma_hang?.trim();
    if (!maKho || !maHang) continue;
    const so = [row.dau_ky ?? null, row.nhap_kho ?? null, row.xuat_kho ?? null, row.cuoi_ky ?? null];
    const maKtv = maMisaToKtv.get(maKho.toLowerCase()) ?? null;
    if (maKtv) {
      matched++;
      statements.push(db.prepare(sqlKtv).bind(maKtv, maKho, row.ten_kho?.trim() || null, maHang, row.ten_hang?.trim() || null, row.dvt?.trim() || null, ...so));
    } else if (maKhoCongTySet.has(maKho.toLowerCase())) {
      matched++;
      statements.push(
        db.prepare(
          `INSERT INTO ${tam.kct} (kho_ma, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(kho_ma, ma_hang) DO UPDATE SET
             ten_hang = excluded.ten_hang, dvt = excluded.dvt,
             dau_ky = excluded.dau_ky, nhap_kho = excluded.nhap_kho, xuat_kho = excluded.xuat_kho, cuoi_ky = excluded.cuoi_ky`,
        ).bind(maKho, maHang, row.ten_hang?.trim() || null, row.dvt?.trim() || null, ...so),
      );
    } else {
      unmatched.add(maKho);
      statements.push(db.prepare(sqlKtv).bind(null, maKho, row.ten_kho?.trim() || null, maHang, row.ten_hang?.trim() || null, row.dvt?.trim() || null, ...so));
    }
  }
  if (statements.length) await db.batch(statements);
  return { matched, unmatched: [...unmatched] };
}

export const lenhXoaTam = (db: D1Database, tam: BoBang) => [db.prepare(`DELETE FROM ${tam.ktv}`), db.prepare(`DELETE FROM ${tam.kct}`)];

// Chot: thay TOAN BO bang dich bang bang tam (GHI DE nhu cu) + xoa tam [+ ghi meta] trong 1 batch (giao dich).
// meta (chi khi dich = "that"): 'ktv_ton_kho_import_meta' - updated_at LA MOC NHAP TON (don "sau lan import" o tonKhoCongTy /
// congNoKtv / tonKhoKtv / duPhongKtv / API doi tac). Keo tu Hub truyen updated_at = phien_ban cua Hub (= luc Ke toan nhap file).
export async function chotTonKho(
  db: D1Database,
  tam: BoBang,
  dich: BoBang,
  meta?: { value: Record<string, unknown>; updated_by: string; updated_at?: string },
): Promise<void> {
  const cot = "ma_ktv, ma_kho, ten_kho, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky";
  const cotKct = "kho_ma, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky";
  const lenh = [
    db.prepare(`DELETE FROM ${dich.ktv}`),
    db.prepare(`INSERT INTO ${dich.ktv} (${cot}) SELECT ${cot} FROM ${tam.ktv}`),
    db.prepare(`DELETE FROM ${dich.kct}`),
    db.prepare(`INSERT INTO ${dich.kct} (${cotKct}) SELECT ${cotKct} FROM ${tam.kct}`),
    ...lenhXoaTam(db, tam),
  ];
  if (meta) {
    lenh.push(
      db.prepare(
        `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('ktv_ton_kho_import_meta', ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      ).bind(JSON.stringify(meta.value), meta.updated_by, meta.updated_at ?? nowVN()),
    );
  }
  await db.batch(lenh);
}
