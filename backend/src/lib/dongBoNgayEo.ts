import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { pushThieuHangBhToSuachua } from "./thieuHangBh";
import type { DongMuaHang } from "./muaHangClient";

/**
 * DONG BO NGAY DU KIEN TU EO MUA HANG -> TICKET THIEU HANG (v1.568, 26/11/2026).
 * Bug bao: LK 3004022213 - Mua hang da nhap ngay du kien tren EO (3TDO-000847, 20/11) nhung ticket THB-000147 ben app nay van trong ngay toi
 * 26/11 (phai go tay lai). Truoc day ngay tren ticket CHI do Kho / Mua hang nhap tay; ket noi v1.543 chi HIEN khung "Mua hàng (EO)".
 * Chot (chu he thong, 26/11/2026): "EO ghi đè luôn" - EO la nguon chuan, ngay tren ticket dang mo luon theo EO (ke ca ngay Kho da nhap tay).
 *
 * Moi gio (cron index.ts): lay ticket DANG MO (THB: THB_MO; TLK: chua dong / chua ve / chua tu choi) -> 1 lan POST muahang /api/partner/theo-id
 * voi ids = ma ticket + ma don DDH cua TLK, po_lk = "3TDO-xxxx~MA_LK" tu o "Mã EO" cua ticket. Khop ticket <-> dong EO khi dong EO ghi ma ticket
 * (hoac ma don DDH cua TLK) o "ID CRM" / "ID đặt hàng", hoac PO ticket ghi + ma LK. Chi lay dong EO da ban hanh, chua ket thuc, co ngay du kien;
 * nhieu dong -> ngay SOM nhat. EO khong co ngay -> GIU nguyen ticket (khong xoa).
 * Khac ngay -> ghi de ngay (+ ma EO neu ticket chua ghi PO do), ghi dong_bo_ngay_eo_log; THB them 1 dong thieu_hang_bh_log (khong anh huong SLA)
 * va day sang app Sua chua bao hanh. TLK KHONG chen thieu_lk_log (trang thai = log moi nhat, SLA tinh theo gio log).
 */
const TLK_DONG = ["Da huy bo", "Da ket thuc", "Kho xac nhan hang da ve", "Kho tu choi sai TT", "Mua hang tu choi"];
const THB_MO_SQL = "('Cho kho xu ly','Kho da tiep nhan','Cho mua hang','Mua hang da dat')";
const NGUOI_HE_THONG = "Hệ thống (đồng bộ EO Mua hàng)";

interface Ticket { id: string; loai: "THB" | "TLK"; don: string | null; ma_lk: string; ma_eo: string | null; ngay: string | null }

const poTrong = (s: string | null) => [...new Set((String(s ?? "").toUpperCase().match(/3TDO-\d+/g) ?? []))];

