import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Btn } from "../../components/ui/Btn";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/Toast";
import { MaDonLink, MaPhieuLink } from "../datMuaLinhKien/MaLienKet";
import { describeApiError } from "../datMuaLinhKien/helpers";
import { t } from "../../i18n";

// Thanh phan dung chung "Quá hạn & vi phạm" (v1.518): hop giai trinh / bao khong dung / Admin xu ly / go the, chi tiet 1 ca, banner trong chi
// tiet don / phieu / ticket. Backend: routes/viPham.ts, lib/viPham.ts.

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
  trang_thai: "Cho giai trinh" | "Da giai trinh" | "Gan the" | "Cho xem xet" | "Da go the";
  han_giai_trinh: string;
  ly_do: string | null;
  giai_trinh: string | null;
  nguoi_giai_trinh: string | null;
  nguoi_giai_trinh_ten: string | null;
  giai_trinh_luc: string | null;
  giai_trinh_tu_dong: boolean;
  nhac_luc: string | null;
  gan_the_luc: string | null;
  khieu_nai: string | null;
  khieu_nai_boi_ten: string | null;
  khieu_nai_boi: string | null;
  khieu_nai_luc: string | null;
  khieu_nai_ket_qua: string | null;
  khieu_nai_phan_hoi: string | null;
  khieu_nai_xu_ly_luc: string | null;
  go_the_ly_do: string | null;
  go_the_boi: string | null;
  go_the_luc: string | null;
  ma_yeu_cau_su_co: string | null;
  ma_lada: string | null;
  ma_lk: string | null;
  ten_lk: string | null;
  don_ids: string[];
  la_cua_toi: boolean;
  duoc_giai_trinh: boolean;
  duoc_bao_khong_dung: boolean;
  duoc_xu_ly_bao: boolean;
  duoc_go_the: boolean;
}

export const NHAN_TT: Record<string, string> = {
  "Cho giai trinh": "Chờ giải trình",
  "Da giai trinh": "Đã giải trình",
  "Gan the": "Gắn thẻ vi phạm",
  "Cho xem xet": "Chờ Admin xem xét",
  "Da go the": "Đã gỡ thẻ",
};
export const TONE_TT: Record<string, BadgeTone> = {
  "Cho giai trinh": "amber",
  "Da giai trinh": "teal",
  "Gan the": "coral",
  "Cho xem xet": "violet",
  "Da go the": "gray",
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
  if (!ds.length) return t("Chưa xác định — Admin xử lý");
  return ds.map((p) => p.ten ?? p.email).join(", ");
}

