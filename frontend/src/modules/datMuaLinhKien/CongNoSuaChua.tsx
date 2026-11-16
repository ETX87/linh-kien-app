import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { t } from "../../i18n";
import { chuanMaDonBh, laCongNoSuaChua, laMaDonBhApp } from "./helpers";
import type { DonHangDraft } from "./types";

// CÔNG NỢ SỬA CHỮA (chot 2026-11-16, v1.495 + v1.496, migration 0119/0120): NV sua chua van phong dat linh kien ky gui de sua san pham bao
// hanh. Moi dong BAT BUOC "Mã đơn bảo hành". v1.496 ("chọn ô bảo hành lấy thẳng từ app đổi trả nhưng vẫn cho nhập tay nếu không có (vì có thể
// đặt cho đơn không thuộc app đổi trả)"): o co GOI Y tu app "Bảo hành đổi trả 3T" (GET /dat-mua-lk/don-bh-goi-y -> Service Binding suachua):
// bo trong = don vi NV nhan hang dang sua, go >= 2 ky tu = tim theo ma don / ma case; khong co trong danh sach van go tay ma bat ky (<= 40 ky
// tu). Server tra lai luc tao don -> bh_lien_ket (giai doan sau chi tu tru cong no voi don lien ket). Dung CHUNG form desktop + mobile.

interface DonBh {
  id: string;
  parent_id: string;
  case_id: string | null;
  ma_lk: string | null;
  ten_lk: string | null;
  san_pham_bh: string | null;
  ten_khach_hang: string | null;
  trang_thai: string;
}

// v1.502 - "Danh sách ID lựa chọn cho nv sửa chữa chỉ hiện theo đúng case họ đang nhận trên app đổi trả. case này không có thì không hiện":
// danh sach chon CHI la don vi NV nhan hang dang sua (app doi tra: nguoi_sua_chua = NV, dang sua) - go chu chi LOC trong danh sach nay (ma don /
// ma case SC), KHONG tim rong ra don cua NV khac / da qua buoc sua nua. Ma khong co trong danh sach van go tay duoc (don ngoai app doi tra).
function useGoiYDonBh(email: string, bat: boolean) {
  return useQuery({
    queryKey: ["don-bh-goi-y", email, ""],
    queryFn: () => api.get<{ rows: DonBh[]; ket_noi: boolean }>(`/dat-mua-lk/don-bh-goi-y?nguoi_nhan_hang=${encodeURIComponent(email)}`),
    enabled: bat && !!email,
    staleTime: 60_000,
  });
}

// Don may: ten LK (= may gui sua) thuong TRUNG ten san pham bao hanh -> bo phan trung (so khong phan biet hoa/thuong).
// Ten ngan tu ten hien thi danh ba ("(ma) KTV Long An - Nguyễn Văn An" / "KTV Demo – Nguyễn Văn An" -> "Nguyễn Văn An").
const tenNgan = (s: string) => s.split(/\s[-–]\s/).pop()!.trim() || s;

// v1.499 - "khi chọn mã sửa chữa liên quan, tự động điền các cột thông tin ... Mã sự cố: SCxxxxxx / TT duyệt mail: Xuất công nợ sửa chữa cho nv
// nguyễn văn an / TT khách hàng: Tên KH / Ghi chú: (thông tin mã sửa chữa từ hệ thống app) => các thông tin này mặc định điền".
// O nao nguoi dung da tu go (khac gia tri tu dien lan truoc) thi GIU NGUYEN; o trong / dang la gia tri tu dien thi thay.
function tuDienTheoDon(d: DonHangDraft, r: DonBh, tenNv: string): Partial<DonHangDraft> {
  const moi = {
    ma_yeu_cau_su_co: r.case_id ?? "",
    tt_mail_duyet: tenNv ? `Xuất công nợ sửa chữa cho NV ${tenNgan(tenNv)}` : "Xuất công nợ sửa chữa",
    tt_khach_hang: r.ten_khach_hang ?? "",
    ghi_chu: [`Đơn sửa chữa ${r.id}`, r.case_id && `case ${r.case_id}`, r.san_pham_bh ?? r.ten_lk, r.ten_lk && r.san_pham_bh && r.ten_lk.trim().toLowerCase() !== r.san_pham_bh.trim().toLowerCase() ? `LK gửi: ${r.ten_lk}` : null]
      .filter(Boolean).join(" · "),
  };
  const cu = d.bh_tu_dien;
  const patch: Partial<DonHangDraft> = { bh_tu_dien: moi };
  for (const k of ["ma_yeu_cau_su_co", "tt_mail_duyet", "tt_khach_hang", "ghi_chu"] as const) {
    const hienTai = (d[k] ?? "").trim();
    if (!hienTai || (cu && hienTai === cu[k].trim())) patch[k] = moi[k];
  }
  return patch;
}

const moTa = (r: DonBh) =>
  [r.case_id, r.ten_lk ?? r.ma_lk, r.san_pham_bh]
    .filter((v, i, a): v is string => !!v && a.findIndex((x) => (x ?? "").trim().toLowerCase() === v.trim().toLowerCase()) === i)
    .join(" · ");