async function goiTheoId(env: Env, ids: string[], poLk: string[]): Promise<DongMuaHang[] | null> {
  if (!env.MUAHANG_SERVICE || !env.MUAHANG_DOC_API_KEY) return null;
  const res = await env.MUAHANG_SERVICE.fetch("https://muahang.dichvu3t.workers.dev/api/partner/theo-id", {
    method: "POST",
    headers: { "X-API-Key": env.MUAHANG_DOC_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ ids, po_lk: poLk }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`muahang POST theo-id ${res.status} ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { rows?: DongMuaHang[] }).rows ?? [];
}

export async function dongBoNgayEo(env: Env, chayThu = false) {
  const db = env.DB;
  const [{ results: thb }, { results: tlk }] = await Promise.all([
    db.prepare(`SELECT id, ma_lk, ma_eo_mua, ngay_du_kien FROM thieu_hang_bh WHERE trang_thai IN ${THB_MO_SQL}`)
      .all<{ id: string; ma_lk: string; ma_eo_mua: string | null; ngay_du_kien: string | null }>(),
    db.prepare(
      `SELECT * FROM (SELECT t.id, t.dat_don_hang_id, d.ma_lk, t.ma_eo_mua, t.ngay_du_kien_co_hang,
         (SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = t.id ORDER BY l.id DESC LIMIT 1) AS tt
       FROM thieu_lk t JOIN dat_don_hang d ON d.id = t.dat_don_hang_id) x
       WHERE COALESCE(x.tt, '') NOT IN (SELECT value FROM json_each(?))`,
    ).bind(JSON.stringify(TLK_DONG))
      .all<{ id: string; dat_don_hang_id: string; ma_lk: string; ma_eo_mua: string | null; ngay_du_kien_co_hang: string | null }>(),
  ]);
  const ds: Ticket[] = [
    ...thb.map((r) => ({ id: r.id, loai: "THB" as const, don: null, ma_lk: r.ma_lk, ma_eo: r.ma_eo_mua, ngay: r.ngay_du_kien })),
    ...tlk.map((r) => ({ id: r.id, loai: "TLK" as const, don: r.dat_don_hang_id, ma_lk: r.ma_lk, ma_eo: r.ma_eo_mua, ngay: r.ngay_du_kien_co_hang })),
  ];
  const kq = { ticket: ds.length, khop: 0, sua: [] as { id: string; cu: string | null; moi: string; po: string | null }[] };
  if (!ds.length) return kq;
  const ids = [...new Set(ds.flatMap((t) => [t.id, ...(t.don ? [t.don] : [])]))];
  const poLk = [...new Set(ds.flatMap((t) => poTrong(t.ma_eo).map((po) => `${po}~${t.ma_lk.toUpperCase()}`)))];
  const rows = await goiTheoId(env, ids.slice(0, 1000), poLk.slice(0, 1000));
  if (!rows) return kq;
  const now = nowVN();
  const ghi: D1PreparedStatement[] = [];
  const thbDoi: string[] = [];
  for (const t of ds) {
    const khoa = new Set([t.id.toUpperCase(), ...(t.don ? [t.don.toUpperCase()] : []), ...poTrong(t.ma_eo).map((po) => `${po}~${t.ma_lk.toUpperCase()}`)]);
    const hop = rows.filter((r) => r.trang_thai_eo === "ISSUED" && !r.ket_thuc && r.ngay_du_kien && r.khop_theo.some((k) => khoa.has(k.toUpperCase())))
      .sort((a, b) => String(a.ngay_du_kien).localeCompare(String(b.ngay_du_kien)));
    if (!hop.length) continue;
    kq.khop++;
    const r = hop[0];
    const moi = String(r.ngay_du_kien).slice(0, 10);
    if ((t.ngay ?? "").slice(0, 10) === moi) continue;
    const po = r.ma_phe_duyet || null;
    const maEoMoi = po && !poTrong(t.ma_eo).includes(po.toUpperCase()) ? po : t.ma_eo;
    kq.sua.push({ id: t.id, cu: t.ngay, moi, po });
    if (t.loai === "THB") {
      ghi.push(db.prepare("UPDATE thieu_hang_bh SET ngay_du_kien = ?, ma_eo_mua = ?, ngay_cap_nhat = ? WHERE id = ?").bind(moi, maEoMoi, now, t.id));
      ghi.push(db.prepare(
        "INSERT INTO thieu_hang_bh_log (thieu_hang_bh_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) SELECT id, trang_thai, ?, ?, ? FROM thieu_hang_bh WHERE id = ?",
      ).bind(NGUOI_HE_THONG, now, `Dự kiến có hàng: ${moi} | Mã EO: ${po ?? ""} (tự động theo EO Mua hàng${t.ngay ? `, trước: ${t.ngay.slice(0, 10)}` : ""})`, t.id));
      thbDoi.push(t.id);
    } else {
      ghi.push(db.prepare("UPDATE thieu_lk SET ngay_du_kien_co_hang = ?, ma_eo_mua = ? WHERE id = ?").bind(moi, maEoMoi, t.id));
    }
    ghi.push(db.prepare(
      "INSERT INTO dong_bo_ngay_eo_log (ticket_id, loai, ngay_cu, ngay_moi, ma_eo_cu, ma_eo_moi, eo_item_id, khop_theo, luc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(t.id, t.loai, t.ngay, moi, t.ma_eo, maEoMoi, r.eo_item_id, r.khop_theo.join(","), now));
  }
  if (chayThu) return kq;
  for (let i = 0; i < ghi.length; i += 90) await db.batch(ghi.slice(i, i + 90));
  if (thbDoi.length) await pushThieuHangBhToSuachua(env, thbDoi);
  return kq;
}
