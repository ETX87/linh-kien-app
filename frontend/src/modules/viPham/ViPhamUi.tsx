import { useState } from "react";
import { FileButton } from "../../components/ui/FileButton";
import { anhVuaGioiHan } from "../../lib/imageCompress";
import { baoLoiTaiAnh, canhBaoHanMucAnh, type HanMucAnh } from "../../lib/hanMucAnh";
import { AnhThumb, BangChungAnhList } from "../datMuaLinhKien/BangChungChuyenTien";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Btn } from "../../components/ui/Btn";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/Toast";
import { MaDonLink, MaPhieuLink, MaTicketLink } from "../datMuaLinhKien/MaLienKet";
import { describeApiError } from "../datMuaLinhKien/helpers";
import { dichSau, t } from "../../i18n";

// Thanh phan dung chung "Quá hạn & vi phạm" (v1.518/1.519): hop giai trinh, chi tiet 1 ca, banner trong chi tiet don / phieu / ticket.
// Ghi nhan sai = giai trinh voi ly do "Ghi nhận không đúng…" (khong co buoc Admin xem xet / go the - chot 2026-11-18). Backend: routes/viPham.ts, lib/viPham.ts.

export interface NguoiPt {
  email: string;
  ten: string | null;
  ma_nhan_su: string | null;
}

export interface ViPhamRow {
  id: number;
  buoc: string;
  ten_buoc: string;
  loai: "dat_hang" | "tra_hang";
  bo_phan: string;
  ten_bo_phan: string;
  doi_tuong: "don" | "ticket" | "phieu";
  doi_tuong_id: string;
  dat_don_hang_id: string | null;
  phieu_xuat_kho_id: string | null;
  khu_vuc_ma: string | null;
  nguoi_nhan_hang: string | null;
  nguoi_nhan_hang_ten: string | null;
  moc_vao: string;
  so_gio_sla: number;
  han: string;
  so_gio_tre: number;
  dang_cho: boolean;
  ket_thuc_luc: string | null;
  trang_thai_sau: string | null;
  nguoi_xu_ly: string | null;
  nguoi_xu_ly_ten: string | null;
  nguoi_phu_trach: NguoiPt[];
  trang_thai: "Cho giai trinh" | "Da giai trinh" | "Ton CEO";
  han_giai_trinh: string;
  ly_do: string | null;
  phan_loai_loi: PhanLoaiLoi | null;
  ten_phan_loai_loi: string | null;
  bang_chung: string[];
  giai_trinh: string | null;
  nguoi_giai_trinh: string | null;
  nguoi_giai_trinh_ten: string | null;
  giai_trinh_luc: string | null;
  giai_trinh_tu_dong: boolean;
  nhac_luc: string | null;
  gan_the_luc: string | null;
  ma_yeu_cau_su_co: string | null;
  ma_lada: string | null;
  ma_lk: string | null;
  ten_lk: string | null;
  don_ids: string[];
  la_cua_toi: boolean;
  duoc_giai_trinh: boolean;
}

export const NHAN_TT: Record<string, string> = {
  "Cho giai trinh": "Chờ giải trình",
  "Da giai trinh": "Đã giải trình",
  "Ton CEO": "Tồn CEO",
};
export const TONE_TT: Record<string, BadgeTone> = {
  "Cho giai trinh": "amber",
  "Da giai trinh": "teal",
  "Ton CEO": "coral",
};
export const NHAN_LOAI: Record<string, string> = { dat_hang: "Đặt hàng", tra_hang: "Trả hàng" };

/** "YYYY-MM-DD HH:MM:SS" (gio VN) -> "dd/mm HH:MM" - cat chuoi, khong qua Date (tranh lech mui gio). */
export function ngayGio(s: string | null | undefined): string {
  if (!s) return "—";
  return `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`;
}
export function gioTre(h: number): string {
  if (h < 24) return t("{n} giờ", { n: h });
  const d = Math.floor(h / 24);
  const r = Math.round(h - d * 24);
  return r ? t("{d} ngày {h} giờ", { d, h: r }) : t("{d} ngày", { d });
}
/** Con bao lau toi han giai trinh (chu ngan, null khi da qua). */
export function conLai(han: string): string | null {
  const ms = Date.parse(han.replace(" ", "T") + "+07:00") - Date.now();
  if (ms <= 0) return null;
  const h = ms / 3_600_000;
  return h < 1 ? t("còn {n} phút", { n: Math.max(1, Math.round(h * 60)) }) : t("còn {a}", { a: gioTre(Math.round(h * 10) / 10) });
}
export function tenPt(ds: NguoiPt[]): string {
  if (!ds.length) return t("Chưa xác định người phụ trách");
  return ds.map((p) => p.ten ?? p.email).join(", ");
}