export function MaDoiTuong({ r }: { r: ViPhamRow }) {
  if (r.doi_tuong === "phieu") return <MaPhieuLink id={r.phieu_xuat_kho_id} />;
  if (r.doi_tuong === "ticket")
    return (
      <span className="whitespace-nowrap">
        <span className="font-semibold">{r.doi_tuong_id}</span>
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

type LoaiHop = "giai_trinh" | "bao" | "xu_ly" | "go_the";

/** Hop thao tac tren 1 ca. */
export function HopViPham({ r, loai, onClose }: { r: ViPhamRow; loai: LoaiHop; onClose: () => void }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const [lyDo, setLyDo] = useState("");
  const [nd, setNd] = useState("");
  const [ketQua, setKetQua] = useState<"chap_nhan" | "tu_choi">("tu_choi");
  const [loi, setLoi] = useState<string | null>(null);
  const dsLyDo = useQuery({ queryKey: ["vi-pham-ly-do"], queryFn: () => api.get<{ rows: string[] }>("/vi-pham/ly-do"), enabled: loai === "giai_trinh" });
  const cauHinh: Record<LoaiHop, { tieuDe: string; nhan: string; toiThieu: number; nut: string; ok: string }> = {
    giai_trinh: { tieuDe: t("Giải trình quá hạn — {a}", { a: r.doi_tuong_id }), nhan: t("Nội dung giải trình"), toiThieu: 5, nut: t("Gửi giải trình"), ok: t("Đã ghi giải trình") },
    bao: { tieuDe: t("Báo ghi nhận không đúng — {a}", { a: r.doi_tuong_id }), nhan: t("Vì sao không đúng?"), toiThieu: 5, nut: t("Gửi cho Admin"), ok: t("Đã gửi — chờ Admin xem xét") },
    xu_ly: { tieuDe: t("Xem xét báo không đúng — {a}", { a: r.doi_tuong_id }), nhan: t("Phản hồi cho người báo"), toiThieu: 3, nut: t("Lưu kết quả"), ok: t("Đã xử lý") },
    go_the: { tieuDe: t("Gỡ thẻ vi phạm — {a}", { a: r.doi_tuong_id }), nhan: t("Lý do gỡ"), toiThieu: 3, nut: t("Gỡ thẻ"), ok: t("Đã gỡ thẻ") },
  };
  const ch = cauHinh[loai];
  const gui = useMutation({
    mutationFn: async () => {
      const body = nd.trim();
      if (loai === "giai_trinh") await api.post(`/vi-pham/${r.id}/giai-trinh`, { ly_do: lyDo, noi_dung: body });
      else if (loai === "bao") await api.post(`/vi-pham/${r.id}/bao-khong-dung`, { noi_dung: body });
      else if (loai === "xu_ly") await api.post(`/vi-pham/${r.id}/xu-ly-bao`, { ket_qua: ketQua, phan_hoi: body });
      else await api.post(`/vi-pham/${r.id}/go-the`, { ly_do: body });
    },
    onSuccess: () => {
      addToast(ch.ok);
      lamMoiViPham(qc);
      onClose();
    },
    onError: (e) => setLoi(describeApiError(e)),
  });
  const duGui = nd.trim().length >= ch.toiThieu && (loai !== "giai_trinh" || !!lyDo);
  return (
    <Modal
      open
      onClose={onClose}
      title={ch.tieuDe}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>{t("Huỷ")}</Btn>
          <Btn loading={gui.isPending} disabled={!duGui} onClick={() => { setLoi(null); gui.mutate(); }}>{ch.nut}</Btn>
        </div>
      }
    >
      <div className="rounded-lg bg-[var(--color-surface-soft)] p-3 text-sm mb-3">
        <b>{t(r.ten_buoc)}</b> · {t(r.ten_bo_phan)} · {t("hạn {a}", { a: ngayGio(r.han) })} · <span className="text-[var(--color-danger)]">{t("trễ {a}", { a: gioTre(r.so_gio_tre) })}</span>
        {r.trang_thai === "Cho giai trinh" && <div className="mt-1">{t("Hạn giải trình: {a}", { a: ngayGio(r.han_giai_trinh) })} {conLai(r.han_giai_trinh) && `(${conLai(r.han_giai_trinh)})`}</div>}
      </div>
      {loai === "giai_trinh" && (
        <>
          <label className="text-sm font-semibold">{t("Lý do chậm")} *</label>
          <select className="mt-1 mb-3 w-full rounded-lg border border-[var(--color-border)] p-2 text-sm" value={lyDo} onChange={(e) => setLyDo(e.target.value)}>
            <option value="">{t("— Chọn lý do —")}</option>
            {(dsLyDo.data?.rows ?? []).map((x) => (<option key={x} value={x}>{x}</option>))}
          </select>
        </>
      )}
      {loai === "bao" && (
        <p className="text-sm text-[var(--color-text-secondary)] mb-2">
          {t("Dùng khi ca này không phải trách nhiệm của bạn / bộ phận bạn (vd đơn treo do bên khác, hệ thống ghi sai). Trong lúc Admin xem xét, ca không bị gắn thẻ.")}
        </p>
      )}
      {loai === "xu_ly" && (
        <>
          <div className="rounded-lg border border-[var(--color-border)] p-3 text-sm mb-3">
            <div className="text-xs text-[var(--color-text-secondary)] mb-1">{r.khieu_nai_boi_ten ?? r.khieu_nai_boi} · {ngayGio(r.khieu_nai_luc)}</div>
            {r.khieu_nai}
          </div>
          <div className="flex gap-2 mb-3">
            <button className={`filter-tab ${ketQua === "chap_nhan" ? "active" : ""}`} onClick={() => setKetQua("chap_nhan")}>{t("Chấp nhận — gỡ ghi nhận")}</button>
            <button className={`filter-tab ${ketQua === "tu_choi" ? "active" : ""}`} onClick={() => setKetQua("tu_choi")}>{t("Từ chối — trả lại để giải trình")}</button>
          </div>
        </>
      )}
      <label className="text-sm font-semibold">{ch.nhan} *</label>
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
      {r.duoc_bao_khong_dung && <Btn size={s} variant="ghost" onClick={() => onMo("bao")}>{t("Báo không đúng")}</Btn>}
      {r.duoc_xu_ly_bao && <Btn size={s} onClick={() => onMo("xu_ly")}>{t("Xem xét")}</Btn>}
      {r.duoc_go_the && r.trang_thai === "Gan the" && <Btn size={s} variant="ghost" onClick={() => onMo("go_the")}>{t("Gỡ thẻ")}</Btn>}
    </div>
  );
}

/** Chi tiet: luong ngang (Vao buoc → Han → Roi buoc → Giai trinh / Gan the / Xem xet) + "Xem chi tiet" xo toan bo thong tin. */
export function ChiTietViPham({ r, onClose }: { r: ViPhamRow; onClose: () => void }) {
  const [mo, setMo] = useState(false);
  const [hop, setHop] = useState<LoaiHop | null>(null);
  type Moc = { nhan: string; luc: string | null; kieu: "xong" | "dang" | "tre" | "do" | "tim" };
  const cuoi: Moc =
    r.trang_thai === "Cho giai trinh"
      ? { nhan: t("Chờ giải trình"), luc: r.han_giai_trinh, kieu: "dang" }
      : r.trang_thai === "Da giai trinh"
        ? { nhan: t("Đã giải trình"), luc: r.giai_trinh_luc, kieu: "xong" }
        : r.trang_thai === "Gan the"
          ? { nhan: t("Gắn thẻ vi phạm"), luc: r.gan_the_luc, kieu: "do" }
          : r.trang_thai === "Cho xem xet"
            ? { nhan: t("Chờ Admin xem xét"), luc: r.khieu_nai_luc, kieu: "tim" }
            : { nhan: t("Đã gỡ thẻ"), luc: r.go_the_luc, kieu: "xong" };
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
    tim: "var(--color-purple)",
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
            {r.giai_trinh}
          </div>
        )}
        {r.khieu_nai && (
          <div className="mt-3 rounded-lg border border-[var(--color-border)] p-3 text-sm">
            <div className="text-xs text-[var(--color-text-secondary)] mb-1">{t("Báo không đúng")} · {r.khieu_nai_boi_ten ?? r.khieu_nai_boi} · {ngayGio(r.khieu_nai_luc)}</div>
            {r.khieu_nai}
            {r.khieu_nai_ket_qua && (
              <div className="mt-1">
                <b>{r.khieu_nai_ket_qua === "Chap nhan" ? t("Admin chấp nhận") : t("Admin từ chối")}</b> ({ngayGio(r.khieu_nai_xu_ly_luc)}): {r.khieu_nai_phan_hoi}
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
            {r.gan_the_luc && <Hang k={t("Gắn thẻ lúc")} v={r.gan_the_luc} />}
            {r.go_the_luc && <Hang k={t("Gỡ thẻ")} v={`${r.go_the_luc} · ${r.go_the_boi} · ${r.go_the_ly_do}`} />}
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
  const rows = (q.data?.rows ?? []).filter((r) => r.trang_thai !== "Da go the");
  if (!rows.length) return null;
  return (
    <div className="mb-3 space-y-1.5">
      {rows.map((r) => {
        const canhBao = r.trang_thai === "Cho giai trinh" || r.trang_thai === "Gan the";
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
