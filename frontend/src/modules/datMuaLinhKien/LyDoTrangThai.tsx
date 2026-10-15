import type { ReactNode } from "react";
import type { DonHangRow, DonHangLogRow } from "./types";
import { fmtDate, fmtDateTime, fmtVND } from "../../types";
import { t } from "../../i18n";

// "VÌ SAO ĐƠN Ở TRẠNG THÁI NÀY" (chot 2026-10-15, phan hoi "với các trường hợp đặt hàng mà không được duyệt, cần có cảnh báo rõ ràng
// cho từng trường hợp để người đặt hàng biết lý do => cần minh bạch cho mọi thao tác xử lý cho người đặt hàng hiểu").
// 1 bo giai thich dung CHUNG cho: khung trong chi tiet don (LyDoTrangThaiDon), dong goi y o cot Trang thai cua danh sach
// (tomTatLyDo) va man "Kết quả đặt hàng" ngay sau khi tao (KetQuaTaoDonModal o DuDoanDuyetHint.tsx). Moi trang thai CHUA duyet
// = 3 phan: ĐIỀU GÌ dang xay ra, LÝ DO cu the (ghi chu cua dong log da dua don vao trang thai nay - backend ghi cho MOI quyet dinh
// tu dong, xem ghiChuKhoiTao/applyDonHangLog), và TIẾP THEO ai xu ly / ket qua co the. Doi luong xu ly o backend (lib/tuDongDuyet.ts)
// thi sua cau "tiep theo" o day.

export type ToneLyDo = "ok" | "canhBao" | "chan" | "tim" | "info" | "trung";

export const TONE_LY_DO: Record<ToneLyDo, string> = {
  ok: "border-[var(--color-success)]/30 bg-[var(--color-success-soft)] text-[var(--color-success-strong)]",
  canhBao: "border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]",
  chan: "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]",
  tim: "border-[var(--color-purple)]/30 bg-[var(--color-purple-soft)] text-[var(--color-purple-strong)]",
  info: "border-[var(--color-info)]/30 bg-[var(--color-info-soft)] text-[var(--color-info)]",
  trung: "border-[var(--color-border)] bg-[var(--color-neutral-soft)] text-[var(--color-text-secondary)]",
};

export interface GiaiThich {
  tone: ToneLyDo;
  tieuDe: string;
  // Cau "tiep theo": ai xu ly, ket qua co the xay ra, nguoi dat can lam gi.
  tiepTheo: ReactNode[];
}

/** Giai thich trang thai `trangThai` cua 1 don (mua / cong no). `d` co the thieu truong (man ket qua tao don chi co trang thai). */
export function giaiThichTrangThai(
  trangThai: string | null | undefined,
  d: Partial<DonHangRow> = {},
  tenNguoi: (email: string) => string = (e) => e,
  tuDong = false,
): GiaiThich | null {
  switch (trangThai) {
    case "Cho Tram duyet":
      return {
        tone: "info",
        tieuDe: t("Chờ Trạm duyệt — đơn do Vệ tinh đặt cần Trạm phụ trách duyệt trước"),
        tiepTheo: [t("Trạm duyệt xong, hệ thống tự kiểm tra linh kiện đặc thù, trần công nợ và tồn kho để xử lý tiếp. Trạm từ chối thì đơn bị hủy kèm lý do.")],
      };
    case "Cho TBP xac nhan":
      return {
        tone: "canhBao",
        tieuDe: t("Chờ TBP DVBH xác nhận — linh kiện thuộc nhóm đặc thù"),
        tiepTheo: [
          ...(d.danh_gia_cong_no === "Khong du" ? [t("Đơn vượt trần công nợ: TBP duyệt phải nhập mã EO.")] : []),
          t("TBP duyệt xong, hệ thống tự kiểm tra tồn kho: đủ hàng thì tự duyệt và vào phiếu xuất, thiếu hàng thì chờ hàng / chờ chuyển tiền. TBP từ chối thì đơn bị hủy kèm lý do."),
        ],
      };
    case "Cho GS duyet":
      return {
        tone: "tim",
        tieuDe: t("Chờ Giám sát duyệt — đơn công nợ vượt trần công nợ của người nhận hàng"),
        tiepTheo: [
          ...(d.cong_no_nhan
            ? [
                t("Trần công nợ {a} · công nợ hiện tại {b}{c}", {
                  a: d.cong_no_nhan.tran != null ? fmtVND(d.cong_no_nhan.tran) : t("chưa đặt"),
                  b: fmtVND(d.cong_no_nhan.chot),
                  c: d.cong_no_nhan.don != null ? t(" · đơn này {a}", { a: fmtVND(d.cong_no_nhan.don) }) : "",
                }),
              ]
            : []),
          d.email_gs
            ? t("Giám sát khu vực {a} duyệt (nhập mã EO) hoặc từ chối. Duyệt xong hệ thống tự kiểm tra tồn kho.", { a: tenNguoi(d.email_gs) })
            : d.id
              ? <b key="gs">{t("Khu vực của người nhận hàng chưa có Giám sát — đơn sẽ nằm chờ tới khi Admin gán Giám sát cho khu vực.")}</b>
              : t("Giám sát khu vực của người nhận hàng duyệt (nhập mã EO) hoặc từ chối."),
        ],
      };
    case "Cho thanh toan":
      return {
        tone: "canhBao",
        tieuDe: t("Chờ thanh toán — kho công ty khu vực đang thiếu hàng cho đơn này"),
        tiepTheo: [
          d.ma_xuat_kho
            ? t("Đơn đã vào phiếu {a}: chuyển tiền cho phiếu trước.", { a: d.ma_xuat_kho })
            : t("Đơn vào phiếu xuất kho: chuyển tiền cho phiếu trước."),
          t("Kế toán xác nhận tiền xong, hệ thống kiểm tra lại kho: đủ hàng thì tự duyệt, vẫn thiếu thì chuyển chờ hàng (đơn giữ số tiền đã trả)."),
        ],
      };
    case "Cho hang":
      return {
        tone: "canhBao",
        tieuDe: t("Chờ hàng — kho công ty khu vực không đủ hàng, đơn chờ Kho xử lý"),
        tiepTheo: [
          d.kho_dang_xu_ly_thieu_lk
            ? t("Kho đã tiếp nhận{a}{b}.", {
                a: d.tlk_tiep_nhan_luc ? " " + fmtDateTime(d.tlk_tiep_nhan_luc) : "",
                b: d.tlk_ngay_du_kien ? t(" · dự kiến có hàng {a}", { a: fmtDate(d.tlk_ngay_du_kien) }) : "",
              })
            : t("Kho chưa tiếp nhận ticket thiếu hàng."),
          t("Hàng về: đơn tự duyệt và vào phiếu xuất kho. Kho từ chối: đơn bị hủy kèm lý do, tiền đã trả (nếu có) về quỹ dư."),
        ],
      };
    case "Cho TN duyet":
      return {
        tone: "info",
        tieuDe: t("Chờ Tác nghiệp duyệt"),
        tiepTheo: [t("Đơn tạo trước khi bật tự động duyệt hoặc được đẩy lại — Tác nghiệp duyệt, từ chối hoặc chuyển chờ hàng.")],
      };
    case "TN tu choi":
    case "Tu choi":
      return {
        tone: "chan",
        tieuDe: t("Đơn bị từ chối"),
        tiepTheo: [t("Tiền đã trả cho đơn (nếu có) đã về quỹ dư của người nhận hàng. Cần hàng thì tạo đơn mới theo lý do ở trên.")],
      };
    case "Da huy":
      return {
        tone: "trung",
        tieuDe: t("Đơn đã hủy"),
        tiepTheo: [t("Tiền đã trả cho đơn (nếu có) đã về quỹ dư của người nhận hàng.")],
      };
    case "TN da duyet":
      return tuDong
        ? { tone: "ok", tieuDe: t("Đơn được hệ thống tự động duyệt"), tiepTheo: [] }
        : null;
    default:
      return null;
  }
}

