import { useEffect, useState } from "react";
import type { useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Select } from "../../components/ui/Select";
import { fmtVND } from "../../types";
import { pushOverlayClose } from "../../lib/overlayStack";
import { YEU_CAU_HOA_DON_OPTIONS, CHINH_SACH_OPTIONS, YEU_CAU_HOA_DON_SHORT_LABELS } from "./constants";
import { deriveLoaiDon, reqLabelClass, pickLdeQuick, ktvOptionLabel, canNoRequired, maYcscRequired, coMaIdLienQuan } from "./helpers";
import { LinhKienPicker, ThayTheGoiY } from "./LinhKienPicker";
import { MaYeuCauSuCoCheck } from "./MaYeuCauSuCoCheck";
import { MaLadaCheck } from "./MaLadaCheck";
import { DuDoanDuyetHint, XacNhanTaoDonModal, KetQuaTaoDonModal } from "./DuDoanDuyetHint";
import { TraHangAnhPicker, NhapKhoiPhucBanner } from "./SharedUi";
import type { TaoDonForm } from "./useTaoDonForm";
import { Money } from "../../components/ui/Money";
import { TongNgayKtvInfo } from "./TongNgayKtv";
import { t } from "../../i18n";
import { KhachLeSdt } from "./KhachLeSdt";

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
    updateDraft, isLineComplete, canSubmit, themDong, deleteDraft, giaUocTinhDong, tongGiaUocTinh, tongSoLuong,
    tongCongNoTamTinh, sePhepDuCongNo, congNoDuKien, duPhongDuKien, coDongMuaDuTru,
    targetNguoiNhanHang, giaTriTinhChietKhau, chuaCoMaMisa,
    ketQuaTheoDong, loiPhieuText, dongCanXacNhan, hoiXacNhan, setHoiXacNhan,
    khoiPhucLuc, boNhap, anKhoiPhuc,
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
  // Xem giai thich o TaoDonTab.tsx - batBuocYcsc rieng cho Mã YCSC ("MUA HÀNG CÓ ID"), batBuoc giu
  // nguyen rieng cho Chính sách (chi cong no).
  const batBuocYcsc = maYcscRequired(d.loai_de_xuat);
  const thieuMaId = batBuocYcsc && !coMaIdLienQuan(d.ma_yeu_cau_su_co, d.ma_lada); // chi can 1 trong 2 ma
  const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
  const { gia: giaUocTinh, giaNiemYet, nhan: nhanChietKhau } = giaUocTinhDong(d);
  const quickValues = (["MUA HÀNG", "MUA HÀNG CÓ ID", "CÔNG NỢ", "TRỪ CÔNG NỢ"] as const)
    .map((kw) => pickLdeQuick(loaiDeXuatOptions, kw))
    .filter((v): v is string => !!v);
  const isOtherValue = d.loai_de_xuat.trim() !== "" && !quickValues.includes(d.loai_de_xuat);
  const showOtherSelect = otherLdeIdx.has(activeIdx) || isOtherValue;
  const infoHasData = !!(
    d.yeu_cau_hoa_don.trim() !== YEU_CAU_HOA_DON_OPTIONS[0] ||
    d.ma_yeu_cau_su_co.trim() ||
    d.ma_lada.trim() ||
    d.chinh_sach.trim() ||
    d.tt_mail_duyet.trim() ||
    d.tt_khach_hang.trim()
  );
  const showInfoBoSung = batBuoc || batBuocYcsc || infoHasData || infoExpandedIdx.has(activeIdx);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--surface)] anim-in" style={{ height: "100dvh" }}>
      {/* Header - tieu de + "Dung giao dien cu" + dong (diem #6: dat xa CTA chinh o duoi) */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--line)]">
        <h3 className="font-display font-bold text-[var(--ink-900)] text-sm">{t("🧾 Tạo đơn đặt linh kiện")}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleOldUiClick}
            className={`focus-ring text-[11px] font-semibold underline underline-offset-2 px-1.5 py-1 rounded ${confirmOldUi ? "text-[var(--coral-600)]" : "text-[var(--ink-500)]"}`}
          >
            {confirmOldUi ? t("Mất dữ liệu đang nhập — bấm lần nữa?") : t("Dùng giao diện cũ")}
          </button>
          <button onClick={onClose} className="focus-ring w-9 h-9 shrink-0 rounded-lg hover:bg-slate-100 text-[var(--ink-400)] text-lg flex items-center justify-center">
            ✕
          </button>
        </div>
      </div>

      {canQuanLy && (
        <div className="shrink-0 px-3 py-2 border-b border-[var(--line)] bg-[var(--surface-100)]">
          <label className="block text-[10px] font-bold uppercase tracking-wide text-[var(--ocean-700)] mb-1">{t("👤 Người nhận hàng")}</label>
          <Select
            value={nguoiNhanHang}
            onChange={setNguoiNhanHang}
            options={[
              { value: "", label: t("-- Chính tôi --") },
              ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: ktvOptionLabel(r, nguoiNhanHangData?.rows ?? []) })),
            ]}
          />
          <KhachLeSdt form={form} compact />
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
          {t("+ Dòng")}
        </button>
        {drafts.length > 1 && (
          <button
            type="button"
            onClick={() => deleteDraft(activeIdx)}
            className="focus-ring shrink-0 flex items-center justify-center rounded-full h-8 w-8 text-xs font-semibold bg-white border border-[var(--coral-100)] text-[var(--coral-500)]"
            title={t("Xóa dòng đang xem")}
            aria-label={t("Xóa dòng đang xem")}
          >
            ✕
          </button>
        )}
      </div>
      {addBlockedHint && !isLineComplete(drafts[activeIdx]) && (
        <div className="shrink-0 px-3 py-1.5 text-[11px] text-[var(--coral-600)] bg-[var(--coral-100)]/40 font-medium">
          {t("⚠ Điền xong Mã linh kiện/Số lượng (dòng {n}) trước khi thêm dòng mới", { n: activeIdx + 1 })}
        </div>
      )}

      {/* Noi dung the dang active - cuon doc, chiem het khong gian con lai (diem #3). Nen ngoai doi
          sang --bg (nhat, giong nen trang) de the .m-card (vien + bo goc, khong to mau) o duoi noi
          bat len - doi chieu pattern .m-card cua concept 1 cho "card dong dang active". */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3 bg-[var(--bg)]">
      <div className="bg-white border border-[var(--line)] rounded-xl p-3.5 flex flex-col gap-3.5">
        {/* RESTYLE (Phase 5, "đơn giản hoá giống ảnh minh hoạ") - bo Badge loai_don (trung lap voi o
            "Loại đề xuất" ben duoi) va pill mau cam cho Ưu tiên, dua ve 1 checkbox thuong. */}
        <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-600)] cursor-pointer select-none self-start">
          <input type="checkbox" checked={d.uu_tien} onChange={(e) => updateDraft(activeIdx, { uu_tien: e.target.checked })} className="w-4 h-4 accent-[var(--orange-600)]" />
          {t("Ưu tiên")}
        </label>

        <div>
          <label className={reqLabelClass(!d.ma_lk.trim())}>{t("Mã linh kiện *")}</label>
          <LinhKienPicker value={d.ma_lk} onChange={(v) => updateDraft(activeIdx, { ma_lk: v })} options={danhMuc} autoFocus={justAdded} loaiDeXuat={d.loai_de_xuat} />
        </div>

        <div>
          <label className={reqLabelClass(!d.loai_de_xuat.trim())}>{t("Loại đề xuất *")}</label>
          <div className="flex gap-1.5 flex-wrap">
            {(["MUA HÀNG", "MUA HÀNG CÓ ID", "CÔNG NỢ", "TRỪ CÔNG NỢ"] as const).map((kw) => {
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
              {t("khác…")}
            </Btn>
          </div>
          {showOtherSelect && (
            <Select
              value={d.loai_de_xuat}
              onChange={(v) => updateDraft(activeIdx, { loai_de_xuat: v })}
              options={[{ value: "", label: t("-- Chọn --") }, ...loaiDeXuatOptions.map((o) => ({ value: o, label: o }))]}
              className="mt-1.5 w-full"
            />
          )}
        </div>

        {/* So luong - nut +/- 44px (diem #4), rieng cho man hinh nay. */}
        <div>
          <label className={reqLabelClass(!(d.so_luong_de_xuat > 0))}>{t("Số lượng *")}</label>
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
              {giaUocTinh != null ? <><span className="text-[10px]">{t("Ước tính:")} </span><b className="text-[var(--green-700)]"><Money>{fmtVND(giaUocTinh)}</Money></b>{nhanChietKhau && giaNiemYet != null && giaUocTinh < giaNiemYet && <span className="text-[10px]"> · {nhanChietKhau} · <s><Money>{fmtVND(giaNiemYet)}</Money></s></span>}</> : <span className="text-[var(--ink-400)]">{t("Giá: —")}</span>}
            </div>
          </div>
          <DuDoanDuyetHint ketQua={ketQuaTheoDong.get(activeIdx)} />
        </div>

        {/* Anh linh kien can tra (them 2026-08-24, muc 1) - xem giai thich day du o TaoDonTab.tsx. */}
        {loaiDon === "tra_hang" && (
          <div>
            <label className={reqLabelClass(d.anh.length === 0)}>{t("Ảnh linh kiện cần trả *")}</label>
            <TraHangAnhPicker photos={d.anh} onChange={(anh) => updateDraft(activeIdx, { anh })} addToast={addToast} />
          </div>
        )}

        {d.ma_lk.trim() && !lk?.combo && <ThayTheGoiY maLk={d.ma_lk.trim()} addToast={addToast} />}

        {showInfoBoSung ? (
          <>
            <div className="flex items-center gap-2 -my-1">
              <div className="h-px flex-1 bg-[var(--line)]" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-400)]">{t("Thông tin bổ sung (tuỳ chọn)")}</span>
              <div className="h-px flex-1 bg-[var(--line)]" />
            </div>

            <div>
              <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">{t("Yêu cầu hóa đơn")}</label>
              <div className="flex gap-1.5 flex-wrap">
                {YEU_CAU_HOA_DON_OPTIONS.map((o) => (
                  <Btn key={o} type="button" size="md" variant={d.yeu_cau_hoa_don === o ? "primary" : "ghost"} onClick={() => updateDraft(activeIdx, { yeu_cau_hoa_don: o })}>
                    {YEU_CAU_HOA_DON_SHORT_LABELS[o] ?? o}
                  </Btn>
                ))}
              </div>
            </div>
            <div>
              <label className={reqLabelClass(thieuMaId)}>{t("Mã YCSC liên quan")}{batBuocYcsc ? " *" : ""}</label>
              <input
                value={d.ma_yeu_cau_su_co}
                onChange={(e) => updateDraft(activeIdx, { ma_yeu_cau_su_co: e.target.value })}
                maxLength={20}
                className={`focus-ring w-full bg-[var(--surface-100)] border rounded-lg px-2.5 h-11 text-sm ${thieuMaId ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
              />
            </div>
            <MaYeuCauSuCoCheck value={d.ma_yeu_cau_su_co} nguoiNhanHang={nguoiNhanHang || currentEmail} maLada={d.ma_lada} />
            <div>
              <label className={reqLabelClass(thieuMaId)}>{t("Mã Lada liên quan")}{batBuocYcsc ? " *" : ""}</label>
              <input
                value={d.ma_lada}
                onChange={(e) => updateDraft(activeIdx, { ma_lada: e.target.value })}
                maxLength={20}
                placeholder="VD: D1154680"
                className={`focus-ring w-full bg-[var(--surface-100)] border rounded-lg px-2.5 h-11 text-sm font-mono uppercase ${thieuMaId ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
              />
              {batBuocYcsc && <div className="mt-1 text-[11px] text-[var(--ink-500)]">{t("Chỉ cần nhập 1 trong 2: Mã YCSC hoặc Mã Lada.")}</div>}
            </div>
            <MaLadaCheck value={d.ma_lada} />
            <div>
              <label className={reqLabelClass(batBuoc && !d.chinh_sach.trim())}>{t("Chính sách")}{batBuoc ? " *" : ""}</label>
              <Select
                value={d.chinh_sach}
                onChange={(v) => updateDraft(activeIdx, { chinh_sach: v })}
                options={[{ value: "", label: t("-- Không chọn --") }, ...CHINH_SACH_OPTIONS.map((o) => ({ value: o, label: o }))]}
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">{t("TT khách hàng")}</label>
              <input
                value={d.tt_khach_hang}
                onChange={(e) => updateDraft(activeIdx, { tt_khach_hang: e.target.value })}
                placeholder={t("Tên/SĐT/địa chỉ khách hàng liên quan")}
                className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 h-11 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">{t("TT+Mail duyệt")}</label>
              <input
                value={d.tt_mail_duyet}
                onChange={(e) => updateDraft(activeIdx, { tt_mail_duyet: e.target.value })}
                placeholder={t("Mã/nội dung email phê duyệt đặc biệt (nếu có)")}
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
            {t("+ Thông tin bổ sung (Hóa đơn/Chính sách/TT khách hàng…) ▾")}
          </button>
        )}

        <div>
          <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">{t("Ghi chú (tuỳ chọn)")}</label>
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
        <NhapKhoiPhucBanner luc={khoiPhucLuc} onSoanMoi={boNhap} onAn={anKhoiPhuc} />
        {/* KTV nhan hang chua co Ma MISA (2026-10-08) - khoa nut Tao don, backend chan KTV_CHUA_CO_MA_MISA. */}
        {chuaCoMaMisa && (
          <div role="alert" className="rounded-lg border border-[var(--coral-500)]/40 bg-[var(--coral-100)]/60 px-2.5 py-1.5 text-[12px] font-bold text-[var(--coral-700)]">
            {t("⚠ Tài khoản này chưa cài đặt mã MISA nên không thể đặt hàng => vui lòng liên hệ giám sát khu vực")}
          </div>
        )}
        {loiPhieuText && (
          <div role="alert" className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-2.5 py-1.5 text-[12px] font-bold text-[var(--color-danger-strong)]">
            ⚠ {loiPhieuText}
          </div>
        )}
        <XacNhanTaoDonModal open={hoiXacNhan} dong={dongCanXacNhan} onDatTiep={() => create.mutate(true)} onQuayLai={() => setHoiXacNhan(false)} dangGui={create.isPending} />
        <KetQuaTaoDonModal ketQua={form.ketQuaTao} onClose={form.dongKetQuaTao} />
        {/* Canh bao SONG vuot tran cong no (them 2026-09-04) - xem giai thich o TaoDonTab.tsx (ban
            desktop, cung dieu kien). */}
        {sePhepDuCongNo === false && congNoDuKien && (
          <div className="rounded-lg border border-[var(--coral-500)]/40 bg-[var(--coral-100)]/60 px-2.5 py-1.5 text-[11px] font-bold text-[var(--coral-700)]">
            {t("⚠ Vượt trần công nợ dự kiến:")} <Money>{fmtVND(congNoDuKien.cong_no_chot + tongCongNoTamTinh)}</Money> / <Money>{fmtVND(congNoDuKien.tran ?? 0)}</Money>
          </div>
        )}
        {/* Canh bao THONG TIN mốc dự phòng (them 2026-09-13) - xem giai thich o TaoDonTab.tsx (ban
            desktop, cung dieu kien). */}
        {coDongMuaDuTru && duPhongDuKien && (
          <div className="rounded-lg border border-[var(--ocean-500)]/30 bg-[var(--ocean-100)]/50 px-2.5 py-1.5 text-[11px] font-medium text-[var(--ocean-700)]">
            {t("ℹ Mốc dự phòng hiện tại còn khả dụng:")} <Money>{fmtVND(duPhongDuKien.moc_hien_tai)}</Money> / <Money>{fmtVND(duPhongDuKien.tran ?? 0)}</Money>
          </div>
        )}
        <TongNgayKtvInfo email={targetNguoiNhanHang} themGiaTri={giaTriTinhChietKhau} />
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--ink-500)]">{t("{n} dòng · {sl} cái", { n: drafts.length, sl: tongSoLuong })}</span>
          {tongGiaUocTinh > 0 && <span className="font-bold text-[var(--green-700)]"><Money>{fmtVND(tongGiaUocTinh)}</Money></span>}
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="ghost" size="md" className="h-11 shrink-0" onClick={themDong}>
            {t("+ Thêm dòng")}
          </Btn>
          <Btn size="md" className="h-11 flex-1 justify-center text-base" onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}>
            {create.isPending ? t("Đang tạo...") : drafts.length > 1 ? t("Tạo {n} đơn", { n: drafts.length }) : t("Tạo đơn")}
          </Btn>
        </div>
      </div>
    </div>
  );
}