export function MaDonBhInput({
  d,
  onChange,
  email,
  tenNv = "",
  id,
  cao = "h-9",
}: {
  d: DonHangDraft;
  // Go tay -> chi bh_don_vi_id; chon 1 don trong danh sach -> kem cac o tu dien (tuDienTheoDon).
  onChange: (patch: Partial<DonHangDraft>) => void;
  email: string;
  tenNv?: string;
  id?: string;
  cao?: string;
}) {
  const laSuaChua = laCongNoSuaChua(d.loai_de_xuat);
  const v = d.bh_don_vi_id ?? "";
  const [mo, setMo] = useState(false);
  const ds = useGoiYDonBh(email, laSuaChua);
  const dsRows = ds.data?.rows ?? [];
  const maHoa = v.trim().toUpperCase();
  // Dang go (chua trung dung 1 ma trong danh sach) -> loc theo ma don / ma don cha / ma case.
  const dangLoc = !!maHoa && !dsRows.some((r) => r.id === maHoa);
  if (!laSuaChua) return null;
  const data = ds.data;
  const isFetching = ds.isFetching;
  const rows = dangLoc
    ? dsRows.filter((r) => [r.id, r.parent_id, r.case_id ?? ""].some((x) => x.toUpperCase().includes(maHoa)))
    : dsRows;
  const khop = dsRows.find((r) => r.id === maHoa || r.parent_id === maHoa);
  const hopLe = !!chuanMaDonBh(v);
  const goiY = !data
    ? ""
    : !data.ket_noi
      ? t("Không kết nối được app Bảo hành đổi trả — nhập tay mã đơn.")
      : khop
        ? `✓ ${t("Đơn trên app Bảo hành đổi trả")} · ${moTa(khop)}`
        : laMaDonBhApp(v)
          ? t("Mã dạng app Bảo hành đổi trả — hệ thống kiểm tra lại khi tạo đơn.")
          : v.trim()
            ? t("Nhập tay — đơn ngoài app Bảo hành đổi trả (sau này không tự đối trừ công nợ, Admin BH xử lý tay).")
            : "";

  return (
    <div id={id} className="relative max-w-[460px]">
      <label className={`block text-[11px] font-semibold mb-1 ${hopLe ? "text-[var(--ink-600)]" : "text-[var(--coral-600)]"}`}>{t("Mã đơn bảo hành *")}</label>
      <input
        value={v}
        onChange={(e) => {
          onChange({ bh_don_vi_id: e.target.value });
          setMo(true);
        }}
        onFocus={() => setMo(true)}
        onBlur={() => setTimeout(() => setMo(false), 150)}
        maxLength={40}
        placeholder={t("Chọn đơn đang sửa hoặc gõ mã đơn / mã SC (VD: DH-000123-1, SC2611…)")}
        className={`focus-ring w-full ${cao} bg-white border rounded-lg px-2.5 text-sm font-mono ${hopLe ? "border-[var(--line)]" : "border-[var(--coral-400)] bg-[var(--coral-100)]/25"}`}
      />
      {mo && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-lg">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-500)] border-b border-[var(--line)]">
            {t("Đơn bảo hành NV nhận hàng đang sửa")}
            {isFetching && <span className="ml-2 font-normal normal-case">{t("Đang tải…")}</span>}
          </div>
          {rows.length === 0 ? (
            <div className="px-3 py-2.5 text-[12px] text-[var(--ink-500)]">
              {data && !data.ket_noi
                ? t("Không kết nối được app Bảo hành đổi trả.")
                : dsRows.length === 0
                  ? t("NV nhận hàng không có đơn bảo hành nào đang sửa trên app Bảo hành đổi trả — đơn ngoài app thì gõ tay mã.")
                  : t("Không có đơn đang sửa khớp mã này — đơn ngoài app thì cứ gõ tay mã.")}
            </div>
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ bh_don_vi_id: r.id, ...tuDienTheoDon(d, r, tenNv) });
                  setMo(false);
                }}
                className={`block w-full text-left px-3 py-2 border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-100)] ${r.id === maHoa ? "bg-[var(--color-primary-soft)]" : ""}`}
              >
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="font-mono font-semibold text-[var(--color-text)]">{r.id}</span>
                </div>
                <div className="text-[11.5px] text-[var(--ink-500)] truncate">{moTa(r) || "—"}</div>
                {r.ten_khach_hang && <div className="text-[11px] text-[var(--ink-400)] truncate">{r.ten_khach_hang}</div>}
              </button>
            ))
          )}
        </div>
      )}
      <div className={`mt-1 text-[11px] ${khop ? "text-[var(--color-success-strong)]" : "text-[var(--ink-500)]"}`}>
        {goiY || t("Mã đơn bảo hành đang sửa cần linh kiện này — dùng để đối trừ công nợ khi linh kiện đã thay thế.")}
      </div>
    </div>
  );
}
