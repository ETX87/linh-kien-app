import { useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Money } from "../../components/ui/Money";
import { Badge, type Tone } from "../../components/x/Badge";
import { fmtDateTime, fmtVND } from "../../types";
import { t } from "../../i18n";
import { docDsAnh, docTienDocMap, useDocTienAnh } from "./DocTienAnh";
import { docAnhBangChung } from "./BangChungChuyenTien";
import { XemAnhNhanh, anhXemCuaPxk, type PxkAnhXem } from "./XemAnhNhanh";
import { CHUYEN_TIEN_OPTIONS, CHUYEN_TIEN_TONE } from "./constants";
import { DanhSachDoiSoat, useDoiSoatAnh } from "../quyChuyenTien/NopTienDoiSoat";

// DOI SOAT ANH BANG CHUNG CHUYEN TIEN CUA 1 PHIEU XUAT (2026-11-13, v1.487 - "click hình ảnh trong phiếu, mở giao diện kèm chức năng đối chiếu
// ảnh để hỗ trợ kế toán rà soát"). Cung bo cuc / cung bo so (useDoiSoatAnh + DanhSachDoiSoat) voi popup xu ly nop tien vao quy: anh cua phieu
// ben trai (so OCR tung anh, danh dau "trung"), ben phai cac khoan da vao quy cua nguoi nhan hang 180 ngay + phieu khac dang cho Ke toan xac
// nhan tien - GET /quy-ktv/pxk/:id/doi-soat (bo moi khoan cua chinh phieu nay). Chi canh bao, khong chan.

