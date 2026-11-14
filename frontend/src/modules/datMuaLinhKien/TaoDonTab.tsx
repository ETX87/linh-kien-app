import { useQueryClient } from "@tanstack/react-query";
import { KhChuyenKhoanCheck } from "./KhChuyenKhoan";
import { Btn } from "../../components/ui/Btn";
import { Badge, type Tone } from "../../components/x/Badge";
import type { ReactNode } from "react";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { ImportUploader } from "../../components/ImportUploader";
import { StatCard } from "../../components/ui/StatCard";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { fmtVND } from "../../types";
import type { DatDonHangImportSummary, KiemTraDong } from "./types";
import { YEU_CAU_HOA_DON_OPTIONS, CHINH_SACH_OPTIONS, YEU_CAU_HOA_DON_SHORT_LABELS } from "./constants";
import { deriveLoaiDon, reqLabelClass, pickLdeQuick, ktvOptionLabel, formatLkLabel } from "./helpers";
import { LinhKienPicker, ThayTheGoiY } from "./LinhKienPicker";
import { MaYeuCauSuCoCheck } from "./MaYeuCauSuCoCheck";
import { MaLadaCheck } from "./MaLadaCheck";
import { DuDoanDuyetHint, XacNhanTaoDonModal, KetQuaTaoDonModal } from "./DuDoanDuyetHint";
import { GoiYThayTheThieuHang } from "./GoiYThayTheThieuHang";
import { TonMienKhacHint } from "./TonMienKhac";
import { DoiTacCongNoChon } from "./DoiTacCongNoChon";
import { TraHangAnhPicker, NhapKhoiPhucBanner } from "./SharedUi";
import { NhapTaoDonHoi } from "./NhapTaoDonHoi";
import { useTaoDonForm } from "./useTaoDonForm";
import { TaoDonMobileScreen } from "./TaoDonMobileScreen";
import { KhachLeSdt } from "./KhachLeSdt";

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
    danhMuc, nguoiNhanHang, setNguoiNhanHang, drafts,
    activeIdx, setActiveIdx, otherLdeIdx, setOtherLdeIdx, addBlockedHint,
    activeRowRef, justAdded, currentEmail, loaiDeXuatOptions, nguoiNhanHangData, create,
    updateDraft, apDungThayThe, isLineComplete, canSubmit, showImport, setShowImport, themDong, saoChepDong, deleteDraft,
    giaUocTinhDong, tongGiaUocTinh, tongGhiNoDoiTac, tongSoLuong, tongCongNoTamTinh, sePhepDuCongNo, congNoDuKien,
    duPhongDuKien, coDongMuaDuTru, targetNguoiNhanHang, giaTriTinhChietKhau, chuaCoMaMisa,
    ketQuaTheoDong, loiPhieuText, dongCanXacNhan, hoiXacNhan, setHoiXacNhan,
    khoiPhucLuc, boNhap, anKhoiPhuc,
  } = form;

  // THIET KE LAI desktop (chot 2026-11-14, v1.491 - "giao diện chiếm 95% diện tích màn làm việc, phân tích chức năng của các thao tác,
  // nghiên cứu thói quen người dùng => sắp xếp lại giao diện, phân bố, khu vực hiện thị, nhóm các vấn đề"). Phan tich thao tac:
  //  - Cap PHIEU (1 lan / phieu): nguoi nhan hang, SDT KH le, Import Excel -> thanh tren cung (chi TN/GS co).
  //  - Cap DONG (lap lai moi LK): KTV/TN thuong dat nhieu LK CUNG 1 ca (cung loai de xuat, ma YCSC/Lada, mail duyet) -> cot TRAI = danh sach
  //    dong luon thay het (trang thai du kien tung dong), nut "+ Thêm dòng" / "⧉ Sao chép dòng" o chan cot de them nhanh.
  //  - Soan 1 dong (cot GIUA) chia 3 nhom theo thu tu nhap thuc te: (1) Linh kien & so luong (+ goi y ton kho / thay the - can nhin NGAY
  //    canh o chon LK), (2) Loai de xuat / chinh sach / hoa don (quyet dinh luong duyet + gia), (3) Ma lien quan & phe duyet + ghi chu.
  //    Man rong nen HIEN DU moi o (bo khoi "Thông tin bổ sung" thu gon - truoc phai bam mo moi thay Ma YCSC/Lada).
  //  - Cot PHAI = tong hop + kiem tra truoc (tong tien, chiet khau ngay, canh bao cong no / MISA, dong chua xong) + 1 nut chinh "Tạo đơn"
  //    luon co dinh o day cot, khong phai cuon tim.
  // Duoi lg (mobile chon "giao dien cu" / cua so hep) 3 cot xep doc, ca than cuon chung.
  const d = drafts[activeIdx] ?? drafts[0];
  const idx = drafts[activeIdx] ? activeIdx : 0;
  const loaiDon = deriveLoaiDon(d.loai_de_xuat);
  const batBuoc = canNoRequired(d.loai_de_xuat);
  // "MUA HÀNG CÓ ID" bat buoc rieng Ma YCSC/Lada (maYcscRequired), batBuoc (canNoRequired) chi cho Chinh sach.
  const batBuocYcsc = maYcscRequired(d.loai_de_xuat);
  const thieuMaId = batBuocYcsc && !coMaIdLienQuan(d.ma_yeu_cau_su_co, d.ma_lada);
  const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
  const { gia: giaUocTinh, giaNiemYet, nhan: nhanChietKhau, chuaCoGiaKtv } = giaUocTinhDong(d);
  // "khac..." mo Select day du - tu mo neu gia tri hien tai KHONG khop nut nhanh (sua don cu / import / don giong).
  const quickValues = LDE_NHANH.map((kw) => pickLdeQuick(loaiDeXuatOptions, kw)).filter((v): v is string => !!v);
  const isOtherValue = d.loai_de_xuat.trim() !== "" && !quickValues.includes(d.loai_de_xuat);
  const showOtherSelect = otherLdeIdx.has(idx) || isOtherValue;
  const dongChuaXong = drafts.map((x, i) => (isLineComplete(x) ? -1 : i)).filter((i) => i >= 0);
  const soBiChan = [...ketQuaTheoDong.values()].filter((ds) => ds.some((r) => r.loi)).length;
  const oNhap = "focus-ring w-full bg-[var(--surface-100)] border rounded-lg px-2.5 py-1.5 text-sm";

  return (
    <Modal
      open
      title={t("🧾 Tạo đơn đặt linh kiện")}
      onClose={onClose}
      width="max-w-[95vw]"
      height="h-[95vh] max-h-[95vh]"
      bodyClassName="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden"
      // Chieu "giao dien cu -> moi" tren mobile (phan hoi 2026-08-22) - chi hien khi isMobile.
      headerExtra={
        isMobile ? (
          <button onClick={() => setPreferOldUi(false)} className="focus-ring text-[11px] font-semibold text-[var(--ocean-600)] underline underline-offset-2 px-1">
            {t("Dùng giao diện mới")}
          </button>
        ) : undefined
      }
    >
      <XacNhanTaoDonModal open={hoiXacNhan} dong={dongCanXacNhan} onDatTiep={() => create.mutate(true)} onQuayLai={() => setHoiXacNhan(false)} dangGui={create.isPending} />
      <KetQuaTaoDonModal ketQua={form.ketQuaTao} onClose={form.dongKetQuaTao} />
      <NhapTaoDonHoi form={form} />

      <div className="lg:h-full flex flex-col min-h-0">
        {/* ── Thanh cap PHIEU (TN/GS dat ho): nguoi nhan hang + SDT KH le + Import Excel ── */}
        {canQuanLy && (
          <div className="shrink-0 border-b border-[var(--line)] bg-[var(--surface-100)] px-5 py-3">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="w-full max-w-[460px]">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-[var(--ocean-700)] mb-1">{t("👤 Người nhận hàng")}</label>
                <Select
                  value={nguoiNhanHang}
                  onChange={setNguoiNhanHang}
                  options={[
                    { value: "", label: t("-- Chính tôi --") },
                    ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: ktvOptionLabel(r, nguoiNhanHangData?.rows ?? []) })),
                  ]}
                />
                <div className="text-[11px] text-[var(--ink-500)] mt-1">{t("Tạo hộ cho KTV/Trạm khác — bỏ trống nếu bạn tự nhận hàng.")}</div>
              </div>
              <div className="min-w-[260px] -mt-2.5">
                <KhachLeSdt form={form} />
              </div>
              <div className="ml-auto pt-5">
                <Btn variant="ghost" size="sm" onClick={() => setShowImport((v) => !v)}>
                  {showImport ? t("▲ Ẩn Import") : t("⇩ Import Excel")}
                </Btn>
              </div>
            </div>
            {showImport && (
              <div className="mt-3 pt-3 border-t border-[var(--line)] max-h-[45vh] overflow-y-auto">
                <ImportDonExcel />
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* ── Cot 1: danh sach dong ── */}
          <aside className="lg:w-[300px] xl:w-[330px] shrink-0 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-[var(--line)] bg-[var(--surface-100)]">
            <div className="shrink-0 flex items-center justify-between px-4 pt-3 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-500)]">{t("Danh sách linh kiện")}</span>
              <span className="text-[11px] text-[var(--ink-400)]">{t("{n} dòng · {sl} cái", { n: drafts.length, sl: tongSoLuong })}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2 space-y-1.5 max-h-[40vh] lg:max-h-none">
              {drafts.map((x, i) => {
                const lkX = x.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === x.ma_lk) : undefined;
                const giaX = giaUocTinhDong(x).gia;
                const xong = isLineComplete(x);
                const kq = ketQuaDong(ketQuaTheoDong.get(i));
                const dangMo = i === idx;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={`focus-ring w-full text-left rounded-lg border px-2.5 py-2 transition-colors ${
                      dangMo ? "bg-white border-[var(--color-primary)] shadow-[0_0_0_2px_var(--color-primary-soft)]" : "bg-white/70 border-[var(--line)] hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className={`shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${dangMo ? "bg-[var(--color-primary)] text-white" : "bg-[var(--surface-200)] text-[var(--ink-600)]"}`}>{i + 1}</span>
                      {x.uu_tien && <span title={t("Ưu tiên")}>⭐</span>}
                      <span className="flex-1 min-w-0 truncate font-semibold text-[var(--ink-800)]">
                        {x.ma_lk ? (lkX ? formatLkLabel(x.ma_lk, lkX.ten_linh_kien) : x.ma_lk) : <span className="text-[var(--ink-400)] font-normal italic">{t("(Chưa chọn linh kiện)")}</span>}
                      </span>
                      <span className="shrink-0 font-mono text-[var(--ink-500)]">×{x.so_luong_de_xuat}</span>
                    </div>
                    <div className="mt-1 pl-[26px] flex items-center gap-1.5 text-[10.5px] text-[var(--ink-500)] min-w-0">
                      <span className="truncate min-w-0">{x.loai_de_xuat || t("Chưa chọn loại")}</span>
                      {(x.ma_yeu_cau_su_co.trim() || x.ma_lada.trim()) && (
                        <span className="shrink-0 font-mono" title={[x.ma_yeu_cau_su_co, x.ma_lada].filter((v) => v.trim()).join(" · ")}>
                          🎫 {x.ma_yeu_cau_su_co.trim() || x.ma_lada.trim()}
                        </span>
                      )}
                      <span className="ml-auto shrink-0 flex items-center gap-1.5">
                        {giaX != null && <Money className="text-[var(--ink-700)] font-semibold">{fmtVND(giaX)}</Money>}
                        {!xong ? <Badge tone="warning" variant="dot">{t("Chưa xong")}</Badge> : kq ? <Badge tone={kq.tone} variant="dot">{t(kq.nhan)}</Badge> : null}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="shrink-0 border-t border-[var(--line)] p-2.5 space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <Btn variant="ghost" size="sm" onClick={themDong} title={t("Thêm 1 dòng trống (giữ loại đề xuất)")}>
                  {t("+ Thêm dòng")}
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => saoChepDong()} title={t("Thêm dòng mới chép y nguyên dòng đang soạn (bỏ trống linh kiện): loại đề xuất, mã YCSC / Lada, chính sách, mail duyệt…")}>
                  {t("⧉ Sao chép dòng")}
                </Btn>
              </div>
              {addBlockedHint && !isLineComplete(drafts[idx]) && (
                <div className="text-[11px] text-[var(--coral-600)] font-medium">
                  {t("⚠ Điền xong Mã linh kiện/Số lượng (dòng {n}) trước khi thêm dòng mới", { n: idx + 1 })}
                </div>
              )}
            </div>
          </aside>

          {/* ── Cot 2: soan dong dang chon ── */}
          <section className="flex-1 min-w-0 min-h-0 lg:overflow-y-auto">
            <div ref={activeRowRef} className="sticky top-0 z-[1] flex items-center gap-3 flex-wrap px-5 py-2.5 border-b border-[var(--line)] bg-white/95 backdrop-blur-sm">
              <span className="text-sm font-bold text-[var(--color-text)]">
                {t("Dòng {n}", { n: idx + 1 })}
                {drafts.length > 1 ? <span className="font-normal text-[var(--ink-400)]"> / {drafts.length}</span> : null}
              </span>
              <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-600)] cursor-pointer select-none" title={t("Đánh dấu dòng này là ưu tiên")}>
                <input type="checkbox" checked={d.uu_tien} onChange={(e) => updateDraft(idx, { uu_tien: e.target.checked })} className="w-3.5 h-3.5 accent-[var(--orange-600)]" />
                {t("Ưu tiên")}
              </label>
              <div className="ml-auto flex items-center gap-1.5">
                <Btn size="sm" variant="ghost" onClick={() => setActiveIdx(Math.max(0, idx - 1))} disabled={idx === 0} title={t("Dòng trước")}>‹</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setActiveIdx(Math.min(drafts.length - 1, idx + 1))} disabled={idx >= drafts.length - 1} title={t("Dòng sau")}>›</Btn>
                <Btn size="sm" variant="ghost" onClick={() => saoChepDong(idx)}>{t("⧉ Sao chép dòng")}</Btn>
                <Btn size="sm" variant="danger" onClick={() => deleteDraft(idx)} disabled={drafts.length === 1}>{t("Xóa dòng")}</Btn>
              </div>
            </div>

            <div className={`p-5 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start ${justAdded ? "anim-in" : ""}`}>
              {/* Nhom 1: linh kien & so luong (+ goi y ton kho, thay the - can thay ngay canh o chon LK) */}
              <Nhom so={1} tieuDe={t("Linh kiện & số lượng")}>
                <div>
                  <label className={reqLabelClass(!d.ma_lk.trim())}>{t("Mã linh kiện *")}</label>
                  <LinhKienPicker key={idx} value={d.ma_lk} onChange={(v) => updateDraft(idx, { ma_lk: v })} options={danhMuc} autoFocus={justAdded} loaiDeXuat={d.loai_de_xuat} />
                </div>
                <div className="flex items-start gap-5 flex-wrap">
                  <div>
                    <label className={reqLabelClass(!(d.so_luong_de_xuat > 0))}>{t("Số lượng *")}</label>
                    <div className="flex items-center border border-[var(--line)] rounded-lg overflow-hidden w-fit bg-[var(--surface-100)]">
                      <button type="button" onClick={() => updateDraft(idx, { so_luong_de_xuat: Math.max(1, d.so_luong_de_xuat - 1) })} className="focus-ring w-9 h-9 flex items-center justify-center text-[var(--ink-600)] font-bold hover:bg-[var(--surface-200)]">−</button>
                      <input
                        type="number"
                        min={1}
                        value={d.so_luong_de_xuat}
                        onChange={(e) => updateDraft(idx, { so_luong_de_xuat: Number(e.target.value) })}
                        className="focus-ring w-16 text-center text-sm bg-[var(--surface-100)] border-x border-[var(--line)] py-2"
                      />
                      <button type="button" onClick={() => updateDraft(idx, { so_luong_de_xuat: d.so_luong_de_xuat + 1 })} className="focus-ring w-9 h-9 flex items-center justify-center text-[var(--ink-600)] font-bold hover:bg-[var(--surface-200)]">+</button>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className="block text-[11px] font-semibold mb-1 text-[var(--ink-600)]">{t("Giá ước tính")}</label>
                    <div className="flex items-center gap-2 flex-wrap min-h-9">
                      {giaUocTinh != null ? <b className="text-base text-[var(--color-text)]"><Money>{fmtVND(giaUocTinh)}</Money></b> : <span className="text-sm text-[var(--ink-400)]">{t("Chưa rõ giá")}</span>}
                      {nhanChietKhau && giaNiemYet != null && giaUocTinh != null && giaUocTinh < giaNiemYet && (
                        <span className="text-xs text-[var(--ink-500)]">
                          {nhanChietKhau} · {t("niêm yết")} <s><Money>{fmtVND(giaNiemYet)}</Money></s>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {chuaCoGiaKtv && <CanhBaoChuaCoGiaKtv />}
                {/* Ket qua du kien (tu duyet / cho hang / bi chan...) + ton mien khac + goi y LK tuong duong. */}
                <div className="empty:hidden -mt-1.5">
                  <DuDoanDuyetHint ketQua={ketQuaTheoDong.get(idx)} khuVuc={form.kiemTra?.khu_vuc} />
                  <TonMienKhacHint ketQua={ketQuaTheoDong.get(idx)} khuVuc={form.kiemTra?.khu_vuc} />
                  <GoiYThayTheThieuHang
                    ketQua={ketQuaTheoDong.get(idx)}
                    onDoiMa={(ma) => { updateDraft(idx, { ma_lk: ma }); addToast(t("Đã đổi sang {ma}", { ma })); }}
                    onApDung={(phan) => { apDungThayThe(idx, phan); addToast(t("Đã chia thành {n} dòng theo đề xuất", { n: phan.length })); }}
                  />
                </div>
                {d.ma_lk.trim() && !lk?.combo && <ThayTheGoiY maLk={d.ma_lk.trim()} addToast={addToast} onChon={(ma) => updateDraft(idx, { ma_lk: ma })} khuVuc={form.kiemTra?.khu_vuc} />}
                {/* Anh LK can tra - chi don Tra hang, bat buoc 1-3 anh (isLineComplete). */}
                {loaiDon === "tra_hang" && (
                  <div>
                    <label className={reqLabelClass(d.anh.length === 0)}>{t("Ảnh linh kiện cần trả *")}</label>
                    <TraHangAnhPicker photos={d.anh} onChange={(anh) => updateDraft(idx, { anh })} addToast={addToast} />
                  </div>
                )}
              </Nhom>

              <div className="flex flex-col gap-4 min-w-0">
                {/* Nhom 2: loai de xuat / chinh sach / hoa don - quyet dinh luong duyet + gia */}
                <Nhom so={2} tieuDe={t("Loại đề xuất & chính sách")}>
                  <div>
                    <label className={reqLabelClass(!d.loai_de_xuat.trim())}>{t("Loại đề xuất *")}</label>
                    <div className="flex gap-1 flex-wrap">
                      {LDE_NHANH.map((kw) => {
                        const matched = pickLdeQuick(loaiDeXuatOptions, kw);
                        if (!matched) return null;
                        return (
                          <Btn
                            key={kw}
                            size="sm"
                            variant={d.loai_de_xuat === matched ? "primary" : "ghost"}
                            onClick={() => {
                              updateDraft(idx, { loai_de_xuat: matched });
                              // Bam nut nhanh -> bo "ket dinh" che do "khac..." cua dong (phan hoi 2026-08-19 #5).
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
                      <Btn size="sm" variant={showOtherSelect ? "primary" : "ghost"} onClick={() => setOtherLdeIdx((s) => new Set(s).add(idx))}>
                        {t("khác…")}
                      </Btn>
                    </div>
                    {showOtherSelect && (
                      <Select
                        value={d.loai_de_xuat}
                        onChange={(v) => updateDraft(idx, { loai_de_xuat: v })}
                        options={[{ value: "", label: t("-- Chọn --") }, ...loaiDeXuatOptions.map((o) => ({ value: o, label: o }))]}
                        className="mt-1.5"
                      />
                    )}
                  </div>
                  <DoiTacCongNoChon form={form} d={d} idx={idx} reqLabelClass={reqLabelClass} />
                  <div className="grid gap-3">
                    <div className="max-w-[320px]">
                      <label className={reqLabelClass(batBuoc && !d.chinh_sach.trim())}>{t("Chính sách")}{batBuoc ? " *" : ""}</label>
                      <Select
                        value={d.chinh_sach}
                        onChange={(v) => updateDraft(idx, { chinh_sach: v })}
                        options={[{ value: "", label: t("-- Không chọn --") }, ...CHINH_SACH_OPTIONS.map((o) => ({ value: o, label: o }))]}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold mb-1 text-[var(--ink-600)]">{t("Yêu cầu hóa đơn")}</label>
                      <div className="flex gap-1 flex-wrap">
                        {YEU_CAU_HOA_DON_OPTIONS.map((o) => (
                          <Btn key={o} type="button" size="sm" variant={d.yeu_cau_hoa_don === o ? "primary" : "ghost"} onClick={() => updateDraft(idx, { yeu_cau_hoa_don: o })}>
                            {YEU_CAU_HOA_DON_SHORT_LABELS[o] ?? o}
                          </Btn>
                        ))}
                      </div>
                    </div>
                  </div>
                  <KhChuyenKhoanCheck d={d} onChange={(v) => updateDraft(idx, { kh_chuyen_khoan: v })} />
                </Nhom>

                {/* Nhom 3: ma lien quan & phe duyet + ghi chu - hay lap lai giua cac dong cung ca (dung "⧉ Sao chép dòng") */}
                <Nhom so={3} tieuDe={t("Mã liên quan, phê duyệt & ghi chú")} moTa={batBuocYcsc ? t("Chỉ cần nhập 1 trong 2: Mã YCSC hoặc Mã Lada.") : undefined}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <label className={reqLabelClass(thieuMaId)}>{t("Mã YCSC liên quan")}{batBuocYcsc ? " *" : ""}</label>
                      <input
                        value={d.ma_yeu_cau_su_co}
                        onChange={(e) => updateDraft(idx, { ma_yeu_cau_su_co: e.target.value })}
                        maxLength={20}
                        className={`${oNhap} ${thieuMaId ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
                      />
                      <MaYeuCauSuCoCheck value={d.ma_yeu_cau_su_co} nguoiNhanHang={nguoiNhanHang || currentEmail} maLada={d.ma_lada} />
                    </div>
                    <div className="min-w-0">
                      <label className={reqLabelClass(thieuMaId)}>{t("Mã Lada liên quan")}{batBuocYcsc ? " *" : ""}</label>
                      <input
                        value={d.ma_lada}
                        onChange={(e) => updateDraft(idx, { ma_lada: e.target.value })}
                        maxLength={20}
                        placeholder="VD: D1154680"
                        className={`${oNhap} font-mono uppercase ${thieuMaId ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
                      />
                      <MaLadaCheck value={d.ma_lada} />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold mb-1 text-[var(--ink-600)]">{t("TT+Mail duyệt")}</label>
                      <input
                        value={d.tt_mail_duyet}
                        onChange={(e) => updateDraft(idx, { tt_mail_duyet: e.target.value })}
                        placeholder={t("Mã/nội dung email phê duyệt đặc biệt (nếu có)")}
                        className={`${oNhap} border-[var(--line)]`}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold mb-1 text-[var(--ink-600)]">{t("TT khách hàng")}</label>
                      <input
                        value={d.tt_khach_hang}
                        onChange={(e) => updateDraft(idx, { tt_khach_hang: e.target.value })}
                        placeholder={t("Tên/SĐT/địa chỉ khách hàng liên quan")}
                        className={`${oNhap} border-[var(--line)]`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1 text-[var(--ink-600)]">{t("Ghi chú (tuỳ chọn)")}</label>
                    <input value={d.ghi_chu} onChange={(e) => updateDraft(idx, { ghi_chu: e.target.value })} className={`${oNhap} border-[var(--line)]`} />
                  </div>
                </Nhom>
              </div>
            </div>
          </section>

          {/* ── Cot 3: tong hop, kiem tra & tao don ── */}
          <aside className="lg:w-[320px] xl:w-[360px] shrink-0 flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-[var(--line)] bg-[var(--surface-100)]">
            <div className="flex-1 min-h-0 lg:overflow-y-auto p-4 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-500)]">{t("Tổng hợp & kiểm tra")}</div>
              <NhapKhoiPhucBanner luc={khoiPhucLuc} onSoanMoi={boNhap} onAn={anKhoiPhuc} />
              <div className="bg-white border border-[var(--line)] rounded-xl p-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-[var(--ink-500)]">{t("Số dòng")}</span><b>{drafts.length}</b></div>
                <div className="flex justify-between"><span className="text-[var(--ink-500)]">{t("Tổng số lượng")}</span><b>{tongSoLuong}</b></div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[var(--ink-500)]">{t("Giá tham khảo")}</span>
                  <b className="text-base text-[var(--color-text)]">{tongGiaUocTinh > 0 ? <Money>{fmtVND(tongGiaUocTinh)}</Money> : "—"}</b>
                </div>
                {tongGhiNoDoiTac > 0 && (
                  <div className="flex justify-between"><span className="text-[var(--ink-500)]">{t("Ghi nợ đối tác")}</span><Money>{fmtVND(tongGhiNoDoiTac)}</Money></div>
                )}
              </div>
              {/* Tong dat Mua + TRỪ CÔNG NỢ trong ngay cua KTV nhan hang + muc chiet khau sau don nay (2026-09-28). */}
              <div className="bg-white border border-[var(--line)] rounded-xl p-3 empty:hidden">
                <TongNgayKtvInfo email={targetNguoiNhanHang} themGiaTri={giaTriTinhChietKhau} />
              </div>
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
              {sePhepDuCongNo === false && congNoDuKien && (
                <div className="rounded-lg border border-[var(--coral-500)]/40 bg-[var(--coral-100)]/60 px-2.5 py-1.5 text-[11px] font-bold text-[var(--coral-700)]">
                  {t("⚠ Vượt trần công nợ dự kiến:")} <Money>{fmtVND(congNoDuKien.cong_no_chot + tongCongNoTamTinh)}</Money> / <Money>{fmtVND(congNoDuKien.tran ?? 0)}</Money>
                </div>
              )}
              {coDongMuaDuTru && duPhongDuKien && (
                <div className="rounded-lg border border-[var(--ocean-500)]/30 bg-[var(--ocean-100)]/50 px-2.5 py-1.5 text-[11px] font-medium text-[var(--ocean-700)]">
                  {t("ℹ Mốc dự phòng hiện tại còn khả dụng:")} <Money>{fmtVND(duPhongDuKien.moc_hien_tai)}</Money> / <Money>{fmtVND(duPhongDuKien.tran ?? 0)}</Money>
                </div>
              )}
              {soBiChan > 0 && (
                <div className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--color-danger-strong)]">
                  {t("⚠ {n} dòng không tạo được — xem lý do ở từng dòng", { n: soBiChan })}
                </div>
              )}
              {dongChuaXong.length > 0 && (
                <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-2.5 py-2 text-[12px] text-[var(--color-warning-strong)]">
                  <div className="font-semibold mb-1">{t("Dòng chưa điền xong:")}</div>
                  <div className="flex gap-1 flex-wrap">
                    {dongChuaXong.map((i) => (
                      <button key={i} type="button" onClick={() => setActiveIdx(i)} className="focus-ring rounded-md bg-white border border-[var(--color-warning)] px-2 py-0.5 text-[11px] font-semibold hover:bg-[var(--surface-100)]">
                        {t("Dòng {n}", { n: i + 1 })}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-[var(--line)] bg-white p-4">
              <Btn size="md" className="w-full h-11 text-base" onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}>
                {create.isPending ? t("Đang tạo...") : drafts.length > 1 ? t("Tạo {n} đơn", { n: drafts.length }) : t("Tạo đơn")}
              </Btn>
            </div>
          </aside>
        </div>
      </div>
    </Modal>
  );
}

const LDE_NHANH = ["MUA HÀNG", "MUA HÀNG CÓ ID", "CÔNG NỢ", "TRỪ CÔNG NỢ"] as const;

// Nhom o nhap trong cot soan dong - khung trang, so thu tu + tieu de (DESIGN_GUIDELINES: vien mong, bo goc xl, khong to mau).
function Nhom({ so, tieuDe, moTa, children }: { so: number; tieuDe: string; moTa?: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-[var(--line)] rounded-xl min-w-0">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--line)]">
        <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)] text-[11px] font-bold flex items-center justify-center">{so}</span>
        <h4 className="text-[13px] font-bold text-[var(--color-text)]">{tieuDe}</h4>
        {moTa && <span className="ml-auto text-[11px] text-[var(--ink-500)] truncate">{moTa}</span>}
      </header>
      <div className="p-4 flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

// Trang thai du kien 1 dong (tu POST /phieu-dat/kiem-tra) cho danh sach dong - dong combo lay ket qua "xau" nhat.
function ketQuaDong(ds: KiemTraDong[] | undefined): { nhan: string; tone: Tone } | null {
  if (!ds?.length) return null;
  if (ds.some((r) => r.loi)) return { nhan: dichSau("Bị chặn"), tone: "danger" };
  const tt = ds.map((r) => r.trang_thai);
  if (tt.includes("Cho GS duyet")) return { nhan: dichSau("Chờ GS"), tone: "warning" };
  if (tt.includes("Cho TBP xac nhan")) return { nhan: dichSau("Chờ TBP"), tone: "warning" };
  if (tt.includes("Cho hang")) return { nhan: dichSau("Chờ hàng"), tone: "warning" };
  if (tt.includes("Cho thanh toan")) return { nhan: dichSau("Chờ thanh toán"), tone: "warning" };
  if (tt.includes("Cho ke toan duyet mem")) return { nhan: dichSau("Trả hàng"), tone: "info" };
  return { nhan: dichSau("Tự duyệt"), tone: "success" };
}

// Import Excel don hang (TN/GS) - giu nguyen cau hinh cu, chi tach ra cho gon than form.
function ImportDonExcel() {
  return (
    <ImportUploader<DatDonHangImportSummary>
      description={
        <>
          {t("Nhập hàng loạt đơn mua linh kiện từ Excel/CSV — các dòng cùng 1 KTV (cột")}{" "}
          <b className="font-mono">nguoi_nhan_hang</b> {t("= mã KTV) sẽ gộp thành 1 phiếu đặt. Bắt buộc:")}{" "}
          <b className="font-mono">nguoi_nhan_hang</b>, <b className="font-mono">ma_lk</b>,{" "}
          <b className="font-mono">loai_de_xuat</b>, <b className="font-mono">so_luong_de_xuat</b>. {t("Tùy chọn:")}{" "}
          <b className="font-mono">ghi_chu</b>, <b className="font-mono">yeu_cau_hoa_don</b>,{" "}
          <b className="font-mono">tt_mail_duyet</b>, <b className="font-mono">tt_khach_hang</b>,{" "}
          <b className="font-mono">chinh_sach</b>, <b className="font-mono">ma_yeu_cau_su_co</b>,{" "}
          <b className="font-mono">ma_lada</b> {t("(loại cần mã ID: chỉ cần 1 trong 2 mã).")}{" "}
          <b className="font-mono">ma_lk</b> {t("ghi mã combo thì hệ thống tự tách thành từng đơn linh kiện thành phần.")}
        </>
      }
      templateUrl="/api/dat-mua-lk/don-hang/import/template"
      previewUrl="/dat-mua-lk/don-hang/import/preview"
      commitUrl="/dat-mua-lk/don-hang/import/commit"
      buildBody={(rows) => ({ rows })}
      // Ghi theo lo 80 dong (v1.457) - file lon 1 request vuot gioi han D1/CPU, loi giua chung khong bao gi.
      commitChunk={{
        size: 80,
        buildBody: (rows, offset) => ({ rows, dong_bat_dau: offset }),
        merge: (a, b) => ({
          thanhCong: a.thanhCong + b.thanhCong,
          loi: a.loi + b.loi,
          errors: [...a.errors, ...b.errors],
          soPhieu: a.soPhieu + b.soPhieu,
          ktvList: [...new Set([...a.ktvList, ...b.ktvList])],
          phieuIds: [...(a.phieuIds ?? []), ...(b.phieuIds ?? [])],
          loiHeThong: (a.loiHeThong ?? 0) + (b.loiHeThong ?? 0),
        }),
      }}
      renderSummary={(s) => (
        <div className="grid grid-cols-3 gap-3 mb-2">
          <StatCard label={t("Đơn hợp lệ")} value={s.thanhCong} tone="teal" />
          <StatCard label={t("Dòng lỗi")} value={s.loi} tone={s.loi > 0 ? "amber" : "gray"} />
          <StatCard label={t("Số phiếu sẽ tạo")} value={s.soPhieu} tone="ocean" />
        </div>
      )}
      getErrors={(s) => s.errors}
      getWarnings={(s) => s.canhBao ?? []}
      successMessage={(s) => t("Đã tạo {p} phiếu đặt cho {k} KTV ({n} dòng)", { p: s.soPhieu, k: s.ktvList.length, n: s.thanhCong })}
      invalidateKeys={[["dat-mua-lk-don-hang"], ["dat-mua-lk-tom-tat"]]}
    />
  );
}

// canNoRequired/maYcscRequired duoc dung lai o day (import truc tiep, khong qua form) vi la ham thuan
// tuy (khong dinh state) - chi import 1 lan o dau file, khong lap trong useTaoDonForm.ts (ham do da
// import rieng cho chinh no dung trong isLineComplete).
import { canNoRequired, maYcscRequired, coMaIdLienQuan } from "./helpers";
import { Money } from "../../components/ui/Money";
import { TongNgayKtvInfo, CanhBaoChuaCoGiaKtv } from "./TongNgayKtv";
import { t, dichSau } from "../../i18n";