// Viec bo phan phai lam o tung buoc (khop BUOC_VI_PHAM o backend/src/lib/viPham.ts - them buoc moi thi them cau o day).
const VIEC_BUOC: Record<string, string> = {
  tbp_xac_nhan: dichSau("TBP phải xác nhận (duyệt / từ chối) đơn có linh kiện đặc thù"),
  gs_duyet: dichSau("GS phải duyệt (nhập mã EO) hoặc từ chối đơn vượt trần công nợ"),
  tn_duyet: dichSau("Kế toán (thay Tác nghiệp) phải duyệt hoặc từ chối đơn đang chờ duyệt"),
  kho_thieu: dichSau("Kho phải tiếp nhận ticket thiếu hàng (tiếp nhận chờ hàng / đã có hàng / chuyển Mua hàng / từ chối)"),
  mua_hang_dat: dichSau("Mua hàng phải đặt hàng (nhập mã EO + ngày dự kiến) hoặc báo không mua được"),
  kt_duyet_tien: dichSau("Kế toán phải xác nhận (duyệt / từ chối) bằng chứng chuyển tiền KTV đã gửi"),
  kt_chot_phieu: dichSau("Kế toán phải nhập Mã MISA và chốt xong đơn xuất (hoặc trả về / hủy phiếu)"),
  kho_xuat: dichSau("Kho phải in phiếu, đóng gói và gửi hàng cho KTV"),
  th_ke_toan: dichSau("Kế toán phải duyệt hoặc từ chối đơn trả hàng"),
  th_kho: dichSau("Kho phải xác nhận đã nhận hàng trả về (hoặc từ chối)"),
  th_qc: dichSau("QC phải kiểm tra và xác nhận đạt / từ chối hàng trả"),
  th_tn: dichSau("Kế toán (thay Tác nghiệp) phải duyệt tổng đơn trả hàng"),
};
const LOAI_DOI_TUONG: Record<ViPhamRow["doi_tuong"], string> = { don: dichSau("Đơn"), ticket: dichSau("Ticket thiếu hàng"), phieu: dichSau("Phiếu xuất") };

/** Cau mo ta loi vi pham: viec gi, cua ai, han bao nhieu, da xu ly chua (v1.542 - "thiếu mô tả lỗi vi phạm là gì"). */
export function moTaLoi(r: ViPhamRow): { viec: string; dienBien: string } {
  const viec = t(VIEC_BUOC[r.buoc] ?? "{a} phải xử lý bước \"{b}\"", { a: t(r.ten_bo_phan), b: t(r.ten_buoc) });
  const vao = t("{a} {b} vào bước \"{c}\" lúc {d}, hạn xử lý {e} giờ (SLA) → {f}.", {
    a: t(LOAI_DOI_TUONG[r.doi_tuong]),
    b: r.doi_tuong_id,
    c: t(r.ten_buoc),
    d: ngayGio(r.moc_vao),
    e: r.so_gio_sla,
    f: ngayGio(r.han),
  });
  const ket = r.dang_cho
    ? t("Tới giờ vẫn chưa được xử lý — đã trễ {a}.", { a: gioTre(r.so_gio_tre) })
    : t("Đến {a} mới được xử lý ({b}) — trễ {c}.", {
        a: ngayGio(r.ket_thuc_luc),
        b: r.nguoi_xu_ly_ten ?? r.nguoi_xu_ly ?? t("Hệ thống"),
        c: gioTre(r.so_gio_tre),
      });
  return { viec, dienBien: `${vao} ${ket}` };
}

