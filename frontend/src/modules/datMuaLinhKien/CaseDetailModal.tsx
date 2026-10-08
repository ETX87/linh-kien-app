import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "../../components/ui/Modal";
import { api, ApiError } from "../../api/client";
import { fmtDateTime, fmtDate, fmtVND } from "../../types";
import { shortKhuVuc } from "../../lib/khuVucShortLabel";
import { ImageThumb } from "./SharedUi";
import type { CaseDetailData, CaseGiaiTrinh } from "./types";
import { Money } from "../../components/ui/Money";
import { t } from "../../i18n";
import { linkAnToan } from "../../lib/linhAnToan";

// Man "Xem chi tiet case" doc lap (phan hoi 2026-08-26) - mo tu icon canh o kiem tra ma yeu cau su co
// luc tao don, hoac bam vao 1 ID case bat ky dang hien trong don hang (MaYcscCell/danh sach case cua
// DonCuaToiTab). KHONG chan them theo quyen so huu case o day - ID case chi lo ra tu 1 don hang nguoi
// dung DA duoc phep xem, xem GET /case-detail/:id o backend. Du lieu chi keo API doi tac 1 LAN dau
// (cache server), man nay chi hien lai + cho bam "Dong bo lai" (server gioi han toi thieu 5s/lan).
// Bo cuc doi chieu theo "renderCaseFieldsGrid" cua he DVBH goc (frontend/src/modules/CaseDetail.tsx) -
// cung nhom Thong tin chung/Thong tin xu ly/Hinh anh/Doanh thu/Phan loai, mo rong 2026-09-11 them
// giaiTrinh + 6 field moi (ngay_import/ngay_cap_nhat_gan_nhat/dung_han/xu_ly_24h_bucket/ly_do_huy/
// link_hinh_anh) theo PARTNER_API_GUIDE.md.
type DetailResp = { found: boolean; data: CaseDetailData | null; giaiTrinh?: CaseGiaiTrinh[]; syncedAt: string | null; syncFailed?: boolean };

function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--ink-500)]">{label}</div>
      <div className={`text-[13px] font-medium text-[var(--ink-800)] ${mono ? "font-mono" : ""}`}>{typeof value === "string" ? (value.trim() ? value : "—") : (value ?? "—")}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--line)] p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-500)] mb-2">{title}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">{children}</div>
    </div>
  );
}