/** Dong log DA dua don vao trang thai hien tai (log moi nhat - backend ghi log cho moi lan doi trang thai). */
function logTrangThai(d: DonHangRow): DonHangLogRow | null {
  const l = d.logs?.[0];
  return l && l.trang_thai === d.trang_thai ? l : null;
}

/** Khung "Vì sao đơn ở trạng thái này" trong chi tiet don. Khong ap dung don tra hang (luong rieng, xem TraHangTab). */
export function LyDoTrangThaiDon({ d, tenNguoi }: { d: DonHangRow; tenNguoi: (email: string) => string }) {
  if (d.loai_don === "tra_hang") return null;
  const log = logTrangThai(d);
  const g = giaiThichTrangThai(d.trang_thai, d, tenNguoi, !!log?.tu_dong);
  if (!g) return null;
  // Quyet dinh cua HE THONG (khong phai nguoi): log tu_dong, log khoi tao (dong log duy nhat - nguoi_xu_ly = nguoi dat nhung trang
  // thai do he thong chon), hoac ghi chu "Tự động..." - tranh hien ten nguoi dat nhu the chinh ho quyet dinh.
  const heThong = !!log && (!!log.tu_dong || (d.logs?.length ?? 0) === 1 || (log.ghi_chu ?? "").startsWith("Tự động"));
  return (
    <div className={`rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed ${TONE_LY_DO[g.tone]}`} role={g.tone === "chan" ? "alert" : undefined}>
      <div className="font-semibold">{g.tieuDe}</div>
      {log?.ghi_chu && (
        <div className="mt-0.5 whitespace-pre-line break-words">
          <span className="font-semibold">{t("Lý do:")}</span> {log.ghi_chu}
          <span className="opacity-75">
            {" "}
            — {heThong ? t("Hệ thống") : tenNguoi(log.nguoi_xu_ly)} · {fmtDateTime(log.ngay_xu_ly)}
          </span>
        </div>
      )}
      {g.tiepTheo.length > 0 && (
        <ul className="mt-1 list-disc pl-4 space-y-0.5">
          {g.tiepTheo.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
    </div>
  );
}

/** 1 dong tom tat cho tooltip cot Trang thai o danh sach (chi trang thai CHUA duyet / bi tu choi / huy). */
export function tomTatLyDo(d: DonHangRow): string | null {
  if (d.loai_don === "tra_hang" || d.trang_thai === "TN da duyet") return null;
  const g = giaiThichTrangThai(d.trang_thai, d);
  if (!g) return null;
  return [g.tieuDe, d.ghi_chu_xu_ly_gan_nhat ? t("Lý do:") + " " + d.ghi_chu_xu_ly_gan_nhat : ""].filter(Boolean).join("\n");
}