/** Khoi "Lỗi vi phạm" + link mo don / phieu / ticket (dung trong hop giai trinh + chi tiet ca). */
export function KhoiLoiViPham({ r }: { r: ViPhamRow }) {
  const m = moTaLoi(r);
  return (
    <div className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm mb-3">
      <div className="text-xs font-semibold text-[var(--color-danger)] mb-0.5">{t("Lỗi vi phạm")}</div>
      <div className="font-semibold">{m.viec}</div>
      <div className="mt-0.5">{m.dienBien}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[var(--color-text-secondary)]">{t("Tra cứu")}:</span>
        <MaDoiTuong r={r} />
        {r.ma_lk && <span className="text-[var(--color-text-secondary)]">{r.ma_lk}{r.ten_lk ? ` · ${r.ten_lk}` : ""}</span>}
      </div>
    </div>
  );
}

export function MaDoiTuong({ r }: { r: ViPhamRow }) {
  if (r.doi_tuong === "phieu") return <MaPhieuLink id={r.phieu_xuat_kho_id} />;
  if (r.doi_tuong === "ticket")
    return (
      <span className="whitespace-nowrap">
        <MaTicketLink id={r.doi_tuong_id} />
        {r.dat_don_hang_id && (
          <span className="text-[var(--color-text-secondary)]">
            {" · "}
            <MaDonLink id={r.dat_don_hang_id} />
          </span>
        )}
      </span>
    );
  return r.dat_don_hang_id ? <MaDonLink id={r.dat_don_hang_id} /> : <>{r.doi_tuong_id}</>;
}

export function lamMoiViPham(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["vi-pham"] });
  qc.invalidateQueries({ queryKey: ["vi-pham-dem"] });
  qc.invalidateQueries({ queryKey: ["vi-pham-tong-hop"] });
  qc.invalidateQueries({ queryKey: ["vi-pham-theo"] });
  qc.invalidateQueries({ queryKey: ["notifications-count"] });
}

type LoaiHop = "giai_trinh";

/** Phan loai loi khi giai trinh (v1.548) - khop PHAN_LOAI_LOI o backend routes/viPham.ts. */
export type PhanLoaiLoi = "noi_bo" | "doi_tac" | "cua_toi" | "khac";
export const PHAN_LOAI_LOI: { ma: PhanLoaiLoi; nhan: string; goiY: string }[] = [
  { ma: "noi_bo", nhan: dichSau("Lỗi nội bộ"), goiY: dichSau("Do bộ phận / người khác trong công ty (vd Kho, Kế toán, Mua hàng xử lý chậm).") },
  { ma: "doi_tac", nhan: dichSau("Lỗi đối tác"), goiY: dichSau("Do nhà cung cấp, hãng, đơn vị vận chuyển, KTV / đối tác bên ngoài.") },
  { ma: "cua_toi", nhan: dichSau("Lỗi của tôi"), goiY: dichSau("Do chính bạn xử lý chậm — không cần bằng chứng.") },
  { ma: "khac", nhan: dichSau("Khác"), goiY: dichSau("Nguyên nhân khác — ghi rõ trong nội dung.") },
];
const MAX_BANG_CHUNG = 5;
const LOI_GIAI_TRINH: Record<string, string> = {
  THIEU_PHAN_LOAI_LOI: dichSau("Chọn lỗi thuộc về ai."),
  THIEU_BANG_CHUNG: dichSau("Không phải lỗi của bạn thì phải đính kèm ít nhất 1 ảnh bằng chứng."),
  QUA_SO_ANH_BANG_CHUNG: dichSau("Tối đa 5 ảnh bằng chứng."),
  NOI_DUNG_QUA_NGAN: dichSau("Nội dung giải trình tối thiểu 5 ký tự."),
};