export function DoiSoatAnhPxkModal({ pxk, ten, batDau, onClose }: {
  pxk: PxkAnhXem;
  ten: (email: string | null | undefined) => string;
  batDau?: number;
  onClose: () => void;
}) {
  const urls = docAnhBangChung(pxk);
  const doc = useDocTienAnh(urls, docTienDocMap(pxk.bang_chung_tien_doc));
  const ds = useDoiSoatAnh(`/quy-ktv/pxk/${encodeURIComponent(pxk.id)}/doi-soat`, doc.items, 0);
  const [xemAnh, setXemAnh] = useState<number | null>(null);
  const [tab, setTab] = useState<"nghi" | "tat-ca" | null>(null);
  const coNghi = ds.soDo + ds.soCam > 0;
  const tabHien = tab ?? (coNghi ? "nghi" : "tat-ca");

  const tt = pxk.trang_thai_chuyen_tien ?? "";
  const nhanTtGoc = CHUYEN_TIEN_OPTIONS.find((o) => o.value === tt)?.label;
  const daDuyet = tt === "TN da duyet";
  const tong = pxk.so_tien_can_chuyen ?? 0;
  const daTra = pxk.da_thanh_toan ?? 0;
  // Anh tinh cho lan chuyen nay: da duyet = moi anh; chua duyet = bo anh da ghi nhan o lan Ke toan duyet truoc (cung quy tac anhXemCuaPxk).
  const daGhiNhan = new Set(docDsAnh(pxk.anh_da_ghi_nhan));
  const anhTinh = doc.items.filter((d) => daDuyet || !daGhiNhan.has(d.url));
  const xongTinh = anhTinh.every((d) => d.xong);
  const duTinh = anhTinh.every((d) => d.soTien != null);
  const tongTinh = anhTinh.reduce((s, d) => s + (d.soTien ?? 0), 0);
  const soDoi = daDuyet ? pxk.tien_thuc_chuyen ?? null : tong - daTra > 0 ? tong - daTra : null;
  const nhanDoi = daDuyet ? t("Kế toán xác nhận") : t("Còn phải chuyển");
  const khop = soDoi != null && xongTinh && duTinh && tongTinh === soDoi;

  const the = "rounded-xl border px-3 py-2";
  const theNhan = "text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]";

  return (
    <Modal
      open
      onClose={onClose}
      title={`${pxk.id} · ${t("Đối soát ảnh chuyển tiền")}`}
      width="max-w-6xl"
      height="max-h-[94vh]"
      headerExtra={<Badge tone={(CHUYEN_TIEN_TONE[tt] ?? "neutral") as Tone}>{nhanTtGoc ? t(nhanTtGoc) : tt || "—"}</Badge>}
    >
      <div className="space-y-3 text-[14px]">
        {ds.soDo > 0 ? (
          <div className="rounded-xl border-2 border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-3 py-2 text-[14px] font-semibold text-[var(--color-danger-strong)]">
            ⛔ {t("Nghi trùng ảnh chuyển khoản với {a} khoản khác của cùng người — xem tab “Nghi trùng”.", { a: ds.soDo })}
          </div>
        ) : ds.soCam > 0 ? (
          <div className="rounded-xl border-2 border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-[14px] font-semibold text-[var(--color-warning-strong)]">
            ⚠ {t("Có {a} khoản cùng số tiền / ảnh gần giống trong 180 ngày — đối chiếu sao kê.", { a: ds.soCam })}
          </div>
        ) : !ds.isLoading && !ds.dangSoHinh && doc.xongHet && urls.length > 0 ? (
          <div className="rounded-xl border border-[var(--color-success)]/40 bg-[var(--color-success-soft)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-success-strong)]">
            ✓ {t("Không thấy khoản trùng số tiền hay giống ảnh trong {a} khoản 180 ngày của quỹ.", { a: ds.tong })}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className={`${the} border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)]`}>
            <div className={theNhan}>{t("Tổng tiền phiếu")}</div>
            <div className="text-[22px] font-extrabold tabular text-[var(--color-primary-dark)]"><Money>{fmtVND(tong)}</Money></div>
            <div className="text-[12px] text-[var(--color-text-secondary)]">{t("Đã trả cho phiếu")} <Money>{fmtVND(daTra)}</Money></div>
          </div>
          <div className={`${the} ${!xongTinh || soDoi == null ? "border-[var(--color-border)]" : khop ? "border-[var(--color-success)]/40 bg-[var(--color-success-soft)]" : "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)]"}`}>
            <div className={theNhan}>{t("Đọc từ ảnh")}</div>
            <div className={`text-[22px] font-extrabold tabular ${!xongTinh || soDoi == null ? "text-[var(--color-text)]" : khop ? "text-[var(--color-success-strong)]" : "text-[var(--color-danger-strong)]"}`}>
              {!xongTinh ? t("Đang đọc…") : tongTinh > 0 ? <Money>{fmtVND(tongTinh)}</Money> : "—"}
            </div>
            {xongTinh && soDoi != null && (
              <div className={`text-[12px] font-semibold ${khop ? "text-[var(--color-success-strong)]" : "text-[var(--color-danger-strong)]"}`}>
                {khop ? `✓ ${t("Khớp")} ${nhanDoi.toLowerCase()}` : !duTinh ? t("Có ảnh không đọc được — xem bằng mắt") : <>{t("Lệch")} <Money>{fmtVND(tongTinh - soDoi)}</Money></>}
              </div>
            )}
            {anhTinh.length < doc.items.length && (
              <div className="text-[11.5px] text-[var(--color-text-secondary)]">{t("Chỉ cộng ảnh của lần chuyển này ({a}/{b} ảnh)", { a: anhTinh.length, b: doc.items.length })}</div>
            )}
          </div>
          <div className={`${the} border-[var(--color-border)]`}>
            <div className={theNhan}>{nhanDoi}</div>
            <div className="text-[18px] font-bold tabular">{soDoi != null ? <Money>{fmtVND(soDoi)}</Money> : "—"}</div>
          </div>
          <div className={`${the} border-[var(--color-border)]`}>
            <div className={theNhan}>{t("KTV báo chuyển lúc")}</div>
            <div className="text-[16px] font-bold tabular">{pxk.ngay_ktv_chuyen ? fmtDateTime(pxk.ngay_ktv_chuyen) : "—"}</div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="space-y-3">
            <div className={`${the} space-y-1 border-[var(--color-border)]`}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={theNhan}>{t("Người chuyển")}</span>
                <span className="text-[15px] font-bold text-[var(--color-primary-dark)]">{ten(pxk.nguoi_nhan_hang) || "—"}</span>
              </div>
              {pxk.ma_xuat_kho && pxk.ma_xuat_kho !== pxk.id && (
                <div className="text-[13px]"><span className="text-[var(--color-text-secondary)]">{t("Mã HĐ")}</span> <b>{pxk.ma_xuat_kho}</b></div>
              )}
              {pxk.bang_chung_chuyen_tien_ghi_chu && (
                <div className="rounded-lg bg-[var(--color-info-soft)] px-2.5 py-1.5 text-[13px]">
                  <span className="font-semibold">{t("KTV ghi chú")}:</span> <span className="whitespace-pre-line">{pxk.bang_chung_chuyen_tien_ghi_chu}</span>
                </div>
              )}
              {pxk.ly_do_tu_choi_chuyen_tien && (
                <div className="rounded-lg bg-[var(--color-danger-soft)] px-2.5 py-1.5 text-[13px] text-[var(--color-danger-strong)]">
                  <span className="font-semibold">{t("Bị trả lại")}:</span> {pxk.ly_do_tu_choi_chuyen_tien}
                </div>
              )}
            </div>

            <div>
              <div className={`${theNhan} mb-1.5`}>{t("Ảnh chuyển khoản ({a})", { a: urls.length })}</div>
              <div className="flex flex-wrap gap-2.5">
                {doc.items.map((d, i) => {
                  const nghi = ds.anhCuaToiNghi.get(d.url);
                  const cu = !daDuyet && daGhiNhan.has(d.url);
                  return (
                    <button
                      key={d.url}
                      type="button"
                      onClick={() => setXemAnh(i)}
                      className={`focus-ring relative overflow-hidden rounded-xl border-2 bg-[var(--color-surface)] text-left ${nghi === "do" ? "border-[var(--color-danger)]" : nghi === "cam" ? "border-[var(--color-warning)]" : batDau === i ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}
                    >
                      <img src={d.url} alt={t("Ảnh {a}", { a: i + 1 })} className={`h-44 w-32 object-cover ${cu ? "opacity-60" : ""}`} />
                      <span className="absolute left-1 top-1 rounded-md bg-black/60 px-1.5 text-[11px] font-bold text-white">{i + 1}</span>
                      {nghi && (
                        <span className={`absolute right-1 top-1 rounded-md px-1.5 text-[11px] font-bold text-white ${nghi === "do" ? "bg-[var(--color-danger)]" : "bg-[var(--color-warning-strong)]"}`}>⚠ {t("trùng")}</span>
                      )}
                      {cu && <span className="absolute bottom-8 left-1 rounded-md bg-black/60 px-1.5 text-[10px] font-semibold text-white">{t("Lần trước")}</span>}
                      <div className="px-1.5 py-1 text-center text-[14px] font-extrabold tabular">
                        {!d.xong ? <span className="text-[12px] font-normal text-[var(--color-text-secondary)]">{t("Đang đọc…")}</span> : d.soTien != null ? <Money>{fmtVND(d.soTien)}</Money> : <span className="text-[12px] font-normal text-[var(--color-text-faint)]">{t("Không đọc được")}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-1.5 text-[12px] text-[var(--color-text-secondary)]">{t("Bấm ảnh để xem lớn, chuyển ảnh bằng ← →.")}</div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] p-2.5 lg:max-h-[68vh] lg:overflow-y-auto">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => setTab("nghi")} className={`focus-ring filter-tab ${tabHien === "nghi" ? "active" : ""}`}>
                {t("Nghi trùng")}
                {coNghi && <span className={`ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${ds.soDo ? "bg-[var(--color-danger)]" : "bg-[var(--color-warning-strong)]"}`}>{ds.soDo + ds.soCam}</span>}
              </button>
              <button type="button" onClick={() => setTab("tat-ca")} className={`focus-ring filter-tab ${tabHien === "tat-ca" ? "active" : ""}`}>
                {t("Đã xác nhận của quỹ")} <span className="tabular opacity-70">({ds.tong})</span>
              </button>
              {ds.dangSoHinh && <span className="ml-auto text-[12px] text-[var(--color-text-secondary)]">{t("Đang so sánh ảnh…")}</span>}
            </div>
            <div className="mb-2 text-[12px] text-[var(--color-text-secondary)]">
              {t("Các khoản tiền của {a} trong 180 ngày (chuyển tiền phiếu khác, nộp tiền, tiền ngoài) và phiếu khác đang chờ Kế toán xác nhận tiền. Khoản cùng số tiền với 1 ảnh hoặc ảnh giống (màu + bố cục) xếp lên đầu.", { a: ten(pxk.nguoi_nhan_hang) || "—" })}
            </div>
            <DanhSachDoiSoat ds={ds} ten={ten} chiNghi={tabHien === "nghi"} />
          </div>
        </div>
      </div>
      {xemAnh != null && urls.length > 0 && <XemAnhNhanh items={anhXemCuaPxk(pxk, ten)} batDau={xemAnh} onClose={() => setXemAnh(null)} />}
    </Modal>
  );
}