export function CaseDetailModal({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const [resp, setResp] = useState<DetailResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [, forceTick] = useState(0);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get<DetailResp>(`/dat-mua-lk/case-detail/${encodeURIComponent(caseId)}`)
      .then(setResp)
      .catch(() => setError(t("Không tải được thông tin case — thử lại sau.")))
      .finally(() => setLoading(false));
  };

  useEffect(load, [caseId]);

  // Dem nguoc cooldown 5s hien tren nut - chi tren UI, gioi han that nam o server (msSinceVN/
  // CASE_DETAIL_MIN_SYNC_MS o datMuaLinhKien.ts).
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const hen = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(hen);
  }, [cooldownUntil]);

  const handleSync = () => {
    setSyncing(true);
    setError(null);
    api
      .post<DetailResp>(`/dat-mua-lk/case-detail/${encodeURIComponent(caseId)}/sync`)
      .then((r) => {
        setResp(r);
        setCooldownUntil(Date.now() + 5000);
        // syncFailed = API doi tac loi/timeout luc dong bo, backend van giu nguyen du lieu cache CU
        // (khong xoa sach) - chi bao loi de nguoi dung biet du lieu dang xem chua phai ban moi nhat.
        if (r.syncFailed) setError(t("Đồng bộ thất bại — vẫn đang hiển thị dữ liệu đã lưu trước đó."));
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError && e.code === "TOO_SOON" ? t("Vừa đồng bộ xong, đợi vài giây rồi thử lại.") : t("Đồng bộ thất bại — thử lại sau.")),
      )
      .finally(() => setSyncing(false));
  };

  const d = resp?.data;
  const giaiTrinh = resp?.giaiTrinh ?? [];
  const remainingS = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));

  return (
    <Modal open onClose={onClose} title={t("Chi tiết case {a}", { a: caseId })} width="max-w-2xl">
      {loading && <div className="text-sm text-[var(--ink-500)] py-6 text-center">{t("Đang tải...")}</div>}
      {!loading && error && !d && <div className="text-sm text-[var(--coral-600)] py-6 text-center">{error}</div>}
      {!loading && resp && !resp.found && (
        <div className="text-sm text-[var(--coral-600)] py-6 text-center">{t("Không tìm thấy case với ID này.")}</div>
      )}
      {!loading && d && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--ink-500)]">
            <span>{t("Đã lưu về server lúc {a}", { a: fmtDateTime(resp?.syncedAt) })}</span>
            <button
              onClick={handleSync}
              disabled={syncing || remainingS > 0}
              className="focus-ring rounded-lg border border-[var(--line)] px-2.5 py-1 font-semibold text-[var(--ocean-700)] hover:bg-[var(--ocean-100)]/40 disabled:opacity-50"
            >
              {syncing ? t("Đang đồng bộ...") : remainingS > 0 ? t("Đồng bộ lại ({a}s)", { a: remainingS }) : t("Đồng bộ lại")}
            </button>
          </div>
          {error && <div className="text-[11px] text-[var(--coral-600)]">{error}</div>}

          <Section title={t("Thông tin chung")}>
            <Field label={t("Khách hàng")} value={d.khach_hang} />
            <Field label={t("KTV xử lý")} value={d.ky_thuat_vien} />
            <Field label={t("Serial sản phẩm")} value={d.seri_san_pham} mono />
            <Field label={t("Đối tác ghi nhận")} value={d.doi_tac} />
            <Field label={t("Khu vực")} value={`${shortKhuVuc(d.khu_vuc)}${d.tinh ? " · " + d.tinh : ""}${d.quan_huyen ? " · " + d.quan_huyen : ""}`} />
            <Field label={t("Tiến độ hoàn thành")} value={d.tien_do_hoan_thanh} />
            <Field label={t("Ngày import")} value={fmtDateTime(d.ngay_import)} />
            <Field label={t("Cập nhật gần nhất")} value={fmtDateTime(d.ngay_cap_nhat_gan_nhat)} />
            <Field label={t("Đúng hạn / Xử lý 24h")} value={[d.dung_han, d.xu_ly_24h_bucket].filter(Boolean).join(" · ") || null} />
          </Section>

          <Section title={t("Sản phẩm")}>
            <Field label={t("Hãng")} value={d.hang} />
            <Field label={t("Sản phẩm bảo hành")} value={d.san_pham_bao_hanh} />
            <Field label={t("Ngành / loại ngành")} value={[d.nganh, d.loai_nganh].filter(Boolean).join(" · ") || null} />
            <Field label={t("Nhóm sản phẩm")} value={d.nhom_san_pham} />
            <Field label={t("Nhóm khách hàng")} value={d.nhom_kh} />
            <Field label={t("Ngày mua")} value={fmtDate(d.ngay_mua)} />
            <Field label={t("Hình thức bảo hành")} value={d.hinh_thuc_bao_hanh} />
          </Section>

          <Section title={t("Yêu cầu & xử lý")}>
            <Field label={t("Nhóm yêu cầu")} value={d.nhom_yeu_cau} />
            <Field label={t("Loại yêu cầu")} value={d.loai_yeu_cau} />
            <Field label={t("Mô tả lỗi")} value={d.mo_ta_loi} />
            <Field label={t("Lưu ý lỗi linh kiện")} value={d.luu_y_loi_linh_kien} />
            <Field label={t("Cách thức xử lý")} value={d.cach_thuc_xu_ly} />
            <Field label={t("Lý do quá hạn")} value={d.ly_do_qua_han} />
            <Field label={t("Lý do hủy")} value={d.ly_do_huy} />
            <div className="col-span-2">
              <Field label={t("Nội dung đã xử lý")} value={d.noi_dung_xu_ly} />
            </div>
          </Section>

          <Section title={t("Thời gian")}>
            <Field label={t("CSKH tiếp nhận")} value={fmtDateTime(d.thoi_gian_cskh_tiep_nhan)} />
            <Field label={t("Hẹn xử lý")} value={fmtDateTime(d.thoi_gian_hen_xu_ly)} />
            <Field label={t("Hoàn thành")} value={fmtDateTime(d.thoi_gian_hoan_thanh)} />
          </Section>

          {(d.link_hinh_anh ?? []).length > 0 && (
            <div className="rounded-xl border border-[var(--line)] p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-500)] mb-2">
                {t("Hình ảnh báo cáo công việc ({a})", { a: d.link_hinh_anh.length })}
              </div>
              <div className="flex flex-wrap gap-2">
                {d.link_hinh_anh.map((url, i) => (
                  <ImageThumb key={url + i} url={url} alt={t("Ảnh báo cáo {a}", { a: i + 1 })} className="w-20 h-20 object-cover rounded-lg border border-[var(--line)]" />
                ))}
              </div>
            </div>
          )}

          {giaiTrinh.length > 0 && (
            <div className="rounded-xl border border-[var(--line)] p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-500)] mb-2">{t("Lịch sử giải trình chậm trễ")}</div>
              <ul className="space-y-1.5">
                {giaiTrinh.map((g, i) => (
                  <li key={i} className="text-[12px] text-[var(--ink-700)]">
                    <span className="font-semibold">{g.ly_do_cham}</span>
                    {g.noi_dung ? `: ${g.noi_dung}` : ""}
                    <span className="text-[var(--ink-400)]"> — {fmtDateTime(g.ngay_giai_trinh)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Section title={t("Tài chính")}>
            <Field label={t("Định giá sản phẩm")} value={<Money>{fmtVND(d.dt_san_pham)}</Money>} />
            <Field label={t("Định giá linh kiện")} value={<Money>{fmtVND(d.dt_linh_kien)}</Money>} />
            <Field label={t("Định giá dịch vụ")} value={<Money>{fmtVND(d.dt_dich_vu)}</Money>} />
          </Section>

          {d.link_crm && (
            <a href={linkAnToan(d.link_crm)} target="_blank" rel="noreferrer" className="block text-center text-[12px] font-semibold text-[var(--ocean-700)] hover:underline">
              {t("Mở case trên CRM nội bộ ↗")}
            </a>
          )}
        </div>
      )}
    </Modal>
  );
}