/** Hop giai trinh 1 ca. Ca ghi nhan sai -> chon ly do "Ghi nhận không đúng…" (van tinh la giai trinh). */
export function HopViPham({ r, onClose }: { r: ViPhamRow; loai?: LoaiHop; onClose: () => void }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const [lyDo, setLyDo] = useState("");
  const [nd, setNd] = useState("");
  const [phanLoai, setPhanLoai] = useState<PhanLoaiLoi | "">("");
  const [anh, setAnh] = useState<string[]>([]);
  const [dangTai, setDangTai] = useState(0);
  const [loi, setLoi] = useState<string | null>(null);
  const dsLyDo = useQuery({ queryKey: ["vi-pham-ly-do"], queryFn: () => api.get<{ rows: string[]; khong_dung: string }>("/vi-pham/ly-do") });
  const canBangChung = !!phanLoai && phanLoai !== "cua_toi";
  const gui = useMutation({
    mutationFn: () =>
      api.post(`/vi-pham/${r.id}/giai-trinh`, { ly_do: lyDo, noi_dung: nd.trim(), phan_loai_loi: phanLoai, bang_chung: canBangChung ? anh : [] }),
    onSuccess: () => {
      addToast(t("Đã ghi giải trình"));
      lamMoiViPham(qc);
      onClose();
    },
    onError: (e) => {
      const ma = (e as { code?: string }).code ?? "";
      setLoi(LOI_GIAI_TRINH[ma] ? t(LOI_GIAI_TRINH[ma]) : describeApiError(e));
    },
  });

  async function taiAnh(files: File[]) {
    const chon = files.slice(0, Math.max(0, MAX_BANG_CHUNG - anh.length));
    if (files.length > chon.length) addToast(t("Tối đa {a} ảnh", { a: MAX_BANG_CHUNG }));
    for (const f of chon) {
      setDangTai((n) => n + 1);
      try {
        const g = await anhVuaGioiHan(f);
        const res = await api.postBinary<{ ok: true; url: string; han_muc_anh?: HanMucAnh | null }>(`/vi-pham/${r.id}/anh`, await g.arrayBuffer(), g.type || "image/jpeg");
        canhBaoHanMucAnh(res.han_muc_anh, addToast);
        setAnh((x) => (x.includes(res.url) || x.length >= MAX_BANG_CHUNG ? x : [...x, res.url]));
      } catch (err) {
        baoLoiTaiAnh(err, addToast, describeApiError);
      } finally {
        setDangTai((n) => n - 1);
      }
    }
  }

  const khongDung = !!lyDo && lyDo === dsLyDo.data?.khong_dung;
  const thieu = !lyDo
    ? t("Chọn lý do chậm")
    : !phanLoai
      ? t("Chọn lỗi thuộc về ai")
      : canBangChung && anh.length === 0
        ? t("Đính kèm ảnh bằng chứng")
        : nd.trim().length < 5
          ? t("Nhập nội dung giải trình")
          : dangTai > 0
            ? t("Đang tải ảnh…")
            : null;
  const goiY = PHAN_LOAI_LOI.find((p) => p.ma === phanLoai)?.goiY;
  return (
    <Modal
      open
      onClose={onClose}
      title={t("Giải trình quá hạn — {a}", { a: r.doi_tuong_id })}
      footer={
        <div className="flex items-center justify-end gap-2">
          {thieu && <span className="text-xs text-[var(--color-text-secondary)] mr-auto">{thieu}</span>}
          <Btn variant="ghost" onClick={onClose}>{t("Huỷ")}</Btn>
          <Btn loading={gui.isPending} disabled={!!thieu} onClick={() => { setLoi(null); gui.mutate(); }}>{t("Gửi giải trình")}</Btn>
        </div>
      }
    >
      <KhoiLoiViPham r={r} />
      {r.trang_thai === "Cho giai trinh" && (
        <div className="text-sm mb-3">{t("Hạn giải trình: {a}", { a: ngayGio(r.han_giai_trinh) })} {conLai(r.han_giai_trinh) && `(${conLai(r.han_giai_trinh)})`}</div>
      )}
      <label className="text-sm font-semibold">{t("1. Lý do chậm")} *</label>
      <select className="mt-1 w-full rounded-lg border border-[var(--color-border)] p-2 text-sm" value={lyDo} onChange={(e) => setLyDo(e.target.value)}>
        <option value="">{t("— Chọn lý do —")}</option>
        {(dsLyDo.data?.rows ?? []).map((x) => (<option key={x} value={x}>{x}</option>))}
      </select>
      <p className="text-xs text-[var(--color-text-secondary)] mt-1 mb-3">
        {khongDung
          ? t("Ghi rõ vì sao ca này không thuộc trách nhiệm của bạn / bộ phận bạn (vd đơn treo do KTV chưa chuyển tiền, ghi sai khu vực).")
          : t("Ca không thuộc trách nhiệm của bạn? Chọn lý do \"Ghi nhận không đúng / không thuộc trách nhiệm\" và ghi rõ nguyên nhân.")}
      </p>
      <div className="text-sm font-semibold">{t("2. Lỗi thuộc về")} *</div>
      <div className="mt-1 grid grid-cols-2 gap-2 mb-1">
        {PHAN_LOAI_LOI.map((p) => (
          <button
            key={p.ma}
            type="button"
            onClick={() => setPhanLoai(p.ma)}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${phanLoai === p.ma ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary)]" : "border-[var(--color-border)]"}`}
          >
            {phanLoai === p.ma ? "● " : "○ "}{t(p.nhan)}
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--color-text-secondary)] mb-3">{goiY ? t(goiY) : t("Không phải lỗi của bạn thì cần đính kèm ảnh bằng chứng.")}</p>
      {canBangChung && (
        <div className="mb-3">
          <div className="text-sm font-semibold">
            {t("3. Ảnh bằng chứng")} * <span className="font-normal text-xs text-[var(--color-text-secondary)]">{t("(1–5 ảnh: tin nhắn, email, ảnh chụp màn hình…)")}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {anh.map((u, i) => (<AnhThumb key={u} url={u} stt={i + 1} onXoa={() => setAnh((x) => x.filter((y) => y !== u))} />))}
            {anh.length < MAX_BANG_CHUNG && (
              <FileButton accept="image/*" multiple variant={anh.length ? "subtle" : "primary"} disabled={dangTai > 0} onFilesSelected={(fs) => void taiAnh(fs)}>
                {dangTai > 0 ? t("Đang tải...") : anh.length === 0 ? t("📷 Chụp / chọn ảnh") : t("+ Thêm ảnh")}
              </FileButton>
            )}
          </div>
        </div>
      )}
      <label className="text-sm font-semibold">{canBangChung ? t("4. Nội dung giải trình") : t("3. Nội dung giải trình")} *</label>
      <textarea className="mt-1 w-full rounded-lg border border-[var(--color-border)] p-2 text-sm min-h-[100px]" value={nd} maxLength={2000} onChange={(e) => setNd(e.target.value)} />
      {loi && <p className="text-sm text-[var(--color-danger)] mt-1">{loi}</p>}
    </Modal>
  );
}

