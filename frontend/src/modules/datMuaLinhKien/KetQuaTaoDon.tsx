import { Modal } from "../../components/ui/Modal";
import { Btn } from "../../components/ui/Btn";
import { Money } from "../../components/ui/Money";
import { fmtVND } from "../../types";
import type { KetQuaTaoDon, KetQuaTaoDonPhieu } from "./types";
import { t } from "../../i18n";
import { giaiThichTrangThai, TONE_LY_DO } from "./LyDoTrangThai";
import { trangThaiLabel } from "./helpers";
import { DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL } from "./constants";
import { MaDonLink, MaPhieuLink } from "./MaLienKet";
import { useTenNguoiLog } from "./SharedUi";

// "ĐƠN ĐẶT HÀNG ĐÃ ĐƯỢC GHI NHẬN" - hop ket qua LUON hien sau khi tao don thanh cong (chot 2026-11-10, "tạo thành công xx đơn (liệt kê danh sách),
// tạo thành yy phiếu đặt (liệt kê) ... phiếu PMH-xxx (3 đơn chờ hàng) đang chờ chuyển tiền => click vào để chuyển tiền ngay.. PMH-yyy (3 đơn
// (1.000.000) đã tự thanh toán từ quỹ dư) - cuối cùng ghi quỹ dư còn 0 đồng ... click vào để mở phiếu hoặc mở đơn, hoặc ấn xác nhận để tắt").
// Truoc day (2026-10-15) chi mo khi co dong chua duyet. Du lieu: POST /dat-mua-lk/phieu-dat tra `dong[].pxk`, `phieu`, `quy_du` (doc sau khi tu gom).

const CHO_HANG = new Set(["Cho thanh toan", "Cho hang"]);

function moTaPhieu(p: KetQuaTaoDonPhieu): { text: string; tone: "ok" | "cho" | "trung"; canChuyen: boolean } {
  const tong = p.so_tien_can_chuyen ?? 0;
  const conPhai = Math.max(0, tong - p.da_thanh_toan);
  const quy = p.tra_tu_quy > 0 ? t("đã tự trừ {a} từ quỹ dư", { a: fmtVND(p.tra_tu_quy) }) : "";
  if (p.doi_tac_ma) return { text: t("ghi nợ đối tác {a} — không cần chuyển tiền", { a: p.doi_tac_ma }), tone: "ok", canChuyen: false };
  if (tong <= 0) return { text: t("không cần chuyển tiền"), tone: "ok", canChuyen: false };
  if (p.trang_thai_chuyen_tien === "TN da duyet")
    return { text: [t("đã thanh toán đủ {a}", { a: fmtVND(tong) }), quy].filter(Boolean).join(" — "), tone: "ok", canChuyen: false };
  if (p.trang_thai_chuyen_tien === "KTV da chuyen")
    return { text: [conPhai <= 0 ? t("đã đủ tiền") : "", quy, t("chờ Kế toán xác nhận")].filter(Boolean).join(" — "), tone: "cho", canChuyen: false };
  return {
    text: [t("đang chờ chuyển tiền: còn phải chuyển {a}", { a: fmtVND(conPhai) }), quy].filter(Boolean).join(" — "),
    tone: "cho",
    canChuyen: true,
  };
}

const TONE_PHIEU = {
  ok: "border-[var(--color-success)]/40 bg-[var(--color-success-soft)]",
  cho: "border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)]",
  trung: "border-[var(--color-border)]",
};

