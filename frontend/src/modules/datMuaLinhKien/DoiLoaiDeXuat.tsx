import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { api, ApiError } from "../../api/client";
import { describeApiError, deriveLoaiDon, canNoRequired, maYcscRequired, coMaIdLienQuan, laMuaCongNoDoiTac, chinhSachMacDinh, trangThaiLabel } from "./helpers";
import { CHINH_SACH_OPTIONS, TAT_CA_LOAI_TRANG_THAI_OPTIONS } from "./constants";
import { t } from "../../i18n";

// DOI LOAI DE XUAT 1 don (v1.424, POST /dat-mua-lk/don-hang/:id/doi-loai-de-xuat - logic + rui ro o backend/src/lib/doiLoaiDeXuat.ts): KTV (nguoi
// tao / nhan) / GS / Ke toan + TN / Kho / Admin, khi don chua xu ly chuyen tien, Ke toan chua duyet, Kho chua tiep nhan cho hang (co
// `duoc_doi_loai_de_xuat` backend tra o chi tiet don). He thong danh gia lai tran cong no / TBP / ton kho / tien va tu chuyen phieu xuat
// theo nhom loai de xuat. Nut "Đổi" nam canh dong "Loại đề xuất" o chi tiet don.
export function DoiLoaiDeXuatButton({
  don, options, addToast, onDone,
}: {
  don: { id: string; loai_de_xuat?: string | null; chinh_sach?: string | null; ma_yeu_cau_su_co?: string | null; ma_lada?: string | null };
  options: string[];
  addToast: (msg: string) => void;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [lde, setLde] = useState("");
  const [chinhSach, setChinhSach] = useState("");
  const [maYcsc, setMaYcsc] = useState("");
  const [maLada, setMaLada] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  useEffect(() => {
    if (!open) return;
    setLde("");
    setChinhSach(don.chinh_sach ?? "");
    setMaYcsc(don.ma_yeu_cau_su_co ?? "");
    setMaLada(don.ma_lada ?? "");
    setGhiChu("");
  }, [open, don.id, don.chinh_sach, don.ma_yeu_cau_su_co, don.ma_lada]);

  // Khong doi qua lai voi TRẢ HÀNG (doi luong - TN dung form Sua) va MUA HÀNG CÔNG NỢ ĐỐI TÁC (gan doi tac + phieu rieng).
  const chon = options.filter((o) => o !== don.loai_de_xuat && deriveLoaiDon(o) !== "tra_hang" && !laMuaCongNoDoiTac(o));
  const canCs = !!lde && canNoRequired(lde);
  const canMa = !!lde && maYcscRequired(lde);
  const thieu = !lde || (canCs && !(chinhSach.trim() || chinhSachMacDinh(lde))) || (canMa && !coMaIdLienQuan(maYcsc, maLada));
  const loaiCu = deriveLoaiDon(don.loai_de_xuat ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ trang_thai: string; trang_thai_cu: string; pxk_moi: string | null; pxk_cu: string | null; doi_phieu: boolean }>(
        `/dat-mua-lk/don-hang/${don.id}/doi-loai-de-xuat`,
        {
          loai_de_xuat: lde,
          ...(canCs ? { chinh_sach: chinhSach.trim() || null } : {}),
          ...(canMa ? { ma_yeu_cau_su_co: maYcsc.trim() || null, ma_lada: maLada.trim() || null } : {}),
          ghi_chu: ghiChu.trim() || null,
        },
      ),
    onSuccess: (r) => {
      setOpen(false);
      onDone();
      const phan: string[] = [t("Đã đổi loại đề xuất sang {a}", { a: lde })];
      if (r.trang_thai !== r.trang_thai_cu) phan.push(t("trạng thái → {a}", { a: trangThaiLabel(TAT_CA_LOAI_TRANG_THAI_OPTIONS, r.trang_thai) }));
      if (r.doi_phieu) phan.push(r.pxk_moi ? t("đơn chuyển sang phiếu {a}", { a: r.pxk_moi }) : t("đơn rời phiếu {a}", { a: r.pxk_cu ?? "" }));
      addToast(phan.join(" — "));
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "STATE_CHANGED") addToast(t("Đơn vừa được người khác cập nhật — tải lại rồi thử lại"));
      else addToast(t("Không đổi được loại đề xuất: ") + describeApiError(err));
    },
  });

  const inputCls = "focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm";
  return (
    <>
      <Btn size="sm" variant="ghost" onClick={() => setOpen(true)}>{t("Đổi")}</Btn>
      <Modal
        open={open}
        onClose={() => !mutation.isPending && setOpen(false)}
        title={t("Đổi loại đề xuất")}
        footer={
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setOpen(false)} disabled={mutation.isPending}>{t("Hủy")}</Btn>
            <Btn variant="primary" onClick={() => mutation.mutate()} disabled={thieu || mutation.isPending} loading={mutation.isPending}>{t("Đổi loại đề xuất")}</Btn>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="text-[var(--color-text-muted)]">
            {t("Hiện tại:")} <span className="font-semibold text-[var(--color-text)]">{don.loai_de_xuat || "—"}</span>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Loại đề xuất mới *")}</label>
            <Select value={lde} onChange={setLde} options={[{ value: "", label: t("-- Chọn --") }, ...chon.map((o) => ({ value: o, label: o }))]} />
          </div>
          {canCs && (
            <div>
              <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Chính sách *")}</label>
              <Select value={chinhSach} onChange={setChinhSach} options={[{ value: "", label: t("-- Không chọn --") }, ...CHINH_SACH_OPTIONS.map((o) => ({ value: o, label: o }))]} />
            </div>
          )}
          {canMa && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Mã YCSC liên quan")}</label>
                <input value={maYcsc} onChange={(e) => setMaYcsc(e.target.value)} maxLength={20} className={inputCls} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Mã Lada liên quan")}</label>
                <input value={maLada} onChange={(e) => setMaLada(e.target.value)} maxLength={20} className={`${inputCls} font-mono uppercase`} />
              </div>
              <div className="col-span-2 text-[11px] text-[var(--ink-500)]">{t("Chỉ cần 1 trong 2: Mã YCSC hoặc Mã Lada.")}</div>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Ghi chú")}</label>
            <input value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} maxLength={500} className={inputCls} placeholder={t("Lý do đổi (không bắt buộc)")} />
          </div>
          {lde && (
            <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-2.5 text-[12px] space-y-1">
              <div className="font-semibold">{t("Hệ thống sẽ kiểm tra lại đơn theo loại mới:")}</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {deriveLoaiDon(lde) !== loaiCu && <li>{t("Đổi nhóm Mua ↔ Công nợ: tiền phải chuyển, trần công nợ và phiếu xuất thay đổi theo.")}</li>}
                <li>{t("Vượt trần công nợ → chờ Giám sát duyệt; linh kiện đặc thù cần TBP → chờ TBP xác nhận.")}</li>
                <li>{t("Tồn kho được xét lại: đủ hàng → duyệt; thiếu → chờ chuyển tiền hoặc chờ hàng.")}</li>
                <li>{t("Khác nhóm loại đề xuất của phiếu đang chứa đơn → đơn tự rời phiếu và vào phiếu phù hợp hoặc phiếu mới; giá / chiết khấu tính lại.")}</li>
              </ul>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