/** Nut thao tac (dung chung bang + chi tiet + banner). */
export function NutViPham({ r, onMo, nho }: { r: ViPhamRow; onMo: (l: LoaiHop) => void; nho?: boolean }) {
  const s = nho ? "sm" : "md";
  return (
    <div className="flex flex-wrap gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
      {r.duoc_giai_trinh && <Btn size={s} onClick={() => onMo("giai_trinh")}>{t("Giải trình")}</Btn>}
    </div>
  );
}

/** Chi tiet: luong ngang (Vao buoc → Han → Roi buoc → Giai trinh / Gan the / Xem xet) + "Xem chi tiet" xo toan bo thong tin. */
export function ChiTietViPham({ r, onClose }: { r: ViPhamRow; onClose: () => void }) {
  const [mo, setMo] = useState(false);
  const [hop, setHop] = useState<LoaiHop | null>(null);
  type Moc = { nhan: string; luc: string | null; kieu: "xong" | "dang" | "tre" | "do" };
  const cuoi: Moc =
    r.trang_thai === "Cho giai trinh"
      ? { nhan: t("Chờ giải trình"), luc: r.han_giai_trinh, kieu: "dang" }
      : r.trang_thai === "Da giai trinh"
        ? { nhan: t("Đã giải trình"), luc: r.giai_trinh_luc, kieu: "xong" }
        : { nhan: t("Tồn CEO"), luc: r.gan_the_luc, kieu: "do" };
  const moc: Moc[] = [
    { nhan: t("Vào bước"), luc: r.moc_vao, kieu: "xong" },
    { nhan: t("Hạn {n}h", { n: r.so_gio_sla }), luc: r.han, kieu: "tre" },
    { nhan: r.dang_cho ? t("Đang chờ xử lý") : t("Rời bước"), luc: r.ket_thuc_luc, kieu: r.dang_cho ? "dang" : "xong" },
    cuoi,
  ];
  const mau: Record<Moc["kieu"], string> = {
    xong: "var(--color-success)",
    dang: "var(--color-warning)",
    tre: "var(--color-danger)",
    do: "var(--color-danger)",
  };
  const Hang = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <>
      <dt className="text-[var(--color-text-secondary)]">{k}</dt>
      <dd>{v}</dd>
    </>
  );
  return (
    <>
      <Modal open onClose={onClose} title={t("Quá hạn — {a}", { a: r.doi_tuong_id })} width="max-w-2xl" footer={<NutViPham r={r} onMo={setHop} />}>
        <div className="text-sm mb-1">
          <b>{t(r.ten_buoc)}</b> · {t(r.ten_bo_phan)} · {t("trễ {a}", { a: gioTre(r.so_gio_tre) })} <Badge tone={TONE_TT[r.trang_thai]}>{t(NHAN_TT[r.trang_thai])}</Badge>
        </div>
        <div className="text-sm mb-3">
          {t("Người phải giải trình")}: <b>{tenPt(r.nguoi_phu_trach)}</b>
          {r.trang_thai === "Cho giai trinh" && <> · {t("hạn {a}", { a: ngayGio(r.han_giai_trinh) })} <span className="text-[var(--color-warning)]">{conLai(r.han_giai_trinh) ?? ""}</span></>}
        </div>
        <KhoiLoiViPham r={r} />
        <div className="relative flex justify-between px-2 pt-2 pb-1">
          <div className="absolute left-6 right-6 top-[15px] h-[2px] bg-[var(--color-border)]" />
          {moc.map((m, i) => (
            <div key={i} className="relative flex flex-col items-center text-center w-1/4" title={m.luc ?? ""}>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white shadow" style={{ background: mau[m.kieu] }} />
              <span className="mt-1 text-xs font-semibold">{m.nhan}</span>
              <span className="text-[11px] text-[var(--color-text-secondary)]">{ngayGio(m.luc)}</span>
            </div>
          ))}
        </div>
        {r.giai_trinh && (
          <div className="mt-3 rounded-lg border border-[var(--color-border)] p-3 text-sm">
            <div className="text-xs text-[var(--color-text-secondary)] mb-1">
              {t("Giải trình")} · {r.nguoi_giai_trinh_ten ?? r.nguoi_giai_trinh} · {ngayGio(r.giai_trinh_luc)}
              {r.giai_trinh_tu_dong && ` · ${t("lấy từ lý do chậm đã nhập")}`}
            </div>
            {r.ly_do && <div className="font-semibold">{r.ly_do}</div>}
            {r.ten_phan_loai_loi && (
              <div className="my-1"><Badge tone={r.phan_loai_loi === "cua_toi" ? "amber" : "gray"}>{t(r.ten_phan_loai_loi)}</Badge></div>
            )}
            {r.giai_trinh}
            {r.bang_chung?.length > 0 && (
              <div className="mt-2">
                <div className="text-xs text-[var(--color-text-secondary)] mb-1">{t("Bằng chứng")}</div>
                <BangChungAnhList urls={r.bang_chung} />
              </div>
            )}
          </div>
        )}
        <button className="mt-3 text-sm text-[var(--color-primary)] font-semibold" onClick={() => setMo((x) => !x)}>
          {mo ? `▴ ${t("Thu gọn")}` : `▾ ${t("Xem chi tiết")}`}
        </button>
        {mo && (
          <dl className="mt-2 grid grid-cols-[150px_1fr] gap-y-1.5 text-sm">
            <Hang k={t("Đơn / phiếu")} v={<><MaDoiTuong r={r} />{r.doi_tuong === "phieu" && r.don_ids.length > 0 && <span className="text-[var(--color-text-secondary)]"> · {t("{n} đơn", { n: r.don_ids.length })}</span>}</>} />
            <Hang k={t("Loại")} v={t(NHAN_LOAI[r.loai])} />
            {r.ma_lk && <Hang k={t("Linh kiện")} v={`${r.ma_lk} · ${r.ten_lk ?? ""}`} />}
            {(r.ma_yeu_cau_su_co || r.ma_lada) && <Hang k={t("Mã YCSC / Lada")} v={[r.ma_yeu_cau_su_co, r.ma_lada].filter(Boolean).join(" · ")} />}
            <Hang k={t("Khu vực")} v={r.khu_vuc_ma ?? "—"} />
            <Hang k={t("Người nhận hàng")} v={r.nguoi_nhan_hang_ten ?? r.nguoi_nhan_hang ?? "—"} />
            <Hang k={t("Vào bước")} v={r.moc_vao} />
            <Hang k={t("Hạn")} v={`${r.han} (${r.so_gio_sla}h)`} />
            <Hang k={t("Rời bước")} v={r.ket_thuc_luc ? `${r.ket_thuc_luc} · ${r.nguoi_xu_ly_ten ?? r.nguoi_xu_ly ?? t("Hệ thống")} · ${r.trang_thai_sau ?? ""}` : t("Đang chờ")} />
            <Hang k={t("Người phải giải trình")} v={tenPt(r.nguoi_phu_trach)} />
            <Hang k={t("Hạn giải trình")} v={r.han_giai_trinh} />
            {r.nhac_luc && <Hang k={t("Đã nhắc lúc")} v={r.nhac_luc} />}
            {r.gan_the_luc && <Hang k={t("Chuyển Tồn CEO lúc")} v={r.gan_the_luc} />}
          </dl>
        )}
      </Modal>
      {hop && <HopViPham r={r} loai={hop} onClose={() => { setHop(null); onClose(); }} />}
    </>
  );
}

