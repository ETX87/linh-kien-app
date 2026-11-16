import { useEffect, useState } from "react";
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

function useGoiYDonBh(email: string, q: string, bat: boolean) {
  const [qTre, setQTre] = useState(q);
  useEffect(() => {
    const h = setTimeout(() => setQTre(q.trim().length >= 2 ? q.trim() : ""), 300);
    return () => clearTimeout(h);
  }, [q]);
  return useQuery({
    queryKey: ["don-bh-goi-y", email, qTre],
    queryFn: () =>
      api.get<{ rows: DonBh[]; ket_noi: boolean }>(
        `/dat-mua-lk/don-bh-goi-y?nguoi_nhan_hang=${encodeURIComponent(email)}${qTre ? `&q=${encodeURIComponent(qTre)}` : ""}`,
      ),
    enabled: bat && !!email,
    staleTime: 60_000,
  });
}

// Don may: ten LK (= may gui sua) thuong TRUNG ten san pham bao hanh -> bo phan trung (so khong phan biet hoa/thuong).
const moTa = (r: DonBh) =>
  [r.case_id, r.ten_lk ?? r.ma_lk, r.san_pham_bh]
    .filter((v, i, a): v is string => !!v && a.findIndex((x) => (x ?? "").trim().toLowerCase() === v.trim().toLowerCase()) === i)
    .join(" · ");

export function MaDonBhInput({
  d,
  onChange,
  email,
  id,
  cao = "h-9",
}: {
  d: DonHangDraft;
  onChange: (v: string) => void;
  email: string;
  id?: string;
  cao?: string;
}) {
  const laSuaChua = laCongNoSuaChua(d.loai_de_xuat);
  const v = d.bh_don_vi_id ?? "";
  const [mo, setMo] = useState(false);
  // 2 truy van: danh sach don NV dang sua (luon tai khi dong la CÔNG NỢ SỬA CHỮA - de nhan dien ma da chon) + tim theo tu khoa khi dang go.
  const ds = useGoiYDonBh(email, "", laSuaChua);
  const dsRows = ds.data?.rows ?? [];
  const maHoa = v.trim().toUpperCase();
  const timDangBat = mo && v.trim().length >= 2 && !dsRows.some((r) => r.id === maHoa);
  const tim = useGoiYDonBh(email, timDangBat ? v : "", laSuaChua && timDangBat);
  if (!laSuaChua) return null;
  const data = timDangBat ? tim.data : ds.data;
  const isFetching = timDangBat ? tim.isFetching : ds.isFetching;
  const rows = data?.rows ?? [];
  const khop = [...dsRows, ...(tim.data?.rows ?? [])].find((r) => r.id === maHoa || r.parent_id === maHoa);
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
          onChange(e.target.value);
          setMo(true);
        }}
        onFocus={() => setMo(true)}
        onBlur={() => setTimeout(() => setMo(false), 150)}
        maxLength={40}
        placeholder={t("Chọn đơn đang sửa hoặc gõ mã (VD: DH-000123-1)")}
        className={`focus-ring w-full ${cao} bg-white border rounded-lg px-2.5 text-sm font-mono ${hopLe ? "border-[var(--line)]" : "border-[var(--coral-400)] bg-[var(--coral-100)]/25"}`}
      />
      {mo && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-lg">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-500)] border-b border-[var(--line)]">
            {timDangBat ? t("Kết quả tìm trên app Bảo hành đổi trả") : t("Đơn bảo hành đang sửa")}
            {isFetching && <span className="ml-2 font-normal normal-case">{t("Đang tải…")}</span>}
          </div>
          {rows.length === 0 ? (
            <div className="px-3 py-2.5 text-[12px] text-[var(--ink-500)]">
              {data && !data.ket_noi ? t("Không kết nối được app Bảo hành đổi trả.") : t("Không có đơn phù hợp — cứ gõ tay mã đơn bảo hành.")}
            </div>
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(r.id);
                  setMo(false);
                }}
                className={`block w-full text-left px-3 py-2 border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-100)] ${r.id === maHoa ? "bg-[var(--color-primary-soft)]" : ""}`}
              >
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="font-mono font-semibold text-[var(--color-text)]">{r.id}</span>
                  {r.trang_thai !== "cho_chan_doan" && <span className="text-[11px] text-[var(--ink-400)]">{t("đã qua bước sửa")}</span>}
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
