import { useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/x/Badge";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { ImportUploader } from "../../components/ImportUploader";
import { StatCard } from "../../components/ui/StatCard";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { fmtVND } from "../../types";
import type { DatDonHangImportSummary } from "./types";
import { YEU_CAU_HOA_DON_OPTIONS, CHINH_SACH_OPTIONS, YEU_CAU_HOA_DON_SHORT_LABELS } from "./constants";
import { deriveLoaiDon, reqLabelClass, pickLdeQuick, LOAI_DON_TONE, ktvOptionLabel, formatLkLabel } from "./helpers";
import { LinhKienPicker, ThayTheGoiY, ThayTheGoiYTuSheet } from "./LinhKienPicker";
import { MaYeuCauSuCoCheck } from "./MaYeuCauSuCoCheck";
import { DuDoanDuyetHint } from "./DuDoanDuyetHint";
import { TraHangAnhPicker } from "./SharedUi";
import { useTaoDonForm } from "./useTaoDonForm";
import { TaoDonMobileScreen } from "./TaoDonMobileScreen";

// SUA (phan hoi 2026-08-21: "giao diện tạo đơn mua hàng cho KTV đang gặp vấn đề trên giao diện
// mobile... xây dựng thêm 1 màn hình tạo linh kiện ưu tiên tiện lợi cho giao diện mobile") - ham nay
// gio la 1 CONG TAC (khong con chua het UI nhu truoc): tren mobile (useIsMobile, cung nguong 767px
// dung boi DatMuaLinhKienModule) mac dinh render TaoDonMobileScreen (full-screen, tranh dung bug
// Modal.tsx bi "vh" tinh theo viewport GOC khong co giao khi ban phim mo - xem giai thich chi tiet o
// TaoDonMobileScreen.tsx); desktop giu NGUYEN Modal cu ben duoi, khong doi gi. Nguoi dung co the tu
// bam "Dùng giao diện cũ" tren mobile (nho qua localStorage) neu can - xem quyet dinh thiet ke da
// thong nhat qua vong tranh luan 2 vai tro (Designer/Critic) truoc khi code, KHONG tu doan.
export function TaoDonTab({
  addToast, qc, canQuanLy, onClose,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>; canQuanLy: boolean; onClose: () => void;
}) {
  const isMobile = useIsMobile();
  // Nho lua chon "giao diện cũ" qua localStorage (dung tinh than useLocalStorageState da dung khap
  // app) - CHI anh huong tren mobile (desktop luon dung Modal, khong doc gia tri nay).
  const [preferOldUi, setPreferOldUi] = useLocalStorageState("dmlk-taodon-prefer-old-ui", false);
  const form = useTaoDonForm({ addToast, qc, canQuanLy, onClose });

  if (isMobile && !preferOldUi) {
    return <TaoDonMobileScreen form={form} canQuanLy={canQuanLy} addToast={addToast} qc={qc} onClose={onClose} onUseOldUi={() => setPreferOldUi(true)} />;
  }

  const {
    danhMuc, nguoiNhanHang, setNguoiNhanHang, drafts, infoExpandedIdx, setInfoExpandedIdx,
    activeIdx, setActiveIdx, otherLdeIdx, setOtherLdeIdx, addBlockedHint, setAddBlockedHint,
    activeRowRef, justAdded, currentEmail, loaiDeXuatOptions, nguoiNhanHangData, create,
    updateDraft, isLineComplete, canSubmit, showImport, setShowImport, themDong, deleteDraft,
    tongGiaUocTinh, tongSoLuong, tongCongNoTamTinh, sePhepDuCongNo, congNoDuKien,
  } = form;

  return (
    <Modal
      open
      title="🧾 Tạo đơn đặt linh kiện"
      onClose={onClose}
      width="max-w-[95vw] sm:max-w-[1200px]"
      height="max-h-[92vh]"
      // SUA BUG (phan hoi 2026-08-22: "vai trò ktv khi ấn chuyển về giao diện nhập liệu cũ, lại không
      // có nút để chuyển về giao diện mới") - truoc day chi co 1 chieu (moi -> cu), khong co duong quay
      // lai tru xoa localStorage thu cong. Chi hien khi isMobile (desktop khong co "giao dien moi" nao
      // khac de quay ve).
      headerExtra={
        isMobile ? (
          <button onClick={() => setPreferOldUi(false)} className="focus-ring text-[11px] font-semibold text-[var(--ocean-600)] underline underline-offset-2 px-1">
            Dùng giao diện mới
          </button>
        ) : undefined
      }
      // Thanh tong tien + nut hanh dong co dinh o day (khong nam trong vung cuon) - phan hoi UX
      // 2026-08-15 dot 2: don nhieu dong tren dien thoai phai cuon het moi thay nut "Tao phieu dat",
      // giong pattern gio hang (Shopee/Tiki) tong tien/nut thanh toan luon co dinh. To nen ocean nhat
      // (phan hoi thiet ke: day la hanh dong CHINH cua ca man hinh, thanh xam trung tinh nhu moi
      // footer khac trong app khong du noi bat).
      // Neu mobile ma preferOldUi=true (nguoi dung tu bam "Dùng giao diện cũ") - man nay van la Modal
      // hep, dung y (xem tranh luan Vong 1: chap nhan khong dep bang man moi, do la luc nguoi dung tu
      // chon quay lai, khong phai loi moi).
      footer={
        <div className="flex flex-col gap-1.5 -mx-5 -my-3 px-5 py-3 bg-[var(--ocean-100)]/35">
          {/* Canh bao SONG vuot tran cong no (them 2026-09-04) - chi hien khi da co du lieu de ket luan
              "Khong du" (sePhepDuCongNo === false), tranh nhieu khi chua co dong cong_no nao/chua co
              tran. Xem giai thich cong thuc o useTaoDonForm.ts. */}
          {sePhepDuCongNo === false && congNoDuKien && (
            <div className="rounded-lg border border-[var(--coral-500)]/40 bg-[var(--coral-100)]/60 px-2.5 py-1.5 text-[11px] font-bold text-[var(--coral-700)]">
              ⚠ Vượt trần công nợ dự kiến: {fmtVND(congNoDuKien.cong_no_chot + tongCongNoTamTinh)} / {fmtVND(congNoDuKien.tran ?? 0)}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-[var(--ink-500)]">{drafts.length} dòng · {tongSoLuong} cái</span>
              {tongGiaUocTinh > 0 && (
                <>
                  <span className="text-[var(--ink-500)]"> · </span>
                  <span className="font-bold text-[var(--green-700)]">{fmtVND(tongGiaUocTinh)}</span>
                  <span className="ml-1 text-[11px] text-[var(--ink-400)]">(*Giá tham khảo)</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Btn variant="ghost" size="sm" onClick={themDong}>
                + Thêm dòng
              </Btn>
              <Btn size="md" onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}>
                {create.isPending ? "Đang tạo..." : drafts.length > 1 ? `Tạo ${drafts.length} đơn` : "Tạo đơn"}
              </Btn>
            </div>
          </div>
          {/* CHOT #1: chi hien ly do SAU KHI da bam thu (addBlockedHint) VA dong dang mo van con thieu -
              tu bien mat ngay khi dong hoan tat, khong con phu thuoc tooltip title (khong hien tren
              mobile cham). */}
          {addBlockedHint && !isLineComplete(drafts[activeIdx]) && (
            <div className="text-[11px] text-[var(--coral-600)] text-right font-medium">
              ⚠ Điền xong Mã linh kiện/Số lượng (dòng {activeIdx + 1}) trước khi thêm dòng mới
            </div>
          )}
        </div>
      }
    >
      {/* CHOT #2 (ra soat module): gop "Nguoi nhan hang" + Import Excel vao CHUNG 1 khoi toolbar thay
          vi 2 khoi tach roi xep chong - Import van thu gon mac dinh (chi TN/GS can, tranh roi cho
          nguoi chi tao tay 1 dong), bam "⇩ Import" moi bung khung keo-tha (co san nut "Tai mau" ben
          trong ImportUploader, khong can them nut rieng). */}
      {canQuanLy && (
        <div className="mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-xl p-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-[var(--ocean-700)] mb-1.5">👤 Người nhận hàng</label>
              <Select
                value={nguoiNhanHang}
                onChange={setNguoiNhanHang}
                options={[
                  { value: "", label: "-- Chính tôi --" },
                  ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: ktvOptionLabel(r, nguoiNhanHangData?.rows ?? []) })),
                ]}
              />
            </div>
            <Btn variant="ghost" size="sm" onClick={() => setShowImport((v) => !v)}>
              {showImport ? "▲ Ẩn Import" : "⇩ Import Excel"}
            </Btn>
          </div>
          <div className="text-[11px] text-[var(--ink-500)] mt-1.5">Tạo hộ cho KTV/Trạm khác — bỏ trống nếu bạn tự nhận hàng.</div>
          {showImport && (
            <div className="mt-3 pt-3 border-t border-[var(--line)]">
              <ImportUploader<DatDonHangImportSummary>
                description={
                  <>
                    Nhập hàng loạt đơn mua linh kiện từ Excel/CSV — các dòng cùng 1 KTV (cột{" "}
                    <b className="font-mono">nguoi_nhan_hang</b> = mã KTV) sẽ gộp thành 1 phiếu đặt. Bắt buộc:{" "}
                    <b className="font-mono">nguoi_nhan_hang</b>, <b className="font-mono">ma_lk</b>,{" "}
                    <b className="font-mono">loai_de_xuat</b>, <b className="font-mono">so_luong_de_xuat</b>. Tùy chọn:{" "}
                    <b className="font-mono">ghi_chu</b>, <b className="font-mono">yeu_cau_hoa_don</b>,{" "}
                    <b className="font-mono">tt_mail_duyet</b>, <b className="font-mono">tt_khach_hang</b>,{" "}
                    <b className="font-mono">chinh_sach</b>, <b className="font-mono">ma_yeu_cau_su_co</b>.
                  </>
                }
                templateUrl="/api/dat-mua-lk/don-hang/import/template"
                previewUrl="/dat-mua-lk/don-hang/import/preview"
                commitUrl="/dat-mua-lk/don-hang/import/commit"
                buildBody={(rows) => ({ rows })}
                renderSummary={(s) => (
                  <div className="grid grid-cols-3 gap-3 mb-2">
                    <StatCard label="Dòng hợp lệ" value={s.thanhCong} tone="teal" />
                    <StatCard label="Dòng lỗi" value={s.loi} tone={s.loi > 0 ? "amber" : "gray"} />
                    <StatCard label="Số phiếu sẽ tạo" value={s.soPhieu} tone="ocean" />
                  </div>
                )}
                getErrors={(s) => s.errors}
                successMessage={(s) => `Đã tạo ${s.soPhieu} phiếu đặt cho ${s.ktvList.length} KTV (${s.thanhCong} dòng)`}
                invalidateKeys={[["dat-mua-lk-don-hang"], ["dat-mua-lk-tom-tat"]]}
              />
            </div>
          )}
        </div>
      )}

      {/* CHOT #1 (ra soat "Tao Don Linh Kien 2.0"): bo accordion 2 cot - danh sach dong gio la 1 COT
          DOC DUY NHAT theo DUNG thu tu drafts (khong tach "dong dang mo" ra rieng 1 vi tri co dinh).
          Dong nao idx===activeIdx thi render full form tai cho, con lai render 1 hang gon full-width -
          dong moi them luon nam CUOI danh sach nhu no von la, khong con bi "an" trong 1 sidebar hep. */}
      <div className="space-y-2">
        {drafts.map((d, idx) => {
          if (idx !== activeIdx) {
            const loaiDonThu = deriveLoaiDon(d.loai_de_xuat);
            const toneThu = LOAI_DON_TONE[loaiDonThu];
            const lkThu = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
            const giaTongThu = lkThu?.gia_ban != null ? lkThu.gia_ban * d.so_luong_de_xuat : null;
            const completeThu = isLineComplete(d);
            // SUA (ra soat #7): rut gon truoc day CHI hien gia (an luon tren mobile, va AN HOAN TOAN
            // khi khong ro gia ban) - thieu ca so luong/ma YCSC/yeu cau hoa don khi thu gon. Gio LUON
            // hien du: SL (chip), gia uoc tinh (neu co), Mã YCSC (neu co), icon 🧾 khi co yeu cau hoa
            // don - moi thu 1 chip/icon nho gon tren CUNG 1 dong, khong can mo dong moi xem duoc.
            return (
              <button
                key={idx}
                onClick={() => setActiveIdx(idx)}
                // SUA (phan hoi 2026-08-18 lan 2): dong uu_tien them ring NOI BAT bao quanh CA O (khong
                // chi icon ⭐ nho trong tieu de). SUA (phan hoi 2026-08-19: bao mau viền vàng bị lẫn khi
                // dòng mới kế thừa loại "Công nợ" cũng dùng amber) - doi sang cam THAT (token --orange-*
                // rieng, khac amber) de KHONG con trung mau voi border-l-4 loai don.
                className={`focus-ring w-full text-left bg-white border border-[var(--line)] ${toneThu.border} border-l-4 rounded-xl overflow-hidden text-xs hover:shadow-sm transition-shadow flex items-center gap-2.5 px-3 py-2 ${d.uu_tien ? "ring-2 ring-[var(--orange-500)]" : ""}`}
              >
                <span className="font-mono text-[10px] text-[var(--ink-400)] shrink-0">Dòng {idx + 1}</span>
                <span className="flex-1 min-w-0 flex items-center gap-1 font-semibold text-[var(--ocean-800)]">
                  {d.uu_tien && <span title="Ưu tiên">⭐</span>}
                  <span className="truncate">{d.ma_lk ? (lkThu ? formatLkLabel(d.ma_lk, lkThu.ten_linh_kien) : d.ma_lk) : "(Chưa chọn linh kiện)"}</span>
                </span>
                <span className="shrink-0 hidden sm:inline text-[var(--ink-500)] font-mono">×{d.so_luong_de_xuat}</span>
                {giaTongThu != null && <span className="text-[var(--green-700)] font-semibold shrink-0 hidden md:inline">{fmtVND(giaTongThu)}</span>}
                {d.ma_yeu_cau_su_co.trim() && (
                  <span className="shrink-0 hidden md:inline text-[10px] font-mono text-[var(--ink-500)] bg-[var(--surface-100)] border border-[var(--line)] rounded px-1.5 py-0.5" title={`Mã yêu cầu sự cố: ${d.ma_yeu_cau_su_co}`}>
                    🎫 {d.ma_yeu_cau_su_co}
                  </span>
                )}
                {d.yeu_cau_hoa_don.trim() !== YEU_CAU_HOA_DON_OPTIONS[0] && (
                  <span className="shrink-0" title={YEU_CAU_HOA_DON_SHORT_LABELS[d.yeu_cau_hoa_don] ?? d.yeu_cau_hoa_don}>🧾</span>
                )}
                <span className="shrink-0"><Badge tone={completeThu ? "success" : "warning"}>{completeThu ? "✓" : "⚠ Chưa xong"}</Badge></span>
              </button>
            );
          }

          const loaiDon = deriveLoaiDon(d.loai_de_xuat);
          const batBuoc = canNoRequired(d.loai_de_xuat);
          // Them 2026-09-09 ("MUA HÀNG CÓ ID" bat buoc rieng Mã YCSC, khong bat buoc Chính sách nhu
          // cong no - xem maYcscRequired o helpers.ts) - batBuoc (canNoRequired) VAN giu nguyen dung
          // rieng cho label/border Chính sách.
          const batBuocYcsc = maYcscRequired(d.loai_de_xuat);
          const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
          const giaUocTinh = lk?.gia_ban != null ? lk.gia_ban * d.so_luong_de_xuat : null;
          // "khac..." mo Select day du - tu dong mo neu gia tri hien tai KHONG khop 1 trong 3 nut
          // nhanh (vd sua tu don cu / import co san loai it dung), khong chi khi nguoi dung tu bam.
          const quickValues = (["MUA HÀNG", "MUA HÀNG CÓ ID", "CÔNG NỢ", "TRỪ CÔNG NỢ"] as const)
            .map((kw) => pickLdeQuick(loaiDeXuatOptions, kw))
            .filter((v): v is string => !!v);
          const isOtherValue = d.loai_de_xuat.trim() !== "" && !quickValues.includes(d.loai_de_xuat);
          const showOtherSelect = otherLdeIdx.has(idx) || isOtherValue;
          // SUA (phan hoi 2026-08-19): gop "Thong tin bo sung" thanh 1 khoi DUY NHAT, mac dinh AN -
          // chi tu mo khi batBuoc (Chinh sach/Ma YCSC bat buoc cho loai cong no) HOAC da co san du lieu
          // (sua don cu/import) HOAC nguoi dung tu bam mo rong.
          const infoHasData = !!(
            d.yeu_cau_hoa_don.trim() !== YEU_CAU_HOA_DON_OPTIONS[0] ||
            d.ma_yeu_cau_su_co.trim() ||
            d.chinh_sach.trim() ||
            d.tt_mail_duyet.trim() ||
            d.tt_khach_hang.trim()
          );
          const showInfoBoSung = batBuoc || batBuocYcsc || infoHasData || infoExpandedIdx.has(idx);
          return (
            <div
              key={idx}
              ref={activeRowRef}
              // RESTYLE (Phase 5 StageMenu, phan hoi 2026-09-11: "đơn giản hoá giống ảnh minh hoạ" -
              // tham khao form "NEW ĐƠN" AppSheet cua cong ty, dang khung trang phang, khong con vien
              // mau/ring theo loai_don/uu_tien nhu truoc - CHI doi hinh thuc, KHONG doi hanh vi/du lieu
              // (uu_tien van luu binh thuong qua checkbox o duoi).
              className={`bg-white border border-[var(--line)] rounded-xl overflow-hidden shadow-sm transition-shadow ${justAdded ? "shadow-[0_0_0_3px_var(--teal-100)]" : ""}`}
            >
              {/* Header dong: so thu tu + xoa dong - RUT GON (Phase 5): bo Badge loai_don (trung lap
                  thong tin voi o "Loại đề xuất" ben duoi) va pill mau cam cho Ưu tiên, dua ve 1 hang
                  phang trung tinh + 1 checkbox thuong. */}
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--line)] bg-[var(--surface-100)]">
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-400)] shrink-0">
                    Dòng {idx + 1}{drafts.length > 1 ? ` / ${drafts.length}` : ""}
                  </span>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-600)] cursor-pointer select-none" title="Đánh dấu dòng này là ưu tiên">
                    <input
                      type="checkbox"
                      checked={d.uu_tien}
                      onChange={(e) => updateDraft(idx, { uu_tien: e.target.checked })}
                      className="w-3.5 h-3.5 accent-[var(--orange-600)]"
                    />
                    Ưu tiên
                  </label>
                </div>
                <Btn size="sm" variant="danger" onClick={() => deleteDraft(idx)} disabled={drafts.length === 1}>
                  Xóa dòng
                </Btn>
              </div>

              <div className="p-3.5 flex flex-col gap-3.5">
                {/* 1) Ma linh kien - luon full-width MOI breakpoint (truoc day bi ket 33% tren
                    tablet/desktop khien ten linh kien dai bi cat - phan hoi UX dot 2 diem chinh).
                    autoFocus CHI khi day la dong VUA duoc them (justAdded) va dang la dong active -
                    phan hoi 2026-08-19 #6: chuyen thang toi o nhap ma LK, khoi phai cuon tim. */}
                <div>
                  <label className={reqLabelClass(!d.ma_lk.trim())}>Mã linh kiện *</label>
                  <LinhKienPicker value={d.ma_lk} onChange={(v) => updateDraft(idx, { ma_lk: v })} options={danhMuc} autoFocus={justAdded} />
                </div>

                {/* RESTYLE (Phase 5, phan hoi "đơn giản hoá giống ảnh minh hoạ") - tach lai thanh 3
                    khoi rieng "Loại đề xuất/Số lượng/Giá ước tính" (truoc day gop 1 hang) de khop dung
                    nhip "1 nhan - 1 o" cua form tham khao, thay vi don het vao 1 dong dai. */}
                <div>
                  <label className={reqLabelClass(!d.loai_de_xuat.trim())}>Loại đề xuất *</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex gap-1 flex-wrap flex-1 min-w-[160px]">
                      {(["MUA HÀNG", "MUA HÀNG CÓ ID", "CÔNG NỢ", "TRỪ CÔNG NỢ"] as const).map((kw) => {
                        const matched = pickLdeQuick(loaiDeXuatOptions, kw);
                        if (!matched) return null;
                        return (
                          <Btn
                            key={kw}
                            size="sm"
                            variant={d.loai_de_xuat === matched ? "primary" : "ghost"}
                            onClick={() => {
                              updateDraft(idx, { loai_de_xuat: matched });
                              // SUA BUG (phan hoi 2026-08-19 #5): bam nut nhanh khac PHAI xoa "ket dinh"
                              // che do "khac..." cua dong nay - truoc day chi set gia tri loai_de_xuat
                              // nhung khong xoa otherLdeIdx, khien nut "khac…" + o Select van hien SAI
                              // (ket "dinh" o che do khac du gia tri thuc te da doi sang 1 trong 3 nut
                              // nhanh).
                              setOtherLdeIdx((s) => {
                                if (!s.has(idx)) return s;
                                const next = new Set(s);
                                next.delete(idx);
                                return next;
                              });
                            }}
                          >
                            {kw}
                          </Btn>
                        );
                      })}
                      <Btn
                        size="sm"
                        variant={showOtherSelect ? "primary" : "ghost"}
                        onClick={() => setOtherLdeIdx((s) => new Set(s).add(idx))}
                      >
                        khác…
                      </Btn>
                    </div>
                    {showOtherSelect && (
                      <Select
                        value={d.loai_de_xuat}
                        onChange={(v) => updateDraft(idx, { loai_de_xuat: v })}
                        options={[{ value: "", label: "-- Chọn --" }, ...loaiDeXuatOptions.map((o) => ({ value: o, label: o }))]}
                        className="min-w-[180px] max-w-[260px] flex-1"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className={reqLabelClass(!(d.so_luong_de_xuat > 0))}>Số lượng *</label>
                  {/* SUA (phan hoi 2026-08-18): nen chim bg-surface-100 (dong bo voi moi o nhap lieu
                      khac trong module) thay vi bg-white - card cha da la bg-white nen truoc day o
                      nhap "an" luon vao nen, chi phan biet duoc qua 1 duong vien mong. Hover cua nut
                      +/- doi sang surface-200 (dam hon 1 nac) de van con phan biet duoc trang thai
                      hover so voi nen tinh surface-100. */}
                  <div className="flex items-center border border-[var(--line)] rounded-lg overflow-hidden w-fit bg-[var(--surface-100)]">
                    <button
                      type="button"
                      onClick={() => updateDraft(idx, { so_luong_de_xuat: Math.max(1, d.so_luong_de_xuat - 1) })}
                      className="focus-ring w-8 h-9 flex items-center justify-center text-[var(--ink-600)] font-bold bg-[var(--surface-100)] hover:bg-[var(--surface-200)]"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={d.so_luong_de_xuat}
                      onChange={(e) => updateDraft(idx, { so_luong_de_xuat: Number(e.target.value) })}
                      className="focus-ring w-14 text-center text-sm bg-[var(--surface-100)] border-x border-[var(--line)] py-2"
                    />
                    <button
                      type="button"
                      onClick={() => updateDraft(idx, { so_luong_de_xuat: d.so_luong_de_xuat + 1 })}
                      className="focus-ring w-8 h-9 flex items-center justify-center text-[var(--ink-600)] font-bold bg-[var(--surface-100)] hover:bg-[var(--surface-200)]"
                    >
                      +
                    </button>
                  </div>
                  {/* Canh bao "don nay se tu dong duyet hay khong" (them 2026-09-11) - chi co y nghia
                      khi da chon du Ma LK + Loai de xuat + So luong, xem dieu kien ben trong component. */}
                  <DuDoanDuyetHint
                    maLk={d.ma_lk}
                    soLuong={d.so_luong_de_xuat}
                    loaiDeXuat={d.loai_de_xuat}
                    nguoiNhanHang={nguoiNhanHang || currentEmail}
                    loaiDon={loaiDon}
                    sePhepDuCongNo={sePhepDuCongNo}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-1 text-[var(--ink-600)]">Giá ước tính</label>
                  <div className="flex items-center border border-[var(--line)] rounded-lg px-2.5 py-2 text-sm bg-[var(--surface-100)] w-fit min-w-[140px]">
                    {giaUocTinh != null ? <b className="text-[var(--green-700)]">{fmtVND(giaUocTinh)}</b> : <span className="text-[var(--ink-400)]">Chưa rõ giá</span>}
                  </div>
                </div>

                {/* Tickbox Uu tien da chuyen len HEADER (phan hoi 2026-08-18 lan 3) - bo khoi day, xem
                    comment o header phia tren. */}

                {/* Anh linh kien can tra (them 2026-08-24, muc 1) - CHI hien khi dong nay la Tra hang,
                    bat buoc 1-3 anh (xem isLineComplete o useTaoDonForm.ts). */}
                {loaiDon === "tra_hang" && (
                  <div>
                    <label className={reqLabelClass(d.anh.length === 0)}>Ảnh linh kiện cần trả *</label>
                    <TraHangAnhPicker photos={d.anh} onChange={(anh) => updateDraft(idx, { anh })} addToast={addToast} />
                  </div>
                )}

                {d.ma_lk.trim() && <ThayTheGoiY maLk={d.ma_lk.trim()} canQuanLy={canQuanLy} addToast={addToast} />}
                {d.ma_lk.trim() && <ThayTheGoiYTuSheet maLk={d.ma_lk.trim()} />}

                {/* "Thong tin bo sung" - mac dinh AN (phan hoi 2026-08-19 #5), chi tu mo khi batBuoc/
                    da co du lieu/nguoi dung tu bam. Gop het Yeu cau hoa don + Ma YCSC + Chinh sach vao
                    1 hang, TT khach hang + TT+Mail duyet vao 1 hang (phan hoi 2026-08-19: "gộp chung
                    1 dòng"). */}
                {showInfoBoSung ? (
                  <>
                    <div className="flex items-center gap-2 -my-1">
                      <div className="h-px flex-1 bg-[var(--line)]" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-400)]">Thông tin bổ sung (tuỳ chọn)</span>
                      <div className="h-px flex-1 bg-[var(--line)]" />
                    </div>

                    {/* RESTYLE (Phase 5) - tach thanh cac khoi rieng xep doc, thay vi grid nhieu cot,
                        khop dung nhip "1 nhan - 1 o" cua form tham khao. */}
                    <div>
                      <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">Yêu cầu hóa đơn</label>
                      <div className="flex gap-1 flex-wrap">
                        {YEU_CAU_HOA_DON_OPTIONS.map((o) => (
                          <Btn
                            key={o}
                            type="button"
                            size="sm"
                            variant={d.yeu_cau_hoa_don === o ? "primary" : "ghost"}
                            onClick={() => updateDraft(idx, { yeu_cau_hoa_don: o })}
                          >
                            {YEU_CAU_HOA_DON_SHORT_LABELS[o] ?? o}
                          </Btn>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={reqLabelClass(batBuocYcsc && !d.ma_yeu_cau_su_co.trim())}>Mã YCSC liên quan{batBuocYcsc ? " *" : ""}</label>
                      <input
                        value={d.ma_yeu_cau_su_co}
                        onChange={(e) => updateDraft(idx, { ma_yeu_cau_su_co: e.target.value })}
                        maxLength={20}
                        className={`focus-ring w-full bg-[var(--surface-100)] border rounded-lg px-2.5 py-1.5 text-sm ${batBuocYcsc && !d.ma_yeu_cau_su_co.trim() ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
                      />
                      <MaYeuCauSuCoCheck value={d.ma_yeu_cau_su_co} nguoiNhanHang={nguoiNhanHang || currentEmail} />
                    </div>
                    <div>
                      <label className={reqLabelClass(batBuoc && !d.chinh_sach.trim())}>Chính sách{batBuoc ? " *" : ""}</label>
                      <Select
                        value={d.chinh_sach}
                        onChange={(v) => updateDraft(idx, { chinh_sach: v })}
                        options={[{ value: "", label: "-- Không chọn --" }, ...CHINH_SACH_OPTIONS.map((o) => ({ value: o, label: o }))]}
                      />
                    </div>
                    <div>
                      <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">TT khách hàng</label>
                      <input
                        value={d.tt_khach_hang}
                        onChange={(e) => updateDraft(idx, { tt_khach_hang: e.target.value })}
                        placeholder="Tên/SĐT/địa chỉ khách hàng liên quan"
                        className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">TT+Mail duyệt</label>
                      <input
                        value={d.tt_mail_duyet}
                        onChange={(e) => updateDraft(idx, { tt_mail_duyet: e.target.value })}
                        placeholder="Mã/nội dung email phê duyệt đặc biệt (nếu có)"
                        className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                      />
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setInfoExpandedIdx((s) => new Set(s).add(idx))}
                    className="focus-ring self-start text-xs font-semibold text-[var(--ink-500)] hover:text-[var(--ocean-600)]"
                  >
                    + Thông tin bổ sung (Hóa đơn/Chính sách/TT khách hàng…) ▾
                  </button>
                )}

                {/* Ghi chu - luon o CUOI CUNG cua card (phan hoi UX dot 2). */}
                <div>
                  <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">Ghi chú (tuỳ chọn)</label>
                  <input
                    value={d.ghi_chu}
                    onChange={(e) => updateDraft(idx, { ghi_chu: e.target.value })}
                    className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// canNoRequired/maYcscRequired duoc dung lai o day (import truc tiep, khong qua form) vi la ham thuan
// tuy (khong dinh state) - chi import 1 lan o dau file, khong lap trong useTaoDonForm.ts (ham do da
// import rieng cho chinh no dung trong isLineComplete).
import { canNoRequired, maYcscRequired } from "./helpers";