export function KetQuaTaoDonModal({ ketQua, onClose }: { ketQua: KetQuaTaoDon | null; onClose: () => void }) {
  const tenNguoi = useTenNguoiLog();
  const dong = ketQua?.dong ?? [];
  const phieu = ketQua?.phieu ?? [];
  const soTuDuyet = dong.filter((d) => d.trang_thai === "TN da duyet").length;
  const chuaVaoPhieu = dong.filter((d) => !d.pxk);
  return (
    <Modal open={!!ketQua} onClose={onClose} title={t("✅ Đơn đặt hàng của bạn đã được ghi nhận")} width="max-w-2xl">
      <div className="space-y-4 text-sm">
        <div className="rounded-xl border border-[var(--color-success)]/40 bg-[var(--color-success-soft)] px-3 py-2 font-semibold text-[var(--color-text)]">
          {t("Tạo thành công {a} đơn", { a: dong.length })}
          {phieu.length > 0 && <> · {t("{b} phiếu xuất kho", { b: phieu.length })}</>}
          {" · "}{t("{c} đơn tự động duyệt", { c: soTuDuyet })}
          <span className="ml-1 font-normal text-[var(--color-text-secondary)]">({t("phiếu đặt {id}", { id: ketQua?.id ?? "" })})</span>
        </div>

        {phieu.length > 0 && (
          <section>
            <div className="mb-1.5 font-semibold text-[var(--color-text)]">{t("Phiếu xuất kho")}</div>
            <ul className="space-y-2">
              {phieu.map((p) => {
                const m = moTaPhieu(p);
                const donMoi = dong.filter((d) => d.pxk === p.id);
                const soChoHang = donMoi.filter((d) => CHO_HANG.has(d.trang_thai)).length;
                return (
                  <li key={p.id} className={`rounded-lg border px-3 py-2 text-[13px] ${TONE_PHIEU[m.tone]}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <MaPhieuLink id={p.id} />{" "}
                        <span className="text-[var(--color-text-secondary)]">
                          ({t("{n} đơn mới", { n: donMoi.length })}
                          {soChoHang > 0 && <>, {t("{n} đơn chờ hàng", { n: soChoHang })}</>}
                          {p.so_don > donMoi.length && <>, {t("tổng {n} đơn", { n: p.so_don })}</>})
                        </span>
                        {!!p.cho_hang && <span className="ml-1.5 font-semibold text-[var(--color-warning-strong)]">{t("· Phiếu chờ hàng")}</span>}
                      </div>
                      {m.canChuyen && (
                        <MaPhieuLink
                          id={p.id}
                          nhan={t("Chuyển tiền ngay →")}
                          className="focus-ring rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-2.5 py-1 text-[12px] font-semibold text-white hover:opacity-90"
                        />
                      )}
                    </div>
                    <div className="mt-0.5 text-[var(--color-text-body)]">
                      {t("Tổng phiếu")} <Money>{fmtVND(p.so_tien_can_chuyen ?? 0)}</Money> — {m.text}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section>
          <div className="mb-1.5 font-semibold text-[var(--color-text)]">{t("Đơn hàng đã tạo")}</div>
          <ul className="space-y-1.5">
            {dong.map((d) => {
              const g = giaiThichTrangThai(d.trang_thai, {}, undefined, d.trang_thai === "TN da duyet");
              return (
                <li key={d.id} className={`rounded-lg border px-2.5 py-1.5 text-[12px] leading-relaxed ${TONE_LY_DO[g?.tone ?? "trung"]}`}>
                  <div className="font-semibold">
                    <MaDonLink id={d.id} /> · {d.ten.replace(/"/g, "")} → {trangThaiLabel(DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, d.trang_thai)}
                    {d.pxk ? <> · <MaPhieuLink id={d.pxk} /></> : <span className="font-normal text-[var(--color-text-secondary)]"> · {t("chưa vào phiếu")}</span>}
                  </div>
                  {d.trang_thai !== "TN da duyet" && d.ly_do && <div><span className="font-semibold">{t("Lý do:")}</span> {d.ly_do}</div>}
                  {d.trang_thai !== "TN da duyet" && g && g.tiepTheo.length > 0 && (
                    <ul className="mt-0.5 list-disc pl-4">
                      {g.tiepTheo.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {chuaVaoPhieu.length > 0 && (
            <div className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
              {t("{n} đơn chưa vào phiếu xuất (chờ duyệt / chờ hàng không cần chuyển tiền) — hệ thống tự gom vào phiếu khi đơn được duyệt.", { n: chuaVaoPhieu.length })}
            </div>
          )}
        </section>

        {ketQua?.quy_du && (
          <div className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-[13px]">
            {t("Quỹ dư của {a} còn", { a: tenNguoi(ketQua.nguoi_nhan_hang) })} <b><Money>{fmtVND(ketQua.quy_du.ktv)}</Money></b>
            {ketQua.quy_du.kh != null && (
              <> · {t("Quỹ xuất hóa đơn do KH chuyển còn")} <b><Money>{fmtVND(ketQua.quy_du.kh)}</Money></b></>
            )}
          </div>
        )}
        <div className="flex justify-end">
          <Btn onClick={onClose}>{t("Xác nhận")}</Btn>
        </div>
      </div>
    </Modal>
  );
}
