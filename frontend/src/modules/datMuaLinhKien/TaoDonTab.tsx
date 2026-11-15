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
import type { DatDonHangImportSummary, KiemTraDong, DonHangDraft } from "./types";
import { YEU_CAU_HOA_DON_OPTIONS, CHINH_SACH_OPTIONS, YEU_CAU_HOA_DON_SHORT_LABELS } from "./constants";
import { deriveLoaiDon, reqLabelClass, pickLdeQuick, ktvOptionLabel, formatLkLabel } from "./helpers";
import { LinhKienPicker, ThayTheGoiY } from "./LinhKienPicker";
import { MaYeuCauSuCoCheck } from "./MaYeuCauSuCoCheck";
import { MaLadaCheck } from "./MaLadaCheck";
import { DuDoanDuyetHint, XacNhanTaoDonModal, KetQuaTaoDonModal, moTaKetQua } from "./DuDoanDuyetHint";
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

  // THIET KE LAI desktop lan 2 (chot 2026-11-14, v1.494 - "giao diện thiết kế tạo đơn có quá nhiều vùng bị trống ... trong 3-5s phải biết
  // nhập cái gì, nhập ở đâu, các cảnh báo rõ ràng, đầy đủ"). Danh gia ban v1.491 (3 cot: danh sach | soan 2 cot | tong hop): cot danh sach
  // trong ~80% (KTV thuong 1-3 dong), cot soan lech (nhom LK ngan, 2 nhom phai dai -> khoang trong lon), o ma bi hep, canh bao rai rac, khong
  // chi ra con thieu gi. Chot kieu "GIO HANG":
  //  - TRAI: khung soan 1 dong - moi nhom 1 HANG NGANG (nhan + so thu tu ben trai, o nhap tren luoi 12 cot) theo dung thu tu nhap 1->4;
  //    ngay duoi la BANG "Đơn đang tạo" (moi dong 1 hang: LK, loai, SL, ma, gia, ket qua du kien) - lap khoang trong bang thong tin co ich.
  //  - PHAI (360px): "Cần nhập" (checklist o bat buoc cua dong dang soan, bam = nhay toi o) -> "Cảnh báo" gom 1 cho, dem so, mau theo muc
  //    (do = khong tao duoc, cam = se cho/vuot tran, xanh = thong tin) -> tong tien -> nut "Tạo đơn" co dinh + ly do khi bi khoa.
  const d = drafts[activeIdx] ?? drafts[0];
  const idx = drafts[activeIdx] ? activeIdx : 0;
  const loaiDon = deriveLoaiDon(d.loai_de_xuat);
  const batBuoc = canNoRequired(d.loai_de_xuat);
  const batBuocYcsc = maYcscRequired(d.loai_de_xuat);
  const thieuMaId = batBuocYcsc && !coMaIdLienQuan(d.ma_yeu_cau_su_co, d.ma_lada);
  const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
  const { gia: giaUocTinh, giaNiemYet, nhan: nhanChietKhau, chuaCoGiaKtv } = giaUocTinhDong(d);
  const quickValues = LDE_NHANH.map((kw) => pickLdeQuick(loaiDeXuatOptions, kw)).filter((v): v is string => !!v);
  const isOtherValue = d.loai_de_xuat.trim() !== "" && !quickValues.includes(d.loai_de_xuat);
  const showOtherSelect = otherLdeIdx.has(idx) || isOtherValue;
  const canNhap = yeuCauDong(d);
  const conThieu = canNhap.filter((x) => !x.xong);

  // Canh bao gom 1 cho (cot phai) - moi muc 1 dong, bam muc gan voi dong -> nhay toi dong do.
  type CanhBao = { muc: "chan" | "canh" | "tin"; text: string; dong?: number };
  const canhBao: CanhBao[] = [];
  if (chuaCoMaMisa) canhBao.push({ muc: "chan", text: t("Tài khoản nhận hàng chưa cài đặt mã MISA nên không thể đặt hàng — liên hệ giám sát khu vực.") });
  if (loiPhieuText) canhBao.push({ muc: "chan", text: loiPhieuText });
  drafts.forEach((x, i) => {
    for (const r of ketQuaTheoDong.get(i) ?? []) {
      const m = moTaKetQua(r);
      if (!m || m.tone === "ok") continue;
      canhBao.push({ muc: r.loi ? "chan" : "canh", text: m.text.replace(/^[✕⚠🔒✅ℹ]\s*/u, ""), dong: i });
    }
    if (giaUocTinhDong(x).chuaCoGiaKtv) canhBao.push({ muc: "tin", text: t("Linh kiện chưa có Giá KTV — dòng này tính giá niêm yết, không được chiết khấu."), dong: i });
  });
  if (sePhepDuCongNo === false && congNoDuKien)
    canhBao.push({ muc: "canh", text: t("Vượt trần công nợ dự kiến: {a} / {b}", { a: fmtVND(congNoDuKien.cong_no_chot + tongCongNoTamTinh), b: fmtVND(congNoDuKien.tran ?? 0) }) });
  if (coDongMuaDuTru && duPhongDuKien)
    canhBao.push({ muc: "tin", text: t("Mốc dự phòng còn khả dụng: {a} / {b}", { a: fmtVND(duPhongDuKien.moc_hien_tai), b: fmtVND(duPhongDuKien.tran ?? 0) }) });
  const thuTu = { chan: 0, canh: 1, tin: 2 } as const;
  canhBao.sort((a, b) => thuTu[a.muc] - thuTu[b.muc]);
  const soDongChuaXong = drafts.filter((x) => !isLineComplete(x)).length;
  const lyDoKhoa = create.isPending
    ? null
    : soDongChuaXong > 0
      ? t("Còn {n} dòng chưa nhập đủ thông tin bắt buộc", { n: soDongChuaXong })
      : canhBao.some((c) => c.muc === "chan")
        ? t("Có dòng không tạo được — xem mục Cảnh báo")
        : !canSubmit
          ? t("Kiểm tra lại SĐT khách hàng lẻ")
          : null;

  function denO(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    (el.querySelector("input, select, textarea, button") as HTMLElement | null)?.focus();
  }
  const oNhap = "focus-ring w-full h-9 bg-white border rounded-lg px-2.5 text-sm placeholder:text-[var(--ink-400)]";
  const vienO = (thieu: boolean) => (thieu ? "border-[var(--coral-400)] bg-[var(--coral-100)]/25" : "border-[var(--line)]");

  return (
    <Modal
      open
      title={t("🧾 Tạo đơn đặt linh kiện")}
      onClose={onClose}
      width="max-w-[95vw]"
      height="h-[95vh] max-h-[95vh]"
      bodyClassName="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden bg-[var(--surface-100)]"
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
        {/* ── Cap PHIEU (TN/GS dat ho): 1 hang gon ── */}
        {canQuanLy && (
          <div className="shrink-0 border-b border-[var(--line)] bg-white px-5 py-2.5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[12px] font-bold text-[var(--ocean-700)] shrink-0">{t("👤 Người nhận hàng")}</span>
              <div className="w-full max-w-[440px]">
                <Select
                  value={nguoiNhanHang}
                  onChange={setNguoiNhanHang}
                  options={[
                    { value: "", label: t("-- Chính tôi --") },
                    ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: ktvOptionLabel(r, nguoiNhanHangData?.rows ?? []) })),
                  ]}
                />
              </div>
              <span className="text-[11px] text-[var(--ink-500)]">{t("Tạo hộ cho KTV/Trạm khác — bỏ trống nếu bạn tự nhận hàng.")}</span>
              <div className="ml-auto">
                <Btn variant="ghost" size="sm" onClick={() => setShowImport((v) => !v)}>
                  {showImport ? t("▲ Ẩn Import") : t("⇩ Import Excel")}
                </Btn>
              </div>
            </div>
            <div className="max-w-[560px] empty:hidden [&>div]:mt-2">
              <KhachLeSdt form={form} compact />
            </div>
            {showImport && (
              <div className="mt-3 pt-3 border-t border-[var(--line)] max-h-[45vh] overflow-y-auto">
                <ImportDonExcel />
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* ═════ TRAI: khung soan + bang don dang tao ═════ */}
          <section className="flex-1 min-w-0 min-h-0 lg:overflow-y-auto p-4 space-y-4">
            <div ref={activeRowRef} className={`bg-white border border-[var(--line)] rounded-xl shadow-sm ${justAdded ? "anim-in" : ""}`}>
              {/* Tieu de dong dang soan */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--line)]">
                <span className="shrink-0 rounded-full bg-[var(--color-primary)] text-white text-[12px] font-bold px-2.5 py-0.5">
                  {t("Dòng {n}", { n: idx + 1 })}{drafts.length > 1 ? `/${drafts.length}` : ""}
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-[var(--color-text)]">
                  {d.ma_lk ? (lk ? formatLkLabel(d.ma_lk, lk.ten_linh_kien) : d.ma_lk) : <span className="font-normal text-[var(--ink-400)]">{t("Đang soạn dòng mới")}</span>}
                </span>
                <label className="ml-auto shrink-0 flex items-center gap-1.5 text-xs font-medium text-[var(--ink-600)] cursor-pointer select-none" title={t("Đánh dấu dòng này là ưu tiên")}>
                  <input type="checkbox" checked={d.uu_tien} onChange={(e) => updateDraft(idx, { uu_tien: e.target.checked })} className="w-3.5 h-3.5 accent-[var(--orange-600)]" />
                  ⭐ {t("Ưu tiên")}
                </label>
                {drafts.length > 1 && (
                  <div className="shrink-0 flex items-center gap-1">
                    <Btn size="sm" variant="ghost" onClick={() => setActiveIdx(Math.max(0, idx - 1))} disabled={idx === 0} title={t("Dòng trước")}>‹</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setActiveIdx(Math.min(drafts.length - 1, idx + 1))} disabled={idx >= drafts.length - 1} title={t("Dòng sau")}>›</Btn>
                  </div>
                )}
              </div>

              <div className="divide-y divide-[var(--line)]">
                {/* 1. Linh kien */}
                <Hang so={1} tieuDe={t("Linh kiện")} goiY={t("Bắt buộc")}>
                  <div className="grid grid-cols-12 gap-3 items-start">
                    <div id="tdo-lk" className="col-span-12 xl:col-span-7">
                      <label className={reqLabelClass(!d.ma_lk.trim())}>{t("Mã linh kiện *")}</label>
                      <LinhKienPicker key={idx} value={d.ma_lk} onChange={(v) => updateDraft(idx, { ma_lk: v })} options={danhMuc} autoFocus={justAdded} loaiDeXuat={d.loai_de_xuat} />
                    </div>
                    <div id="tdo-sl" className="col-span-5 xl:col-span-2">
                      <label className={reqLabelClass(!(d.so_luong_de_xuat > 0))}>{t("Số lượng *")}</label>
                      <div className="flex items-center border border-[var(--line)] rounded-lg overflow-hidden h-9 bg-white">
                        <button type="button" onClick={() => updateDraft(idx, { so_luong_de_xuat: Math.max(1, d.so_luong_de_xuat - 1) })} className="focus-ring w-9 h-full shrink-0 text-[var(--ink-600)] font-bold hover:bg-[var(--surface-100)]">−</button>
                        <input
                          type="number"
                          min={1}
                          value={d.so_luong_de_xuat}
                          onChange={(e) => updateDraft(idx, { so_luong_de_xuat: Number(e.target.value) })}
                          className="focus-ring flex-1 min-w-0 h-full text-center text-sm font-semibold border-x border-[var(--line)]"
                        />
                        <button type="button" onClick={() => updateDraft(idx, { so_luong_de_xuat: d.so_luong_de_xuat + 1 })} className="focus-ring w-9 h-full shrink-0 text-[var(--ink-600)] font-bold hover:bg-[var(--surface-100)]">+</button>
                      </div>
                    </div>
                    <div className="col-span-7 xl:col-span-3">
                      <label className="block text-[11px] font-semibold mb-1 text-[var(--ink-600)]">{t("Giá ước tính")}</label>
                      <div className="h-9 flex items-center gap-2 rounded-lg bg-[var(--surface-100)] px-3 min-w-0">
                        {giaUocTinh != null ? <b className="text-[15px] text-[var(--color-text)]"><Money>{fmtVND(giaUocTinh)}</Money></b> : <span className="text-sm text-[var(--ink-400)]">{t("Chưa rõ giá")}</span>}
                        {nhanChietKhau && giaNiemYet != null && giaUocTinh != null && giaUocTinh < giaNiemYet && (
                          <s className="text-[11px] text-[var(--ink-400)] truncate" title={`${nhanChietKhau} · ${t("niêm yết")} ${fmtVND(giaNiemYet)}`}><Money>{fmtVND(giaNiemYet)}</Money></s>
                        )}
                      </div>
                      {nhanChietKhau && giaNiemYet != null && giaUocTinh != null && giaUocTinh < giaNiemYet && (
                        <div className="mt-0.5 text-[11px] text-[var(--ink-500)] truncate">{nhanChietKhau}</div>
                      )}
                    </div>
                  </div>
                  {/* Ket qua du kien dong nay (tu duyet / cho hang / bi chan) + goi y ton / thay the - ngay duoi o chon LK. */}
                  <div className="empty:hidden mt-1">
                    <DuDoanDuyetHint ketQua={ketQuaTheoDong.get(idx)} khuVuc={form.kiemTra?.khu_vuc} />
                    <TonMienKhacHint ketQua={ketQuaTheoDong.get(idx)} khuVuc={form.kiemTra?.khu_vuc} />
                    <GoiYThayTheThieuHang
                      ketQua={ketQuaTheoDong.get(idx)}
                      onDoiMa={(ma) => { updateDraft(idx, { ma_lk: ma }); addToast(t("Đã đổi sang {ma}", { ma })); }}
                      onApDung={(phan) => { apDungThayThe(idx, phan); addToast(t("Đã chia thành {n} dòng theo đề xuất", { n: phan.length })); }}
                    />
                  </div>
                  {chuaCoGiaKtv && <CanhBaoChuaCoGiaKtv />}
                  {d.ma_lk.trim() && !lk?.combo && (
                    <div className="mt-2"><ThayTheGoiY maLk={d.ma_lk.trim()} addToast={addToast} onChon={(ma) => updateDraft(idx, { ma_lk: ma })} khuVuc={form.kiemTra?.khu_vuc} /></div>
                  )}
                  {loaiDon === "tra_hang" && (
                    <div id="tdo-anh" className="mt-3">
                      <label className={reqLabelClass(d.anh.length === 0)}>{t("Ảnh linh kiện cần trả *")}</label>
                      <TraHangAnhPicker photos={d.anh} onChange={(anh) => updateDraft(idx, { anh })} addToast={addToast} />
                    </div>
                  )}
                </Hang>

                {/* 2. Phan loai: loai de xuat, doi tac, chinh sach, hoa don */}
                <Hang so={2} tieuDe={t("Phân loại đơn")} goiY={t("Quyết định luồng duyệt & giá")}>
                  <div id="tdo-lde">
                    <label className={reqLabelClass(!d.loai_de_xuat.trim())}>{t("Loại đề xuất *")}</label>
                    <div className="flex gap-1.5 flex-wrap items-center">
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
                      {showOtherSelect ? (
                        <Select
                          value={d.loai_de_xuat}
                          onChange={(v) => updateDraft(idx, { loai_de_xuat: v })}
                          options={[{ value: "", label: t("-- Chọn loại khác --") }, ...loaiDeXuatOptions.map((o) => ({ value: o, label: o }))]}
                          className="min-w-[260px] flex-1 max-w-[420px]"
                        />
                      ) : (
                        <Btn size="sm" variant="ghost" onClick={() => setOtherLdeIdx((s) => new Set(s).add(idx))}>
                          {t("Loại khác…")}
                        </Btn>
                      )}
                    </div>
                  </div>
                  <div className="empty:hidden mt-3">
                    <MaDonBhInput id="tdo-bh" d={d} email={targetNguoiNhanHang} onChange={(v) => updateDraft(idx, { bh_don_vi_id: v })} />
                  </div>
                  <div id="tdo-doitac" className="empty:hidden mt-3">
                    <DoiTacCongNoChon form={form} d={d} idx={idx} reqLabelClass={reqLabelClass} />
                  </div>
                  <div className="grid grid-cols-12 gap-3 mt-3 items-start">
                    <div id="tdo-cs" className="col-span-12 md:col-span-4">
                      <label className={reqLabelClass(batBuoc && !d.chinh_sach.trim())}>{t("Chính sách")}{batBuoc ? " *" : ""}</label>
                      <Select
                        value={d.chinh_sach}
                        onChange={(v) => updateDraft(idx, { chinh_sach: v })}
                        options={[{ value: "", label: t("-- Không chọn --") }, ...CHINH_SACH_OPTIONS.map((o) => ({ value: o, label: o }))]}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-8">
                      <label className="block text-[11px] font-semibold mb-1 text-[var(--ink-600)]">{t("Yêu cầu hóa đơn")}</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {YEU_CAU_HOA_DON_OPTIONS.map((o) => (
                          <Btn key={o} type="button" size="sm" variant={d.yeu_cau_hoa_don === o ? "primary" : "ghost"} onClick={() => updateDraft(idx, { yeu_cau_hoa_don: o })}>
                            {YEU_CAU_HOA_DON_SHORT_LABELS[o] ?? o}
                          </Btn>
                        ))}
                      </div>
                      <KhChuyenKhoanCheck d={d} onChange={(v) => updateDraft(idx, { kh_chuyen_khoan: v })} />
                    </div>
                  </div>
                </Hang>

                {/* 3. Ma lien quan & phe duyet */}
                <Hang so={3} tieuDe={t("Mã liên quan & phê duyệt")} goiY={batBuocYcsc ? t("Bắt buộc 1 trong 2 mã") : t("Tuỳ chọn")}>
                  <div className="grid grid-cols-12 gap-3 items-start">
                    <div id="tdo-ycsc" className="col-span-12 md:col-span-4 min-w-0">
                      <label className={reqLabelClass(thieuMaId)}>{t("Mã YCSC liên quan")}{batBuocYcsc ? " *" : ""}</label>
                      <input
                        value={d.ma_yeu_cau_su_co}
                        onChange={(e) => updateDraft(idx, { ma_yeu_cau_su_co: e.target.value })}
                        maxLength={20}
                        placeholder={t("VD: T1234567")}
                        className={`${oNhap} ${vienO(thieuMaId)}`}
                      />
                      <MaYeuCauSuCoCheck value={d.ma_yeu_cau_su_co} nguoiNhanHang={nguoiNhanHang || currentEmail} maLada={d.ma_lada} />
                    </div>
                    <div className="col-span-12 md:col-span-4 min-w-0">
                      <label className={reqLabelClass(thieuMaId)}>{t("Mã Lada liên quan")}{batBuocYcsc ? " *" : ""}</label>
                      <input
                        value={d.ma_lada}
                        onChange={(e) => updateDraft(idx, { ma_lada: e.target.value })}
                        maxLength={20}
                        placeholder="VD: D1154680"
                        className={`${oNhap} font-mono uppercase ${vienO(thieuMaId)}`}
                      />
                      <MaLadaCheck value={d.ma_lada} />
                    </div>
                    <div className="col-span-12 md:col-span-4 min-w-0">
                      <label className="block text-[11px] font-semibold mb-1 text-[var(--ink-600)]">{t("TT+Mail duyệt")}</label>
                      <input
                        value={d.tt_mail_duyet}
                        onChange={(e) => updateDraft(idx, { tt_mail_duyet: e.target.value })}
                        placeholder={t("Mã/nội dung email phê duyệt")}
                        className={`${oNhap} border-[var(--line)]`}
                      />
                    </div>
                  </div>
                </Hang>

                {/* 4. Thong tin them */}
                <Hang so={4} tieuDe={t("Thông tin thêm")} goiY={t("Tuỳ chọn")}>
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 md:col-span-5">
                      <label className="block text-[11px] font-semibold mb-1 text-[var(--ink-600)]">{t("TT khách hàng")}</label>
                      <input
                        value={d.tt_khach_hang}
                        onChange={(e) => updateDraft(idx, { tt_khach_hang: e.target.value })}
                        placeholder={t("Tên/SĐT/địa chỉ khách hàng liên quan")}
                        className={`${oNhap} border-[var(--line)]`}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-7">
                      <label className="block text-[11px] font-semibold mb-1 text-[var(--ink-600)]">{t("Ghi chú")}</label>
                      <input
                        value={d.ghi_chu}
                        onChange={(e) => updateDraft(idx, { ghi_chu: e.target.value })}
                        placeholder={t("Ghi chú cho người xử lý (nếu có)")}
                        className={`${oNhap} border-[var(--line)]`}
                      />
                    </div>
                  </div>
                </Hang>
              </div>
            </div>

            {/* Bang "Don dang tao" - moi dong 1 hang, bam = soan dong do */}
            <div className="bg-white border border-[var(--line)] rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--line)]">
                <span className="text-[13px] font-bold text-[var(--color-text)]">{t("Đơn đang tạo")}</span>
                <span className="text-[12px] text-[var(--ink-500)]">{t("{n} dòng · {sl} cái", { n: drafts.length, sl: tongSoLuong })}</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Btn variant="ghost" size="sm" onClick={themDong} title={t("Thêm 1 dòng trống (giữ loại đề xuất)")}>{t("+ Thêm dòng")}</Btn>
                  <Btn variant="subtle" size="sm" onClick={() => saoChepDong()} title={t("Thêm dòng mới chép y nguyên dòng đang soạn (bỏ trống linh kiện): loại đề xuất, mã YCSC / Lada, chính sách, mail duyệt…")}>
                    {t("⧉ Sao chép dòng")}
                  </Btn>
                </div>
              </div>
              {addBlockedHint && !isLineComplete(drafts[idx]) && (
                <div className="px-4 py-1.5 text-[11.5px] font-medium text-[var(--coral-700)] bg-[var(--coral-100)]/40 border-b border-[var(--line)]">
                  {t("⚠ Điền xong Mã linh kiện/Số lượng (dòng {n}) trước khi thêm dòng mới", { n: idx + 1 })}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="tbl w-full">
                  <thead>
                    <tr className="tbl-head">
                      <th className="px-3 py-2 w-10">#</th>
                      <th className="px-3 py-2">{t("Linh kiện")}</th>
                      <th className="px-3 py-2">{t("Loại đề xuất")}</th>
                      <th className="px-3 py-2 text-right">{t("SL")}</th>
                      <th className="px-3 py-2">{t("Mã YCSC / Lada")}</th>
                      <th className="px-3 py-2 text-right">{t("Giá ước tính")}</th>
                      <th className="px-3 py-2">{t("Kết quả dự kiến")}</th>
                      <th className="px-3 py-2 w-[1%]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((x, i) => {
                      const lkX = x.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === x.ma_lk) : undefined;
                      const giaX = giaUocTinhDong(x).gia;
                      const thieu = yeuCauDong(x).filter((y) => !y.xong);
                      const kq = ketQuaDong(ketQuaTheoDong.get(i));
                      const dangMo = i === idx;
                      return (
                        <tr
                          key={i}
                          onClick={() => setActiveIdx(i)}
                          className={`border-t cursor-pointer border-l-[3px] ${dangMo ? "bg-[var(--color-primary-soft)] border-l-[var(--color-primary)]" : "border-l-transparent hover:bg-[var(--surface-100)]"}`}
                        >
                          <td className="px-3 py-2 font-semibold text-[var(--ink-500)]">{x.uu_tien ? "⭐" : i + 1}</td>
                          <td className="px-3 py-2 max-w-[360px] truncate font-semibold text-[var(--color-text)]" title={lkX ? formatLkLabel(x.ma_lk, lkX.ten_linh_kien) : x.ma_lk}>
                            {x.ma_lk ? (lkX ? formatLkLabel(x.ma_lk, lkX.ten_linh_kien) : x.ma_lk) : <span className="font-normal italic text-[var(--ink-400)]">{t("(Chưa chọn linh kiện)")}</span>}
                          </td>
                          <td className="px-3 py-2 max-w-[200px] truncate">{x.loai_de_xuat || "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">{x.so_luong_de_xuat}</td>
                          <td className="px-3 py-2 font-mono">{x.ma_yeu_cau_su_co.trim() || x.ma_lada.trim() || x.bh_don_vi_id?.trim() || "—"}</td>
                          <td className="px-3 py-2 text-right">{giaX != null ? <Money>{fmtVND(giaX)}</Money> : "—"}</td>
                          <td className="px-3 py-2">
                            {thieu.length ? (
                              <Badge tone="warning" variant="dot">{t("Thiếu: {a}", { a: thieu.map((y) => t(y.nhan)).join(", ") })}</Badge>
                            ) : kq ? (
                              <Badge tone={kq.tone} variant="dot">{t(kq.nhan)}</Badge>
                            ) : (
                              <span className="text-[var(--ink-400)]">{t("Đang kiểm tra…")}</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => saoChepDong(i)} title={t("⧉ Sao chép dòng")} className="focus-ring w-7 h-7 rounded-md text-[var(--ink-500)] hover:bg-[var(--surface-200)]">⧉</button>
                              <button type="button" onClick={() => deleteDraft(i)} disabled={drafts.length === 1} title={t("Xóa dòng")} className="focus-ring w-7 h-7 rounded-md text-[var(--color-danger-strong)] hover:bg-[var(--color-danger-soft)] disabled:opacity-30 disabled:hover:bg-transparent">✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ═════ PHAI: can nhap -> canh bao -> tong tien -> Tao don ═════ */}
          <aside className="lg:w-[340px] xl:w-[370px] shrink-0 flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-[var(--line)] bg-white">
            <div className="flex-1 min-h-0 lg:overflow-y-auto p-4 space-y-4">
              <NhapKhoiPhucBanner luc={khoiPhucLuc} onSoanMoi={boNhap} onAn={anKhoiPhuc} />

              {/* Can nhap cho dong dang soan - checklist bam = nhay toi o */}
              <div>
                <TieuDeKhoi>{t("Dòng {n} — cần nhập", { n: idx + 1 })}</TieuDeKhoi>
                <ul className="space-y-1">
                  {canNhap.map((y) => (
                    <li key={y.id}>
                      <button
                        type="button"
                        onClick={() => denO(y.id)}
                        className={`focus-ring w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${
                          y.xong ? "text-[var(--ink-500)] hover:bg-[var(--surface-100)]" : "bg-[var(--coral-100)]/45 text-[var(--coral-700)] font-semibold hover:bg-[var(--coral-100)]/70"
                        }`}
                      >
                        <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${y.xong ? "bg-[var(--color-success)] text-white" : "border-2 border-[var(--coral-400)]"}`}>
                          {y.xong ? "✓" : ""}
                        </span>
                        <span className="flex-1">{t(y.nhan)}</span>
                        {!y.xong && <span className="text-[11px] font-medium opacity-80">{t("Nhập →")}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                {conThieu.length === 0 && <div className="mt-1.5 text-[12px] text-[var(--color-success-strong)] font-medium">{t("✓ Dòng này đã đủ thông tin bắt buộc")}</div>}
              </div>

              {/* Canh bao gom 1 cho */}
              <div>
                <TieuDeKhoi>
                  {t("Cảnh báo")}
                  {canhBao.length > 0 && <span className="ml-1.5 rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)] px-1.5 text-[11px]">{canhBao.length}</span>}
                </TieuDeKhoi>
                {canhBao.length === 0 ? (
                  <div className="rounded-lg bg-[var(--color-success-soft)] px-3 py-2 text-[12.5px] font-medium text-[var(--color-success-strong)]">{t("✓ Không có cảnh báo")}</div>
                ) : (
                  <ul className="space-y-1.5">
                    {canhBao.map((c, k) => (
                      <li key={k}>
                        <button
                          type="button"
                          disabled={c.dong == null}
                          onClick={() => c.dong != null && setActiveIdx(c.dong)}
                          className={`focus-ring w-full text-left rounded-lg border-l-[3px] px-2.5 py-1.5 text-[12px] leading-snug ${
                            c.muc === "chan"
                              ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
                              : c.muc === "canh"
                                ? "border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"
                                : "border-[var(--ocean-500)] bg-[var(--ocean-100)]/50 text-[var(--ocean-700)]"
                          }`}
                        >
                          {c.dong != null && <b>{t("Dòng {n}", { n: c.dong + 1 })}: </b>}
                          {c.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Tong tien */}
              <div>
                <TieuDeKhoi>{t("Tổng đơn")}</TieuDeKhoi>
                <div className="rounded-xl border border-[var(--line)] p-3">
                  <div className="text-[11px] text-[var(--ink-500)]">{t("Giá tham khảo (sau chiết khấu)")}</div>
                  <div className="text-2xl font-bold text-[var(--color-text)] leading-tight">{tongGiaUocTinh > 0 ? <Money>{fmtVND(tongGiaUocTinh)}</Money> : "—"}</div>
                  <div className="mt-1 text-[12px] text-[var(--ink-500)]">
                    {t("{n} dòng · {sl} cái", { n: drafts.length, sl: tongSoLuong })}
                    {tongGhiNoDoiTac > 0 && <> · {t("Ghi nợ đối tác")}: <Money>{fmtVND(tongGhiNoDoiTac)}</Money></>}
                  </div>
                  <div className="mt-2 pt-2 border-t border-[var(--line)] empty:hidden text-[12px]">
                    <TongNgayKtvInfo email={targetNguoiNhanHang} themGiaTri={giaTriTinhChietKhau} />
                  </div>
                </div>
              </div>
            </div>
            <div className="shrink-0 border-t border-[var(--line)] p-4 space-y-2">
              {lyDoKhoa && <div className="text-[12px] font-medium text-[var(--coral-700)] text-center">⚠ {lyDoKhoa}</div>}
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

// O bat buoc cua 1 dong (CUNG dieu kien isLineComplete o useTaoDonForm.ts - doi 1 ben doi ca 2). id = vung o tren form (bam checklist = nhay toi).
function yeuCauDong(x: DonHangDraft): { id: string; nhan: string; xong: boolean }[] {
  const ds = [
    { id: "tdo-lk", nhan: dichSau("Mã linh kiện"), xong: !!x.ma_lk.trim() },
    { id: "tdo-sl", nhan: dichSau("Số lượng"), xong: x.so_luong_de_xuat > 0 },
    { id: "tdo-lde", nhan: dichSau("Loại đề xuất"), xong: !!x.loai_de_xuat.trim() },
  ];
  if (laMuaCongNoDoiTac(x.loai_de_xuat)) ds.push({ id: "tdo-doitac", nhan: dichSau("Đối tác công nợ"), xong: !!x.doi_tac_ma });
  if (laCongNoSuaChua(x.loai_de_xuat)) ds.push({ id: "tdo-bh", nhan: dichSau("Mã đơn bảo hành"), xong: !!chuanMaDonBh(x.bh_don_vi_id) });
  if (canNoRequired(x.loai_de_xuat)) ds.push({ id: "tdo-cs", nhan: dichSau("Chính sách"), xong: !!x.chinh_sach.trim() });
  if (maYcscRequired(x.loai_de_xuat)) ds.push({ id: "tdo-ycsc", nhan: dichSau("Mã YCSC hoặc Mã Lada"), xong: coMaIdLienQuan(x.ma_yeu_cau_su_co, x.ma_lada) });
  if (deriveLoaiDon(x.loai_de_xuat) === "tra_hang") ds.push({ id: "tdo-anh", nhan: dichSau("Ảnh linh kiện cần trả (1–3)"), xong: x.anh.length >= 1 && x.anh.length <= 3 });
  return ds;
}

// 1 nhom o nhap = 1 HANG NGANG: nhan + so thu tu ben trai (cot 170px), o nhap ben phai - quet mat doc theo cot nhan la biet thu tu nhap.
function Hang({ so, tieuDe, goiY, children }: { so: number; tieuDe: string; goiY?: string; children: ReactNode }) {
  return (
    <div className="grid lg:grid-cols-[170px_minmax(0,1fr)] gap-x-5 gap-y-2 px-5 py-4">
      <div className="flex lg:flex-col gap-2 lg:gap-1 items-center lg:items-start">
        <div className="flex items-center gap-2">
          <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)] text-[12px] font-bold flex items-center justify-center">{so}</span>
          <span className="text-[13px] font-bold text-[var(--color-text)]">{tieuDe}</span>
        </div>
        {goiY && <span className="lg:pl-8 text-[11px] text-[var(--ink-500)]">{goiY}</span>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function TieuDeKhoi({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 flex items-center text-[11px] font-bold uppercase tracking-wide text-[var(--ink-500)]">{children}</div>;
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
import { canNoRequired, maYcscRequired, coMaIdLienQuan, laMuaCongNoDoiTac, laCongNoSuaChua, chuanMaDonBh } from "./helpers";
import { MaDonBhInput } from "./CongNoSuaChua";
import { Money } from "../../components/ui/Money";
import { TongNgayKtvInfo, CanhBaoChuaCoGiaKtv } from "./TongNgayKtv";
import { t, dichSau } from "../../i18n";
