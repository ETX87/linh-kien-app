import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../ui/Toast";
import { t, dichSau } from "../../i18n";
import { fmtVND, fmtDate } from "../../types";
import { LinhKienPicker } from "../../modules/datMuaLinhKien/LinhKienPicker";
import { useLkAndLdeCache, trangThaiLabel } from "../../modules/datMuaLinhKien/helpers";
import type { LkDanhMucRow } from "../../modules/datMuaLinhKien/types";
import { DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, THIEU_LK_TRANG_THAI_OPTIONS } from "../../modules/datMuaLinhKien/constants";
import { useLienQuanLk } from "../../modules/danhMucLinhKien/LienQuanLk";
import { XemAnhLon } from "./HuongDan";
import { TheLk } from "./LkTuDong";
import { NHOM_HUONG_DAN, VAN_DE_THEO_MA, VD_KHONG_TIM_THAY_LK, type VanDe } from "./cayHoiNhanh";

// "💬 Hỏi nhanh" (2026-10-28, docs/Phan_luong_hoi_dap_tu_dong.md): hoi dap dang HOI THOAI cho nguoi hoi - bot hoi, KTV bam lua chon
// (<= 5 moi cap), lua chon da bam hien nhu tin cua KTV; toi da 4 lan bam toi cau tra loi DUNG 1 VAN DE.
// CHI TREN MAY NGUOI DUNG (chot 2026-10-28 "các câu hỏi nhanh chỉ lưu trên cache người dùng, không cần lưu về D1"): noi dung = cayHoiNhanh.ts
// (dong goi cung app), anh = /huong-dan-goi/*.jpg (file tinh, trinh duyet cache); hoi thoai dang do luu localStorage theo tai khoan
// (KHOA_LUU). Khong ghi gi len server - chi DOC du lieu that (danh muc LK cache, lien-quan LK, danh sach don/phieu).
const XemLinhKienDrawer = lazy(() => import("../../modules/DanhMucLinhKienModule").then((m) => ({ default: m.XemLinhKienDrawer })));
const DonHangDetailModal = lazy(() => import("../../modules/datMuaLinhKien/DonCuaToiTab").then((m) => ({ default: m.DonHangDetailModal })));
const PxkDetailModal = lazy(() => import("../../modules/datMuaLinhKien/PhieuXuatKhoTab").then((m) => ({ default: m.PxkDetailModal })));

type MucLk = "gia" | "ton" | "ve" | "tt";
type MucCuaToi = "don" | "tien" | "nhan" | "tu_choi";
type Buoc =
  | { k: "goc" }
  | { k: "lk" }
  | { k: "lk-chon"; muc: MucLk }
  | { k: "lk-tl"; muc: MucLk; ma: string }
  | { k: "hd" }
  | { k: "hd-nhom"; nhom: string }
  | { k: "hd-cd"; cd: string }
  | { k: "vd"; ma: string }
  | { k: "cua-toi" }
  | { k: "ct"; muc: MucCuaToi }
  | { k: "khac" }
  | { k: "xong" };
interface Luot { buoc: Buoc; chon?: string }

export interface GoiYHoi { loai: string; maLk?: string; noiDung?: string }

const MUC_LK: { muc: MucLk; nhan: string; loaiHoi: string }[] = [
  { muc: "gia", nhan: dichSau("💲 Giá linh kiện"), loaiHoi: "hoi_gia" },
  { muc: "ton", nhan: dichSau("📦 Còn hàng không (tồn kho)"), loaiHoi: "khac" },
  { muc: "ve", nhan: dichSau("🚚 Bao giờ có hàng"), loaiHoi: "hoi_ngay_ve" },
  { muc: "tt", nhan: dichSau("🔁 Linh kiện thay thế"), loaiHoi: "khac" },
];
const MUC_CUA_TOI: { muc: MucCuaToi; nhan: string }[] = [
  { muc: "don", nhan: dichSau("⏳ Đơn đang chờ xử lý") },
  { muc: "tien", nhan: dichSau("💳 Phiếu cần chuyển tiền") },
  { muc: "nhan", nhan: dichSau("📥 Phiếu chờ tôi nhận hàng") },
  { muc: "tu_choi", nhan: dichSau("✕ Đơn bị từ chối / hủy gần đây") },
];

