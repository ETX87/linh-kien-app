import type { Context, Hono } from "hono";
import type { Env } from "../types";
import { taiAppUserTheoEmail } from "../middleware/loadUser";
import { taoPhieuDat, kiemTraPhieuDat, type PhieuDatBody } from "./datMuaLinhKien";
import { deriveLoaiDon } from "../lib/tuDongDuyet";

// ======================= DAT LINH KIEN QUA API (2026-11-11, v1.470, migration 0114) =======================
// "tạo 1 api cho phép hệ thống đối tác đặt linh kiện thông qua api". Moi API key gan 1 TAI KHOAN DAT HANG (partner_api_keys.email_dat_hang,
// Admin chon o Cai dat > API doi tac). Don tao qua API = CHINH tai khoan do bam "Tao don": cung taoPhieuDat()/kiemTraPhieuDat() cua
// routes/datMuaLinhKien.ts (gia, chiet khau, ton kho, tran cong no, tu duyet, gom phieu, thong bao) - KHONG co ban logic thu 2.
// Quyen theo tai khoan: KTV chi dat cho chinh minh; TN/GS/Admin dat ho moi KTV (chon nguoi nhan qua ma_ktv / ma_misa / email).
// KHONG ho tro don TRA HANG (bat buoc anh Drive). Combo van tach nhu form. Chong tao trung: ma_yeu_cau BAT BUOC (luu client_request_id
// "api<keyId>:<ma>" - unique toan he thong; gui lai cung ma -> tra phieu da tao, trung_lap: true).
// Mount vao router /api/partner (partnerApi.ts) - xac thuc X-API-Key + gioi han tan suat theo key (lib/baoVe.ts) da co san.

interface DatHangApiBody {
  ma_yeu_cau?: unknown;
  ma_ktv?: unknown;
  ma_misa?: unknown;
  email_nhan_hang?: unknown;
  kh_le_sdt?: unknown;
  ghi_chu?: unknown;
  don_hang?: unknown;
}

type Ctx = Context<{ Bindings: Env }>;

const chuoi = (v: unknown, max = 500): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s.slice(0, max) : undefined;
};

const SO_DONG_TOI_DA = 100;

// Gan tai khoan dat hang vao context (nhu loadUser) -> moi kiem tra quyen trong taoPhieuDat doc c.get("user") nhu request that.
async function ganTaiKhoanDatHang(c: Ctx): Promise<Response | null> {
  const key = c.get("partnerKey");
  const row = await c.env.DB.prepare("SELECT email_dat_hang FROM partner_api_keys WHERE id = ?").bind(key.id).first<{ email_dat_hang: string | null }>();
  if (!row?.email_dat_hang) return c.json({ error: "KEY_CHUA_DUOC_CAP_QUYEN_DAT_HANG" }, 403);
  const user = await taiAppUserTheoEmail(c.env.DB, row.email_dat_hang);
  if ("error" in user) return c.json({ error: user.error }, 403);
  await c.env.DB.prepare("PRAGMA foreign_keys = ON").run();
  c.set("user", user);
  c.set("realIsAdmin", user.vai_tro === "Admin");
  c.set("realEmail", user.email);
  c.set("viewAsRole", null);
  c.set("viewAsUser", null);
  return null;
}

type KetQuaChuyen = { body: PhieuDatBody } | { error: string; status: 400; extra?: Record<string, unknown> };