/** Banner trong chi tiet don / phieu / ticket: ca qua han lien quan (chi nhan vien van phong - KTV khong goi API nay). */
export function ViPhamBanner({ ids }: { ids: (string | null | undefined)[] }) {
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  const ds = ids.filter(Boolean) as string[];
  const vanPhong = !!u && (u.vai_tro === "Admin" || (!u.la_ktv_dvbh && !u.la_ve_tinh));
  const q = useQuery({
    queryKey: ["vi-pham-theo", ds.join(",")],
    queryFn: () => api.get<{ rows: ViPhamRow[] }>(`/vi-pham/theo-doi-tuong?ids=${encodeURIComponent(ds.join(","))}`),
    enabled: vanPhong && ds.length > 0,
    staleTime: 30_000,
  });
  const [xem, setXem] = useState<ViPhamRow | null>(null);
  const [hop, setHop] = useState<{ r: ViPhamRow; loai: LoaiHop } | null>(null);
  const rows = q.data?.rows ?? [];
  if (!rows.length) return null;
  return (
    <div className="mb-3 space-y-1.5">
      {rows.map((r) => {
        const canhBao = r.trang_thai === "Cho giai trinh" || r.trang_thai === "Ton CEO";
        return (
          <div
            key={r.id}
            className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${canhBao ? "border-[var(--color-warning)] bg-[var(--color-warning-soft)]" : "border-[var(--color-border)]"}`}
            onClick={() => setXem(r)}
          >
            <span>⏰</span>
            <span className="flex-1 min-w-[220px]">
              <b>{t(r.ten_buoc)}</b> {t("quá hạn {a}", { a: gioTre(r.so_gio_tre) })} · <Badge tone={TONE_TT[r.trang_thai]}>{t(NHAN_TT[r.trang_thai])}</Badge>
              {r.trang_thai === "Cho giai trinh" && <span className="text-[var(--color-text-secondary)]"> · {t("{a} giải trình trước {b}", { a: tenPt(r.nguoi_phu_trach), b: ngayGio(r.han_giai_trinh) })}</span>}
            </span>
            <NutViPham r={r} nho onMo={(loai) => setHop({ r, loai })} />
          </div>
        );
      })}
      {xem && <ChiTietViPham r={xem} onClose={() => setXem(null)} />}
      {hop && <HopViPham r={hop.r} loai={hop.loai} onClose={() => setHop(null)} />}
    </div>
  );
}