// "**đậm**" trong noi dung goi -> <b>
function ChuDam({ s }: { s: string }) {
  return <>{s.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((x, i) => (x.startsWith("**") ? <b key={i}>{x.slice(2, -2)}</b> : <span key={i}>{x}</span>))}</>;
}

function BongBot({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-2 rounded-2xl rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] text-[var(--color-text)]">{children}</div>
    </div>
  );
}
function BongToi({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--color-primary)] px-3 py-2 text-[13px] text-white">{children}</div>
    </div>
  );
}
function NutChon({ children, onClick, phu }: { children: ReactNode; onClick: () => void; phu?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring block w-full rounded-xl border px-3 py-2 text-left text-[13px] font-semibold transition-colors ${
        phu
          ? "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]"
          : "border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)] hover:border-[var(--color-primary)]"
      }`}
    >
      {children}
    </button>
  );
}

// Hoi thoai dang do luu tren may (localStorage) theo tai khoan, giu 7 ngay - dong / mo lai khung chat van thay tiep.
const KHOA_LUU = (email: string) => `hoi-nhanh:${email}`;
const GIU_MS = 7 * 24 * 3600 * 1000;
function docHoiThoai(email: string): Luot[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(KHOA_LUU(email)) ?? "null") as { luc: number; luot: Luot[] } | null;
    return v && Date.now() - v.luc < GIU_MS && Array.isArray(v.luot) && v.luot.length > 0 ? v.luot : null;
  } catch {
    return null;
  }
}

export function HoiNhanh({ onHoiMuaHang, onXemCauHoi }: { onHoiMuaHang: (g: GoiYHoi) => void; onXemCauHoi: () => void }) {
  const auth = useAuth();
  const email = auth.status === "authenticated" ? auth.user.email : "";
  const [luot, setLuot] = useState<Luot[]>(() => docHoiThoai(email) ?? [{ buoc: { k: "goc" } }]);
  useEffect(() => {
    if (!email) return;
    try {
      if (luot.length <= 1) localStorage.removeItem(KHOA_LUU(email));
      else localStorage.setItem(KHOA_LUU(email), JSON.stringify({ luc: Date.now(), luot }));
    } catch {
      // bo qua (het dung luong / che do rieng tu)
    }
  }, [email, luot]);
  const cuoiRef = useRef<HTMLDivElement>(null);
  // Than ham trong {} - scrollIntoView() tren Chrome moi tra Promise, tra ve tu effect thi React goi no nhu ham don dep -> loi.
  useEffect(() => {
    cuoiRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [luot.length]);
  const { danhMuc } = useLkAndLdeCache(true);
  const lkTheoMa = useMemo(() => new Map(danhMuc.map((r) => [r.ma_linh_kien, r])), [danhMuc]);

  const di = (chon: string, buoc: Buoc) => setLuot((ds) => [...ds.slice(0, -1), { ...ds[ds.length - 1], chon }, { buoc }]);
  const lamLai = () => setLuot([{ buoc: { k: "goc" } }]);
  const quayLai = () => setLuot((ds) => (ds.length <= 1 ? ds : [...ds.slice(0, -2), { buoc: ds[ds.length - 2].buoc }]));
  const moVd = (ma: string) => {
    const x = ma === "1.5" ? VD_KHONG_TIM_THAY_LK : VAN_DE_THEO_MA.get(ma)?.vd;
    if (x) di(x.hoi, { k: "vd", ma });
  };

  const veBuoc = (b: Buoc, cuoi: boolean): ReactNode => {
    switch (b.k) {
      case "goc":
        return (
          <BongBot>
            <div className="font-semibold">{t("👋 Chào bạn! Bạn cần hỗ trợ gì?")}</div>
            {cuoi && (
              <div className="space-y-1.5">
                <NutChon onClick={() => di(t("🔩 Thắc mắc về linh kiện"), { k: "lk" })}>{t("🔩 Thắc mắc về linh kiện")}</NutChon>
                <NutChon onClick={() => di(t("📘 Hướng dẫn dùng app"), { k: "hd" })}>{t("📘 Hướng dẫn dùng app")}</NutChon>
                <NutChon onClick={() => di(t("📦 Đơn & phiếu của tôi"), { k: "cua-toi" })}>{t("📦 Đơn & phiếu của tôi")}</NutChon>
                <NutChon onClick={() => di(t("💬 Vấn đề khác"), { k: "khac" })}>{t("💬 Vấn đề khác")}</NutChon>
              </div>
            )}
          </BongBot>
        );
      case "lk":
        return (
          <BongBot>
            <div className="font-semibold">{t("Bạn muốn hỏi gì về linh kiện?")}</div>
            {cuoi && (
              <div className="space-y-1.5">
                {MUC_LK.map((m) => <NutChon key={m.muc} onClick={() => di(t(m.nhan), { k: "lk-chon", muc: m.muc })}>{t(m.nhan)}</NutChon>)}
                <NutChon onClick={() => moVd("1.5")}>{t("🔍 Không tìm thấy linh kiện")}</NutChon>
              </div>
            )}
          </BongBot>
        );
      case "lk-chon":
        return (
          <BongBot>
            <div className="font-semibold">{t("Chọn hoặc gõ mã / tên linh kiện:")}</div>
            {cuoi && (
              <LinhKienPicker
                value=""
                onChange={(ma) => {
                  if (!ma) return;
                  const r = lkTheoMa.get(ma);
                  di(r ? `${r.ten_linh_kien} (${ma})` : ma, { k: "lk-tl", muc: b.muc, ma });
                }}
                options={danhMuc}
                ghiLichSu={false}
                autoFocus
              />
            )}
          </BongBot>
        );
      case "lk-tl":
        return <TraLoiLk muc={b.muc} lk={lkTheoMa.get(b.ma) ?? null} ma={b.ma} cuoi={cuoi} onHoi={onHoiMuaHang} onDaRo={() => di(t("✓ Đã rõ"), { k: "xong" })} onKhac={lamLai} onChonLkKhac={() => di(t("Hỏi linh kiện khác"), { k: "lk-chon", muc: b.muc })} />;
      case "hd":
        return (
          <BongBot>
            <div className="font-semibold">{t("Bạn cần hướng dẫn về việc gì?")}</div>
            {cuoi && (
              <div className="space-y-1.5">
                {NHOM_HUONG_DAN.map((n) => <NutChon key={n.ma} onClick={() => di(`${n.icon} ${n.ten}`, { k: "hd-nhom", nhom: n.ma })}>{n.icon} {n.ten}</NutChon>)}
              </div>
            )}
          </BongBot>
        );
      case "hd-nhom": {
        const n = NHOM_HUONG_DAN.find((x) => x.ma === b.nhom);
        return (
          <BongBot>
            <div className="font-semibold">{t("{a} — chọn chủ đề:", { a: n?.ten ?? "" })}</div>
            {cuoi && n && <div className="space-y-1.5">{n.chuDe.map((c) => <NutChon key={c.ma} onClick={() => di(c.ten, { k: "hd-cd", cd: c.ma })}>{c.ten}</NutChon>)}</div>}
          </BongBot>
        );
      }
      case "hd-cd": {
        const c = NHOM_HUONG_DAN.flatMap((n) => n.chuDe).find((x) => x.ma === b.cd);
        return (
          <BongBot>
            <div className="font-semibold">{t("{a} — bạn đang vướng ở đâu?", { a: c?.ten ?? "" })}</div>
            {cuoi && c && <div className="space-y-1.5">{c.vanDe.map((v) => <NutChon key={v.ma} onClick={() => moVd(v.ma)}>{v.hoi}</NutChon>)}</div>}
          </BongBot>
        );
      }
      case "vd":
        return (
          <TraLoiVanDe
            ma={b.ma}
            cuoi={cuoi}
            onXemThem={moVd}
            onDaRo={() => di(t("✓ Đã rõ"), { k: "xong" })}
            onKhac={lamLai}
            onHoi={() => onHoiMuaHang({ loai: "khac", noiDung: (VAN_DE_THEO_MA.get(b.ma)?.vd.hoi ?? VD_KHONG_TIM_THAY_LK.hoi) + " " })}
          />
        );
      case "cua-toi":
        return (
          <BongBot>
            <div className="font-semibold">{t("Bạn muốn xem gì?")}</div>
            {cuoi && <div className="space-y-1.5">{MUC_CUA_TOI.map((m) => <NutChon key={m.muc} onClick={() => di(t(m.nhan), { k: "ct", muc: m.muc })}>{t(m.nhan)}</NutChon>)}</div>}
          </BongBot>
        );
      case "ct":
        return <CuaToi muc={b.muc} cuoi={cuoi} onDaRo={() => di(t("✓ Đã rõ"), { k: "xong" })} onKhac={lamLai} onHoi={() => onHoiMuaHang({ loai: "khac" })} />;
      case "khac":
        return (
          <BongBot>
            <div className="font-semibold">{t("Bạn cần gì khác?")}</div>
            {cuoi && (
              <div className="space-y-1.5">
                <NutChon onClick={() => onHoiMuaHang({ loai: "khac" })}>{t("💬 Hỏi nhân viên Mua hàng")}</NutChon>
                <NutChon onClick={() => onHoiMuaHang({ loai: "khac", noiDung: "[Báo lỗi app] " })}>{t("🐞 Báo lỗi / góp ý về app")}</NutChon>
                <NutChon onClick={onXemCauHoi}>{t("🗂 Xem câu hỏi tôi đã gửi")}</NutChon>
              </div>
            )}
          </BongBot>
        );
      case "xong":
        return (
          <BongBot>
            <div>{t("Rất vui đã giúp được bạn! 😊")}</div>
            {cuoi && <NutChon onClick={lamLai}>{t("↩ Hỏi việc khác")}</NutChon>}
          </BongBot>
        );
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[var(--color-surface-soft)] px-3 py-3">
        {luot.map((l, i) => (
          <div key={i} className="space-y-2">
            {veBuoc(l.buoc, i === luot.length - 1)}
            {l.chon && <BongToi>{l.chon}</BongToi>}
          </div>
        ))}
        <div ref={cuoiRef} />
      </div>
      {luot.length > 1 && (
        <div className="flex shrink-0 gap-2 border-t border-[var(--color-border)] px-3 py-2">
          <button type="button" onClick={quayLai} className="focus-ring rounded-lg px-2.5 py-1 text-[12.5px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-subtle)]">{t("‹ Quay lại")}</button>
          <button type="button" onClick={lamLai} className="focus-ring ml-auto rounded-lg px-2.5 py-1 text-[12.5px] font-semibold text-[var(--color-primary-dark)] hover:bg-[var(--color-subtle)]">{t("↩ Làm lại từ đầu")}</button>
        </div>
      )}
    </div>
  );
}

// 3 nut cuoi moi cau tra loi.
function NutCuoi({ onDaRo, onKhac, onHoi, them }: { onDaRo: () => void; onKhac: () => void; onHoi: () => void; them?: ReactNode }) {
  return (
    <div className="space-y-1.5 pt-1">
      {them}
      <div className="grid grid-cols-2 gap-1.5">
        <NutChon onClick={onDaRo}>{t("✓ Đã rõ")}</NutChon>
        <NutChon phu onClick={onKhac}>{t("↩ Hỏi việc khác")}</NutChon>
      </div>
      <NutChon phu onClick={onHoi}>{t("💬 Vẫn cần hỏi Mua hàng")}</NutChon>
    </div>
  );
}

function AnhLon({ anh }: { anh: string[] }) {
  const [xem, setXem] = useState<number | null>(null);
  if (anh.length === 0) return null;
  return (
    <>
      {anh.map((u, i) => (
        <button key={u + i} type="button" onClick={() => setXem(i)} className="focus-ring block w-full overflow-hidden rounded-lg border border-[var(--color-border)]" title={t("Xem ảnh")}>
          <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-[360px] w-full object-contain bg-[var(--color-surface-soft)]" />
        </button>
      ))}
      {xem !== null && <XemAnhLon anh={anh} batDau={xem} onDong={() => setXem(null)} />}
    </>
  );
}

function TraLoiVanDe({
  ma, cuoi, onXemThem, onDaRo, onKhac, onHoi,
}: { ma: string; cuoi: boolean; onXemThem: (ma: string) => void; onDaRo: () => void; onKhac: () => void; onHoi: () => void }) {
  const goc: VanDe | undefined = ma === "1.5" ? VD_KHONG_TIM_THAY_LK : VAN_DE_THEO_MA.get(ma)?.vd;
  const xemThem = (goc?.xemThem ?? []).filter((m) => m === "1.5" || VAN_DE_THEO_MA.has(m)).slice(0, 2);
  const noiDung: ReactNode = goc ? (
    <>
      <div className="font-semibold">📘 {goc.hoi}</div>
      <ol className="list-decimal space-y-1 pl-5 leading-relaxed">{goc.buoc.map((x, i) => <li key={i}><ChuDam s={x} /></li>)}</ol>
      <AnhLon anh={(goc.anh ?? []).map((a) => `/huong-dan-goi/${a}.jpg`)} />
    </>
  ) : (
    <div>{t("Chưa có hướng dẫn cho vấn đề này — bấm \"Vẫn cần hỏi Mua hàng\" để được trả lời.")}</div>
  );
  return (
    <BongBot>
      {noiDung}
      {cuoi && (
        <NutCuoi
          onDaRo={onDaRo}
          onKhac={onKhac}
          onHoi={onHoi}
          them={xemThem.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11.5px] font-semibold text-[var(--color-text-secondary)]">{t("Xem thêm:")}</div>
              {xemThem.map((m) => {
                const v = m === "1.5" ? VD_KHONG_TIM_THAY_LK : VAN_DE_THEO_MA.get(m)!.vd;
                return <NutChon key={m} phu onClick={() => onXemThem(m)}>{v.hoi}</NutChon>;
              })}
            </div>
          )}
        />
      )}
    </BongBot>
  );
}

function TraLoiLk({
  muc, lk, ma, cuoi, onHoi, onDaRo, onKhac, onChonLkKhac,
}: { muc: MucLk; lk: LkDanhMucRow | null; ma: string; cuoi: boolean; onHoi: (g: GoiYHoi) => void; onDaRo: () => void; onKhac: () => void; onChonLkKhac: () => void }) {
  const [xemLk, setXemLk] = useState<string | null>(null);
  const { data, isLoading } = useLienQuanLk(muc === "ve" || muc === "tt" ? ma : null);
  const giaKtv = (lk as (LkDanhMucRow & { gia_tri_cong_no?: number | null }) | null)?.gia_tri_cong_no ?? null;
  let noiDung: ReactNode = null;
  if (muc === "gia") {
    noiDung = (
      <div className="space-y-1">
        <div className="font-semibold">{lk?.ten_linh_kien ?? ma} <span className="font-mono text-[11px] text-[var(--color-primary-dark)]">{ma}</span></div>
        <div>{t("Giá niêm yết:")} <b>{lk?.gia_ban ? fmtVND(lk.gia_ban) : "—"}</b></div>
        <div>{t("Giá KTV:")} <b>{giaKtv ? fmtVND(giaKtv) : "—"}</b></div>
        <div className="text-[12px] text-[var(--color-text-secondary)]">{t("Giá phải trả tính theo tổng đặt trong ngày: dưới 200.000đ = giá niêm yết, 200.000–500.000đ = 70%, từ 500.000đ = giá KTV (linh kiện Đình tủ luôn 85%).")}</div>
      </div>
    );
  } else if (muc === "ton") {
    noiDung = lk ? <TheLk lk={lk} onMo={() => setXemLk(ma)} /> : <div>{ma}</div>;
  } else if (muc === "ve") {
    const choHang = (data?.don_hang ?? []).filter((d) => d.trang_thai_hien_tai === "Cho hang");
    noiDung = isLoading ? <div>{t("Đang tải...")}</div> : (
      <div className="space-y-1.5">
        <div className="font-semibold">{lk?.ten_linh_kien ?? ma} <span className="font-mono text-[11px] text-[var(--color-primary-dark)]">{ma}</span></div>
        {(data?.thieu_lk_mo ?? []).length > 0 ? (
          (data?.thieu_lk_mo ?? []).slice(0, 5).map((tk) => (
            <div key={tk.id} className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[12.5px]">
              <div><span className="font-mono">{tk.dat_don_hang_id}</span> · {tk.trang_thai ? trangThaiLabel(THIEU_LK_TRANG_THAI_OPTIONS, tk.trang_thai) : "—"}</div>
              <div>{t("Dự kiến có hàng:")} <b>{tk.ngay_du_kien_co_hang ? fmtDate(tk.ngay_du_kien_co_hang) : t("Kho chưa báo ngày")}</b></div>
            </div>
          ))
        ) : choHang.length > 0 ? (
          <div>{t("Bạn có {n} đơn đang chờ hàng với mã này — Kho chưa tiếp nhận / chưa báo ngày dự kiến.", { n: choHang.length })}</div>
        ) : (
          <div>{t("Bạn không có đơn nào đang chờ hàng với mã này. Muốn biết ngày hàng về để đặt, hãy hỏi Mua hàng.")}</div>
        )}
      </div>
    );
  } else {
    const nhom = data?.thay_the ?? [];
    noiDung = isLoading ? <div>{t("Đang tải...")}</div> : nhom.length === 0 ? (
      <div>{t("Linh kiện {a} chưa có nhóm linh kiện thay thế.", { a: ma })}</div>
    ) : (
      <div className="space-y-1.5">
        {nhom.slice(0, 3).map((g) => (
          <div key={g.nhom_id} className="space-y-1">
            <div className="text-[12px] font-semibold text-[var(--color-text-secondary)]">{g.ten_nhom}</div>
            {g.linh_kien.filter((x) => x.ma_linh_kien !== ma).slice(0, 5).map((x) => (
              <NutChon key={x.ma_linh_kien} phu onClick={() => setXemLk(x.ma_linh_kien)}>{x.ten_linh_kien ?? x.ma_linh_kien} <span className="font-mono text-[11px]">{x.ma_linh_kien}</span></NutChon>
            ))}
          </div>
        ))}
      </div>
    );
  }
  const loaiHoi = MUC_LK.find((m) => m.muc === muc)?.loaiHoi ?? "khac";
  return (
    <BongBot>
      {noiDung}
      {cuoi && (
        <NutCuoi
          onDaRo={onDaRo}
          onKhac={onKhac}
          onHoi={() => onHoi({ loai: loaiHoi, maLk: ma })}
          them={
            <div className="grid grid-cols-2 gap-1.5">
              <NutChon phu onClick={() => setXemLk(ma)}>{t("🔎 Xem chi tiết LK")}</NutChon>
              <NutChon phu onClick={onChonLkKhac}>{t("Hỏi linh kiện khác")}</NutChon>
            </div>
          }
        />
      )}
      {xemLk && (
        <Suspense fallback={null}>
          <XemLinhKienDrawer ma={xemLk} onClose={() => setXemLk(null)} />
        </Suspense>
      )}
    </BongBot>
  );
}

interface DonNgan { id: string; ten_lk_snapshot: string | null; ma_lk: string; trang_thai: string; ngay_tao: string; ghi_chu_xu_ly_gan_nhat: string | null }
interface PhieuNgan { id: string; ma_xuat_kho: string | null; trang_thai: string; trang_thai_chuyen_tien: string | null; so_tien_can_chuyen: number | null; da_thanh_toan?: number; ngay_tao: string }

function CuaToi({ muc, cuoi, onDaRo, onKhac, onHoi }: { muc: MucCuaToi; cuoi: boolean; onDaRo: () => void; onKhac: () => void; onHoi: () => void }) {
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  const qc = useQueryClient();
  const toast = useToast();
  const [moDon, setMoDon] = useState<string | null>(null);
  const [moPhieu, setMoPhieu] = useState<string | null>(null);
  const laDon = muc === "don" || muc === "tu_choi";
  const { data, isLoading } = useQuery({
    queryKey: ["hoi-nhanh-cua-toi", muc],
    queryFn: async () => {
      const q = (tt: string) => api.get<{ rows: DonNgan[] }>(`/dat-mua-lk/don-hang?trang_thai=${encodeURIComponent(tt)}&loai_don=all&page=1&pageSize=5`).then((r) => r.rows);
      const p = (tt: string) =>
        api.get<{ rows: PhieuNgan[] }>(`/phieu-xuat-kho?trang_thai=${encodeURIComponent(tt)}&nguoi_nhan_hang=${encodeURIComponent(u?.email ?? "")}&page=1&pageSize=5`).then((r) => r.rows);
      const moi = <T extends { ngay_tao: string }>(a: T[]) => [...a].sort((x, y) => y.ngay_tao.localeCompare(x.ngay_tao)).slice(0, 5);
      if (muc === "don") return { don: moi([...(await q("__OPEN__")), ...(await q("Cho hang"))]), phieu: [] };
      if (muc === "tu_choi") return { don: moi([...(await q("TN tu choi")), ...(await q("Da huy"))]), phieu: [] };
      return { don: [], phieu: await p(muc === "tien" ? "CHO_TIEN" : "Dang gui KTV") };
    },
    staleTime: 30_000,
  });
  const ds = laDon ? data?.don ?? [] : data?.phieu ?? [];
  const trong = {
    don: t("Bạn không có đơn nào đang chờ xử lý."),
    tu_choi: t("Không có đơn bị từ chối / hủy gần đây."),
    tien: t("Không có phiếu nào cần chuyển tiền."),
    nhan: t("Không có phiếu nào đang chờ bạn nhận hàng."),
  }[muc];
  return (
    <BongBot>
      {isLoading ? <div>{t("Đang tải...")}</div> : ds.length === 0 ? <div>{trong}</div> : (
        <div className="space-y-1.5">
          <div className="text-[12px] text-[var(--color-text-secondary)]">{t("Bấm vào để mở chi tiết (tối đa 5 dòng mới nhất):")}</div>
          {laDon
            ? (data?.don ?? []).map((d) => (
              <button key={d.id} type="button" onClick={() => setMoDon(d.id)} className="focus-ring block w-full rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-left hover:border-[var(--color-primary)]">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{d.ten_lk_snapshot ?? d.ma_lk}</span>
                  <span className="shrink-0 font-mono text-[11px] text-[var(--color-primary-dark)]">{d.id}</span>
                </div>
                <div className="text-[12px] font-semibold text-[var(--color-warning-dark,var(--color-text))]">{trangThaiLabel(DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, d.trang_thai)}</div>
                {d.ghi_chu_xu_ly_gan_nhat && <div className="line-clamp-2 text-[11.5px] text-[var(--color-text-secondary)]">{t("Lý do:")} {d.ghi_chu_xu_ly_gan_nhat}</div>}
              </button>
            ))
            : (data?.phieu ?? []).map((p) => {
              const con = Math.max(0, (p.so_tien_can_chuyen ?? 0) - (p.da_thanh_toan ?? 0));
              return (
                <button key={p.id} type="button" onClick={() => setMoPhieu(p.id)} className="focus-ring block w-full rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-left hover:border-[var(--color-primary)]">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[12.5px] font-semibold text-[var(--color-primary-dark)]">{p.id}</span>
                    <span className="ml-auto text-[11px] text-[var(--color-text-secondary)]">{fmtDate(p.ngay_tao)}</span>
                  </div>
                  {muc === "tien" ? (
                    <div className="text-[12px]">
                      {t("Còn phải chuyển:")} <b>{fmtVND(con)}</b>
                      {p.trang_thai_chuyen_tien === "KTV da chuyen" && <span className="text-[var(--color-text-secondary)]"> · {t("đã báo chuyển, chờ Kế toán xác nhận")}</span>}
                    </div>
                  ) : (
                    <div className="text-[12px]">{t("Hàng đang gửi — nhận xong bấm \"📥 KTV đã nhận\" trong phiếu.")}</div>
                  )}
                </button>
              );
            })}
        </div>
      )}
      {cuoi && <NutCuoi onDaRo={onDaRo} onKhac={onKhac} onHoi={onHoi} />}
      {moDon && u && (
        <Suspense fallback={null}>
          <DonHangDetailModal
            id={moDon}
            onClose={() => setMoDon(null)}
            addToast={toast}
            qc={qc}
            canTacNghiep={!!u.la_tac_nghiep}
            canTPDvbhXacNhan={!!u.la_tp_dvbh}
            canActAsTram={false}
            currentEmail={u.email}
            isAdmin={u.vai_tro === "Admin"}
            canXemChiTietCa={false}
            canKho={!!u.la_kho}
          />
        </Suspense>
      )}
      {moPhieu && u && (
        <Suspense fallback={null}>
          <PxkDetailModal
            id={moPhieu}
            onClose={() => setMoPhieu(null)}
            addToast={toast}
            qc={qc}
            canTacNghiep={!!u.la_tac_nghiep}
            canKho={!!u.la_kho}
            canKeToan={!!u.la_ke_toan}
            canDownloadMisa={false}
            currentEmail={u.email}
            isAdmin={u.vai_tro === "Admin"}
          />
        </Suspense>
      )}
    </BongBot>
  );
}