// Body API -> PhieuDatBody cua form. Nguoi nhan: email_nhan_hang | ma_ktv | ma_misa (uu tien theo thu tu) -> email dang nhap cua ma KTV;
// bo trong ca 3 = tai khoan dat hang tu nhan. Loai de xuat quy ve DUNG ten trong danh muc dang bat (bo hoa/thuong/khoang trang thua).
async function chuyenBody(c: Ctx, b: DatHangApiBody, canMaYeuCau: boolean): Promise<KetQuaChuyen> {
  const maYeuCau = chuoi(b.ma_yeu_cau, 48);
  if (canMaYeuCau && !maYeuCau) return { error: "THIEU_MA_YEU_CAU", status: 400 };
  if (!Array.isArray(b.don_hang) || b.don_hang.length === 0) return { error: "MISSING_DON_HANG", status: 400 };
  if (b.don_hang.length > SO_DONG_TOI_DA) return { error: "QUA_NHIEU_DONG", status: 400, extra: { toi_da: SO_DONG_TOI_DA } };

  let nguoiNhan: string | undefined = chuoi(b.email_nhan_hang, 200)?.toLowerCase();
  const maKtv = chuoi(b.ma_ktv, 100);
  const maMisa = chuoi(b.ma_misa, 100);
  if (!nguoiNhan && (maKtv || maMisa)) {
    const k = await c.env.DB.prepare(
      `SELECT email_dang_nhap FROM ktv_lien_he
       WHERE ${maKtv ? "LOWER(ma_ktv) = LOWER(?)" : "LOWER(TRIM(ma_misa)) = LOWER(?)"}
         AND NULLIF(TRIM(COALESCE(email_dang_nhap, '')), '') IS NOT NULL
       ORDER BY COALESCE(ngung_hoat_dong, 0), ma_ktv LIMIT 1`,
    ).bind(maKtv ?? maMisa).first<{ email_dang_nhap: string }>();
    if (!k) return { error: "KHONG_TIM_THAY_NGUOI_NHAN", status: 400, extra: maKtv ? { ma_ktv: maKtv } : { ma_misa: maMisa } };
    nguoiNhan = k.email_dang_nhap.trim().toLowerCase();
  }

  const { results: dsLde } = await c.env.DB.prepare("SELECT ten_option FROM settings_loai_de_xuat WHERE bat_tat = 1").all<{ ten_option: string }>();
  const khoa = (x: string) => x.trim().replace(/\s+/g, " ").toUpperCase();
  const ldeTheoKhoa = new Map(dsLde.map((r) => [khoa(r.ten_option), r.ten_option]));

  const donHang: PhieuDatBody["don_hang"] = [];
  for (const [i, raw] of (b.don_hang as unknown[]).entries()) {
    const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const maLk = chuoi(d.ma_lk, 100);
    const ldeGui = chuoi(d.loai_de_xuat, 200);
    const soLuong = Number(d.so_luong ?? d.so_luong_de_xuat);
    if (!maLk || !ldeGui || !Number.isInteger(soLuong) || soLuong <= 0) return { error: "INVALID_DON_HANG", status: 400, extra: { dong: i } };
    const lde = ldeTheoKhoa.get(khoa(ldeGui));
    if (!lde) return { error: "LOAI_DE_XUAT_KHONG_HOP_LE", status: 400, extra: { dong: i, loai_de_xuat: ldeGui } };
    if (deriveLoaiDon(lde) === "tra_hang") return { error: "TRA_HANG_KHONG_HO_TRO_QUA_API", status: 400, extra: { dong: i } };
    donHang.push({
      ma_lk: maLk,
      loai_de_xuat: lde,
      so_luong_de_xuat: soLuong,
      ghi_chu: chuoi(d.ghi_chu),
      yeu_cau_hoa_don: chuoi(d.yeu_cau_hoa_don, 200),
      tt_mail_duyet: chuoi(d.tt_mail_duyet),
      tt_khach_hang: chuoi(d.tt_khach_hang),
      chinh_sach: chuoi(d.chinh_sach, 100),
      ma_yeu_cau_su_co: chuoi(d.ma_yeu_cau_su_co, 50),
      ma_lada: chuoi(d.ma_lada, 50),
      uu_tien: d.uu_tien === true,
      doi_tac_ma: chuoi(d.doi_tac_ma, 100),
    });
  }
  return {
    body: {
      ghi_chu: chuoi(b.ghi_chu),
      nguoi_nhan_hang: nguoiNhan,
      kh_le_sdt: chuoi(b.kh_le_sdt, 20),
      client_request_id: maYeuCau ? `api${c.get("partnerKey").id}:${maYeuCau}` : undefined,
      don_hang: donHang,
    },
  };
}

