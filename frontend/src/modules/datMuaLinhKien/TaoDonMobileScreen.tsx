import { useEffect, useState } from "react";
import type { useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/ui/Badge";
import { Select } from "../../components/ui/Select";
import { fmtVND } from "../../types";
import { pushOverlayClose } from "../../lib/overlayStack";
import { YEU_CAU_HOA_DON_OPTIONS, CHINH_SACH_OPTIONS, YEU_CAU_HOA_DON_SHORT_LABELS } from "./constants";
import { deriveLoaiDon, reqLabelClass, pickLdeQuick, LOAI_DON_TONE, ktvOptionLabel, canNoRequired, formatLkLabel } from "./helpers";
import { LinhKienPicker, ThayTheGoiY, ThayTheGoiYTuSheet } from "./LinhKienPicker";
import { MaYeuCauSuCoCheck } from "./MaYeuCauSuCoCheck";
import { TraHangAnhPicker } from "./SharedUi";
import type { TaoDonForm } from "./useTaoDonForm";

// Man hinh "Tao don" rieng cho mobile (them 2026-08-21, phan hoi "giao diện tạo đơn mua hàng cho KTV
// đang gặp vấn đề trên giao diện mobile. màn hình bị đưa đưa và chỉ ếm diện tích nhỏ so với toàn màn
// hình"). Thiet ke duoc chot qua 1 vong tranh luan Designer/Critic rieng (khong luu thanh doc, xem
// TaoDonTab.tsx cho tom tat quyet dinh) - 7 diem chinh AP DUNG O DAY:
//   1) fixed inset-0 THAT SU full-man-hinh (khong dung Modal.tsx - Modal dung "flex items-center
//      justify-center" + max-h-[88vh] can giua man hinh, tren dien thoai khi ban phim mo day noi dung
//      len choi voi phan con lai cua modal van chiem cho phia duoi -> chinh la nguyen nhan "bi day
//      day, chi chiem dien tich nho" nguoi dung mo ta).
//   2) height: 100dvh (KHONG phai 100vh) - dvh (dynamic viewport height) tu dong tru phan ban phim
//      chiem tren cac trinh duyet mobile ho tro (Chrome/Safari moi), 100vh CO SAN se KHONG tru, khien
//      thanh CTA/footer bi ban phim che khuat ma khong tu cuon len duoc.
//   3) 1 THE DUY NHAT full man hinh tai 1 thoi diem (dong active) - danh sach cac dong con lai thu gon
//      thanh 1 dai "chip" cuon ngang o dau man hinh de nguoi dung TU DO nhay toi bat ky dong nao (khong
//      ep buoc theo thu tu tuyen tinh nhu wizard - phu hop nhu cau sua di sua lai nhieu dong cung luc).
//   4) Nut +/- so luong phong to len 44px (chuan toi thieu Apple HIG/Material cho vung cham) - CHI o
//      man hinh nay, KHONG doi kich thuoc ban gon cua TaoDonTab.tsx (desktop).
//   5) Nhan (label) luon nam TREN o nhap (khong nam ben canh) - chuan UX form mobile, tranh label bi
//      cat khi man hinh hep.
//   6) "Dùng giao diện cũ" dat o HEADER (goc xa CTA chinh o duoi) - tranh cham nham khi thao tac gan
//      day CTA "Tao don"; nho lua chon qua localStorage (xem TaoDonTab.tsx, key
//      "dmlk-taodon-prefer-old-ui"); neu dong dang active co du lieu (khac trang mac dinh) thi bam lan
//      DAU chi canh bao, phai bam LAN 2 moi thuc su chuyen (tranh mat du lieu dang nhap do).
//   7) Toan bo state/logic nghiep vu dung CHUNG voi ban desktop qua useTaoDonForm (khong co 2 nguon su
//      that rieng biet giua 2 man hinh).
export function TaoDonMobileScreen({
  form, canQuanLy, addToast, onClose, onUseOldUi,
}: {
  form: TaoDonForm;
  canQuanLy: boolean;
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  onClose: () => void;
  onUseOldUi: () => void;
}) {
  const {
    danhMuc, nguoiNhanHang, setNguoiNhanHang, drafts, infoExpandedIdx, setInfoExpandedIdx,
    activeIdx, setActiveIdx, otherLdeIdx, setOtherLdeIdx, addBlockedHint, setAddBlockedHint,
    justAdded, currentEmail, loaiDeXuatOptions, nguoiNhanHangData, create,
    updateDraft, isLineComplete, canSubmit, themDong, deleteDraft, tongGiaUocTinh, tongSoLuong,
  } = form;

  // FIX (phan hoi 2026-08-28: "ở giao diện tạo đơn ấn lùi vẫn báo thoát app") - man hinh nay la
  // fixed inset-0 full-man-hinh nhung KHONG dung Modal.tsx (xem giai thich dau file) nen truoc day
  // khong dang ky voi ngan xep overlay dung chung (overlayStack.ts) - nut Back tren mobile bo qua
  // man hinh nay va nhay thang toi hoi "Thoát ứng dụng?". Dang ky dung 1 effect giong Modal.tsx.
  useEffect(() => pushOverlayClose(onClose), [onClose]);

  const [confirmOldUi, setConfirmOldUi] = useState(false);
  // "Co du lieu dang nhap" = it nhat 1 dong khac trang mac dinh (rong) - dung de quyet dinh co can
  // canh bao truoc khi chuyen sang giao dien cu hay khong (diem #6).
  const hasDraftData = drafts.some((d) => d.ma_lk.trim() || d.loai_de_xuat.trim() || d.ghi_chu.trim());
  function handleOldUiClick() {
    if (hasDraftData && !confirmOldUi) {
      setConfirmOldUi(true);
      setTimeout(() => setConfirmOldUi(false), 3000);
      return;
    }
    onUseOldUi();
  }

  const d = drafts[activeIdx];
  const loaiDon = deriveLoaiDon(d.loai_de_xuat);
  const batBuoc = canNoRequired(d.loai_de_xuat);
  const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
  const giaUocTinh = lk?.gia_ban != null ? lk.gia_ban * d.so_luong_de_xuat : null;
  const tone = LOAI_DON_TONE[loaiDon];
  const quickValues = (["MUA HÀNG", "CÔNG NỢ", "TRỪ CÔNG NỢ"] as const)
    .map((kw) => pickLdeQuick(loaiDeXuatOptions, kw))
    .filter((v): v is string => !!v);
  const isOtherValue = d.loai_de_xuat.trim() !== "" && !quickValues.includes(d.loai_de_xuat);
  const showOtherSelect = otherLdeIdx.has(activeIdx) || isOtherValue;
  const infoHasData = !!(
    d.yeu_cau_hoa_don.trim() !== YEU_CAU_HOA_DON_OPTIONS[0] ||
    d.ma_yeu_cau_su_co.trim() ||
    d.chinh_sach.trim() ||
    d.tt_mail_duyet.trim() ||
    d.tt_khach_hang.trim()
  );
  const showInfoBoSung = batBuoc || infoHasData || infoExpandedIdx.has(activeIdx);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--surface)] anim-in" style={{ height: "100dvh" }}>
      {/* Header - tieu de + "Dung giao dien cu" + dong (diem #6: dat xa CTA chinh o duoi) */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--line)]">
        <h3 className="font-display font-bold text-[var(--ink-900)] text-sm">🧾 Tạo đơn đặt linh kiện</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleOldUiClick}
            className={`focus-ring text-[11px] font-semibold underline underline-offset-2 px-1.5 py-1 rounded ${confirmOldUi ? "text-[var(--coral-600)]" : "text-[var(--ink-500)]"}`}
          >
            {confirmOldUi ? "Mất dữ liệu đang nhập — bấm lần nữa?" : "Dùng giao diện cũ"}
          </button>
          <button onClick={onClose} className="focus-ring w-9 h-9 shrink-0 rounded-lg hover:bg-slate-100 text-[var(--ink-400)] text-lg flex items-center justify-center">
            ✕
          </button>
        </div>
      </div>

      {canQuanLy && (
        <div className="shrink-0 px-3 py-2 border-b border-[var(--line)] bg-[var(--surface-100)]">
          <label className="block text-[10px] font-bold uppercase tracking-wide text-[var(--ocean-700)] mb-1">👤 Người nhận hàng</label>
          <Select
            value={nguoiNhanHang}
            onChange={setNguoiNhanHang}
            options={[
              { value: "", label: "-- Chính tôi --" },
              ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: ktvOptionLabel(r, nguoiNhanHangData?.rows ?? []) })),
            ]}
          />
        </div>
      )}

      {/* Dai chip cac dong - cuon ngang, nhay tu do (diem #3) */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 overflow-x-auto border-b border-[var(--line)] bg-[var(--surface-100)]">
        {drafts.map((line, idx) => {
          const complete = isLineComplete(line);
          const active = idx === activeIdx;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIdx(idx)}
              className={`focus-ring shrink-0 flex items-center gap-1 rounded-full px-2.5 h-8 text-xs font-semibold border transition-colors ${
                active ? "bg-[var(--ocean-500)] text-white border-[var(--ocean-500)]" : "bg-white text-[var(--ink-600)] border-[var(--line)]"
              }`}
            >
              {line.uu_tien && <span>⭐</span>}
              <span>{idx + 1}</span>
              <span>{complete ? "✓" : "⚠"}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={themDong}
          className="focus-ring shrink-0 flex items-center justify-center rounded-full h-8 px-3 text-xs font-semibold bg-white border border-dashed border-[var(--line)] text-[var(--ink-500)]"
        >
          + Dòng
        </button>
        {drafts.length > 1 && (
          <button
            type="button"
            onClick={() => deleteDraft(activeIdx)}
            className="focus-ring shrink-0 flex items-center justify-center rounded-full h-8 w-8 text-xs font-semibold bg-white border border-[var(--coral-100)] text-[var(--coral-500)]"
            title="Xóa dòng đang xem"
            aria-label="Xóa dòng đang xem"
          >
            ✕
          </button>
        )}
      </div>
      {addBlockedHint && !isLineComplete(drafts[activeIdx]) && (
        <div className="shrink-0 px-3 py-1.5 text-[11px] text-[var(--coral-600)] bg-[var(--coral-100)]/40 font-medium">
          ⚠ Điền xong Mã linh kiện/Số lượng dòng {activeIdx + 1} trước khi thêm dòng mới
        </div>
      )}

      {/* Noi dung the dang active - cuon doc, chiem het khong gian con lai (diem #3). Nen ngoai doi
          sang --bg (nhat, giong nen trang) de the .m-card (vien + bo goc, khong to mau) o duoi noi
          bat len - doi chieu pattern .m-card cua concept 1 cho "card dong dang active". */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3 bg-[var(--bg)]">
      <div className="bg-white border border-[var(--line)] rounded-xl p-3.5 flex flex-col gap-3.5">
        <div className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 ${d.uu_tien ? "bg-[var(--orange-100)]" : "bg-[var(--surface-100)]"}`}>
          <Badge tone={tone.tone}>{tone.label}</Badge>
          <label
            className={`flex items-center gap-1.5 text-xs font-semibold rounded-full pl-1.5 pr-2.5 py-1.5 cursor-pointer select-none ${
              d.uu_tien ? "bg-[var(--orange-600)] text-white" : "bg-white border border-[var(--line)] text-[var(--ink-500)]"
            }`}
          >
            <input type="checkbox" checked={d.uu_tien} onChange={(e) => updateDraft(activeIdx, { uu_tien: e.target.checked })} className="w-4 h-4 accent-[var(--orange-600)]" />
            ⭐ Ưu tiên
          </label>
        </div>

        <div>
          <label className={reqLabelClass(!d.ma_lk.trim())}>Mã linh kiện *</label>
          <LinhKienPicker value={d.ma_lk} onChange={(v) => updateDraft(activeIdx, { ma_lk: v })} options={danhMuc} autoFocus={justAdded} />
        </div>

        <div>
          <label className={reqLabelClass(!d.loai_de_xuat.trim())}>Loại đề xuất *</label>
          <div className="flex gap-1.5 flex-wrap">
            {(["MUA HÀNG", "CÔNG NỢ", "TRỪ CÔNG NỢ"] as const).map((kw) => {
              const matched = pickLdeQuick(loaiDeXuatOptions, kw);
              if (!matched) return null;
              return (
                <Btn
                  key={kw}
                  size="md"
                  variant={d.loai_de_xuat === matched ? "primary" : "ghost"}
                  onClick={() => {
                    updateDraft(activeIdx, { loai_de_xuat: matched });
                    setOtherLdeIdx((s) => {
                      if (!s.has(activeIdx)) return s;
                      const next = new Set(s);
                      next.delete(activeIdx);
                      return next;
                    });
                  }}
                >
                  {kw}
                </Btn>
              );
            })}
            <Btn size="md" variant={showOtherSelect ? "primary" : "ghost"} onClick={() => setOtherLdeIdx((s) => new Set(s).add(activeIdx))}>
              khác…
            </Btn>
          </div>
          {showOtherSelect && (
            <Select
              value={d.loai_de_xuat}
              onChange={(v) => updateDraft(activeIdx, { loai_de_xuat: v })}
              options={[{ value: "", label: "-- Chọn --" }, ...loaiDeXuatOptions.map((o) => ({ value: o, label: o }))]}
              className="mt-1.5 w-full"
            />
          )}
        </div>

        {/* So luong - nut +/- 44px (diem #4), rieng cho man hinh nay. */}
        <div>
          <label className={reqLabelClass(!(d.so_luong_de_xuat > 0))}>Số lượng *</label>
          <div className="flex items-center gap-3">
            <div className="flex items-center border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface-100)]">
              <button
                type="button"
                onClick={() => updateDraft(activeIdx, { so_luong_de_xuat: Math.max(1, d.so_luong_de_xuat - 1) })}
                className="focus-ring w-11 h-11 flex items-center justify-center text-[var(--ink-600)] font-bold text-lg bg-[var(--surface-100)] active:bg-[var(--surface-200)]"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                value={d.so_luong_de_xuat}
                onChange={(e) => updateDraft(activeIdx, { so_luong_de_xuat: Number(e.target.value) })}
                className="focus-ring w-14 text-center text-base bg-[var(--surface-100)] border-x border-[var(--line)] h-11"
              />
              <button
                type="button"
                onClick={() => updateDraft(activeIdx, { so_luong_de_xuat: d.so_luong_de_xuat + 1 })}
                className="focus-ring w-11 h-11 flex items-center justify-center text-[var(--ink-600)] font-bold text-lg bg-[var(--surface-100)] active:bg-[var(--surface-200)]"
              >
                +
              </button>
            </div>
            <div className="text-xs text-[var(--ink-500)]">
              {giaUocTinh != null ? <><span className="text-[10px]">Ước tính: </span><b className="text-[var(--green-700)]">{fmtVND(giaUocTinh)}</b></> : <span className="text-[var(--ink-400)]">Giá: —</span>}
            </div>
          </div>
        </div>

        {/* Anh linh kien can tra (them 2026-08-24, muc 1) - xem giai thich day du o TaoDonTab.tsx. */}
        {loaiDon === "tra_hang" && (
          <div>
            <label className={reqLabelClass(d.anh.length === 0)}>Ảnh linh kiện cần trả *</label>
            <TraHangAnhPicker photos={d.anh} onChange={(anh) => updateDraft(activeIdx, { anh })} addToast={addToast} />
          </div>
        )}

        {d.ma_lk.trim() && <ThayTheGoiY maLk={d.ma_lk.trim()} canQuanLy={canQuanLy} addToast={addToast} />}
        {d.ma_lk.trim() && <ThayTheGoiYTuSheet maLk={d.ma_lk.trim()} />}

        {showInfoBoSung ? (
          <>
            <div className="flex items-center gap-2 -my-1">
              <div className="h-px flex-1 bg-[var(--line)]" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-400)]">Thông tin bổ sung (tuỳ chọn)</span>
              <div className="h-px flex-1 bg-[var(--line)]" />
            </div>

            <div>
              <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">Yêu cầu hóa đơn</label>
              <div className="flex gap-1.5 flex-wrap">
                {YEU_CAU_HOA_DON_OPTIONS.map((o) => (
                  <Btn key={o} type="button" size="md" variant={d.yeu_cau_hoa_don === o ? "primary" : "ghost"} onClick={() => updateDraft(activeIdx, { yeu_cau_hoa_don: o })}>
                    {YEU_CAU_HOA_DON_SHORT_LABELS[o] ?? o}
                  </Btn>
                ))}
              </div>
            </div>
            <div>
              <label className={reqLabelClass(batBuoc && !d.ma_yeu_cau_su_co.trim())}>Mã YCSC liên quan{batBuoc ? " *" : ""}</label>
              <input
                value={d.ma_yeu_cau_su_co}
                onChange={(e) => updateDraft(activeIdx, { ma_yeu_cau_su_co: e.target.value })}
                maxLength={20}
                className={`focus-ring w-full bg-[var(--surface-100)] border rounded-lg px-2.5 h-11 text-sm ${batBuoc && !d.ma_yeu_cau_su_co.trim() ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
              />
            </div>
            <MaYeuCauSuCoCheck value={d.ma_yeu_cau_su_co} nguoiNhanHang={nguoiNhanHang || currentEmail} />
            <div>
              <label className={reqLabelClass(batBuoc && !d.chinh_sach.trim())}>Chính sách{batBuoc ? " *" : ""}</label>
              <Select
                value={d.chinh_sach}
                onChange={(v) => updateDraft(activeIdx, { chinh_sach: v })}
                options={[{ value: "", label: "-- Không chọn --" }, ...CHINH_SACH_OPTIONS.map((o) => ({ value: o, label: o }))]}
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">TT khách hàng</label>
              <input
                value={d.tt_khach_hang}
                onChange={(e) => updateDraft(activeIdx, { tt_khach_hang: e.target.value })}
                placeholder="Tên/SĐT/địa chỉ khách hàng liên quan"
                className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 h-11 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">TT+Mail duyệt</label>
              <input
                value={d.tt_mail_duyet}
                onChange={(e) => updateDraft(activeIdx, { tt_mail_duyet: e.target.value })}
                placeholder="Mã/nội dung email phê duyệt đặc biệt (nếu có)"
                className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 h-11 text-sm"
              />
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setInfoExpandedIdx((s) => new Set(s).add(activeIdx))}
            className="focus-ring self-start text-xs font-semibold text-[var(--ink-500)]"
          >
            + Thông tin bổ sung (Hóa đơn/Chính sách/TT khách hàng…) ▾
          </button>
        )}

        <div>
          <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">Ghi chú (tuỳ chọn)</label>
          <input
            value={d.ghi_chu}
            onChange={(e) => updateDraft(activeIdx, { ghi_chu: e.target.value })}
            className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 h-11 text-sm"
          />
        </div>
      </div>
        {/* Khoang dem duoi cung de dong cuoi khong bi thanh CTA dinh (sticky) che khuat. */}
        <div className="h-1" />
      </div>

      {/* Thanh CTA dinh duoi (diem #2: nam ngoai vung dvh bi ban phim che, luon hien) */}
      <div
        className="shrink-0 flex flex-col gap-2 border-t border-[var(--line)] bg-[var(--ocean-100)]/35 px-3.5 pt-2.5"
        style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--ink-500)]">{drafts.length} dòng · {tongSoLuong} cái</span>
          {tongGiaUocTinh > 0 && <span className="font-bold text-[var(--green-700)]">{fmtVND(tongGiaUocTinh)}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="ghost" size="md" className="h-11 shrink-0" onClick={themDong}>
            + Thêm dòng
          </Btn>
          <Btn size="md" className="h-11 flex-1 justify-center text-base" onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}>
            {create.isPending ? "Đang tạo..." : drafts.length > 1 ? `Tạo ${drafts.length} đơn` : "Tạo đơn"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