export function ganRouteDatHang(partnerApi: Hono<{ Bindings: Env }>) {
  // POST /v1/dat-hang/kiem-tra - CUNG body voi /v1/dat-hang (ma_yeu_cau khong bat buoc), KHONG ghi gi: ket qua du kien tung dong
  // (tu duyet / cho hang / cho thanh toan / cho GS / cho TBP / bi chan + ly do) - y het form tao don hoi truoc.
  partnerApi.post("/v1/dat-hang/kiem-tra", async (c) => {
    const loi = await ganTaiKhoanDatHang(c);
    if (loi) return loi;
    const b = await c.req.json<DatHangApiBody>().catch(() => ({}) as DatHangApiBody);
    const kq = await chuyenBody(c, b, false);
    if ("error" in kq) return c.json({ error: kq.error, ...(kq.extra ?? {}) }, kq.status);
    return kiemTraPhieuDat(c, kq.body);
  });

  // POST /v1/dat-hang - tao 1 phieu dat (>= 1 dong). 201 = da tao (id phieu, dong[] {id, trang_thai, ly_do, pxk}, phieu[], quy_du);
  // 200 + trung_lap = ma_yeu_cau da dung truoc do; 4xx = loi, khong tao gi.
  partnerApi.post("/v1/dat-hang", async (c) => {
    const loi = await ganTaiKhoanDatHang(c);
    if (loi) return loi;
    const b = await c.req.json<DatHangApiBody>().catch(() => ({}) as DatHangApiBody);
    const kq = await chuyenBody(c, b, true);
    if ("error" in kq) return c.json({ error: kq.error, ...(kq.extra ?? {}) }, kq.status);
    return taoPhieuDat(c, kq.body, { partnerKeyId: c.get("partnerKey").id });
  });

  // GET /v1/dat-hang?id=<phieu_dat> | ?ma_yeu_cau=<ma> | ?tu_ngay=YYYY-MM-DD&den_ngay=YYYY-MM-DD (<= 31 ngay, <= 500 phieu) - trang thai
  // HIEN TAI cac phieu dat do CHINH key nay tao (phieu cua key khac / tao tren app khong tra). Lich su chi tiet: /v1/case-timeline.
  partnerApi.get("/v1/dat-hang", async (c) => {
    const keyId = c.get("partnerKey").id;
    const id = chuoi(c.req.query("id"), 40);
    const maYeuCau = chuoi(c.req.query("ma_yeu_cau"), 48);
    const tu = c.req.query("tu_ngay") ?? "";
    const den = c.req.query("den_ngay") ?? "";
    let where: string;
    let binds: unknown[];
    if (id) {
      where = "pd.id = ?";
      binds = [id];
    } else if (maYeuCau) {
      where = "pd.client_request_id = ?";
      binds = [`api${keyId}:${maYeuCau}`];
    } else {
      const re = /^\d{4}-\d{2}-\d{2}$/;
      if (!re.test(tu) || !re.test(den)) return c.json({ error: "CAN_ID_HOAC_MA_YEU_CAU_HOAC_KHOANG_NGAY" }, 400);
      const soNgay = (Date.parse(den) - Date.parse(tu)) / 86400000;
      if (!(soNgay >= 0 && soNgay <= 31)) return c.json({ error: "KHOANG_NGAY_KHONG_HOP_LE", toi_da_ngay: 31 }, 400);
      where = "substr(pd.ngay_tao, 1, 10) BETWEEN ? AND ?";
      binds = [tu, den];
    }
    const { results: phieu } = await c.env.DB.prepare(
      `SELECT pd.id, pd.client_request_id, pd.ngay_tao, pd.nguoi_nhan_hang, pd.ghi_chu
       FROM phieu_dat pd WHERE pd.partner_key_id = ? AND ${where} ORDER BY pd.ngay_tao, pd.id LIMIT 500`,
    )
      .bind(keyId, ...binds)
      .all<{ id: string; client_request_id: string | null; ngay_tao: string; nguoi_nhan_hang: string; ghi_chu: string | null }>();
    if (!phieu.length) return c.json({ rows: [] });
    const TLK = "(SELECT t.id FROM thieu_lk t WHERE t.dat_don_hang_id = d.id ORDER BY t.ngay_tao DESC, t.id DESC LIMIT 1)";
    const { results: don } = await c.env.DB.prepare(
      `SELECT d.id, d.phieu_dat_id, d.ma_lk, d.ten_lk_snapshot AS ten_lk, d.loai_de_xuat, d.so_luong_de_xuat, d.so_luong_thuc_xuat,
              d.gia_de_xuat, d.gia_chot, d.trang_thai_hien_tai AS trang_thai, d.ma_yeu_cau_su_co, d.ma_lada, d.ngay_tao,
              p.id AS pxk_id, p.trang_thai_hien_tai AS pxk_trang_thai, p.trang_thai_chuyen_tien AS pxk_trang_thai_chuyen_tien,
              p.so_tien_can_chuyen AS pxk_so_tien_can_chuyen, p.ma_van_don,
              (SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = ${TLK} ORDER BY l.id DESC LIMIT 1) AS thieu_hang_trang_thai,
              (SELECT t.ngay_du_kien_co_hang FROM thieu_lk t WHERE t.id = ${TLK}) AS ngay_du_kien_co_hang
       FROM dat_don_hang d
       LEFT JOIN phieu_xuat_kho p ON p.id = (
         SELECT pd2.phieu_xuat_kho_id FROM phieu_xuat_kho_dong pd2 JOIN phieu_xuat_kho p2 ON p2.id = pd2.phieu_xuat_kho_id
         WHERE pd2.dat_don_hang_id = d.id AND p2.trang_thai_hien_tai <> 'Ke toan huy' LIMIT 1)
       WHERE d.phieu_dat_id IN (SELECT value FROM json_each(?)) ORDER BY d.id`,
    )
      .bind(JSON.stringify(phieu.map((p) => p.id)))
      .all<Record<string, unknown> & { phieu_dat_id: string }>();
    const theoPhieu = new Map<string, unknown[]>(phieu.map((p) => [p.id, []]));
    for (const d of don) {
      const { phieu_dat_id, ...rest } = d;
      theoPhieu.get(phieu_dat_id)?.push(rest);
    }
    const tienTo = `api${keyId}:`;
    return c.json({
      rows: phieu.map((p) => ({
        id: p.id,
        ma_yeu_cau: p.client_request_id?.startsWith(tienTo) ? p.client_request_id.slice(tienTo.length) : null,
        ngay_tao: p.ngay_tao,
        nguoi_nhan_hang: p.nguoi_nhan_hang,
        ghi_chu: p.ghi_chu,
        don: theoPhieu.get(p.id) ?? [],
      })),
    });
  });

  // GET /v1/loai-de-xuat - danh muc loai de xuat dang bat (ten gui o don_hang[].loai_de_xuat) + nhom + loai don suy ra.
  partnerApi.get("/v1/loai-de-xuat", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT o.ten_option AS ten, n.ten_nhom AS nhom FROM settings_loai_de_xuat o JOIN settings_loai_de_xuat_nhom n ON n.id = o.nhom_id
       WHERE o.bat_tat = 1 AND n.bat_tat = 1 ORDER BY n.id, o.stt, o.id`,
    ).all<{ ten: string; nhom: string }>();
    return c.json({
      rows: results.map((r) => ({ ...r, loai_don: deriveLoaiDon(r.ten), dat_qua_api: deriveLoaiDon(r.ten) !== "tra_hang" })),
    });
  });
}
