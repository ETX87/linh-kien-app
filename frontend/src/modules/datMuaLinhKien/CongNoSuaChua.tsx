import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { t } from "../../i18n";
import { chuanMaDonBh, laDonSuaChua, laMaDonBhApp, laHoTroSuaChua0d, laMuaHangSuaChua, loaiDeXuatTheoDonBh, chinhSachMacDinh } from "./helpers";
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
  // v1.508 (app doi tra v1.142): Hang / Doi tac / con-het bao hanh do Admin BH chot -> loai de xuat (loaiDeXuatTheoDonBh).
  hang?: string | null;
  doi_tac?: string | null;
  doi_tac_karofi?: number | null;
  loai_bao_hanh?: string | null;
}

// TT+Mail duyet tu dien theo loai cap linh kien sua chua.
const ttDuyetTheoLoai = (lde: string, tenNv: string, doiTac?: string | null) => {
  const nv = tenNv ? ` cho NV ${tenNgan(tenNv)}` : "";
  if (laHoTroSuaChua0d(lde)) return `Xuất hỗ trợ sửa chữa 0 đồng${doiTac ? ` (${doiTac}, trong BH)` : ""}${nv}`;
  if (laMuaHangSuaChua(lde)) return `Mua hàng sửa chữa (hết bảo hành)${nv}`;
  return `Xuất công nợ sửa chữa${nv}`;
};
const nhanBh = (r: DonBh) =>
  [r.hang && `Hãng ${r.hang}`, r.doi_tac && `Đối tác ${r.doi_tac}`, r.loai_bao_hanh === "trong_bh" ? "Còn bảo hành" : r.loai_bao_hanh === "ngoai_bh" ? "Hết bảo hành" : null]
    .filter(Boolean).join(" · ");

// v1.502 - "Danh sách ID lựa chọn cho nv sửa chữa chỉ hiện theo đúng case họ đang nhận trên app đổi trả. case này không có thì không hiện":
// danh sach chon CHI la don vi NV nhan hang dang sua (app doi tra: nguoi_sua_chua = NV, dang sua) - go chu chi LOC trong danh sach nay (ma don /
// ma case SC), KHONG tim rong ra don cua NV khac / da qua buoc sua nua. Ma khong co trong danh sach van go tay duoc (don ngoai app doi tra).
export function useGoiYDonBh(email: string, bat: boolean) {
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
  // v1.508: loai de xuat do HE THONG chon theo don bao hanh (server cung ap lai luc tao don).
  const lde = loaiDeXuatTheoDonBh(r) ?? d.loai_de_xuat;
  const moi = {
    ma_yeu_cau_su_co: r.case_id ?? "",
    tt_mail_duyet: ttDuyetTheoLoai(lde, tenNv, r.doi_tac),
    tt_khach_hang: r.ten_khach_hang ?? "",
    ghi_chu: [`Đơn sửa chữa ${r.id}`, r.case_id && `case ${r.case_id}`, r.san_pham_bh ?? r.ten_lk, r.ten_lk && r.san_pham_bh && r.ten_lk.trim().toLowerCase() !== r.san_pham_bh.trim().toLowerCase() ? `LK gửi: ${r.ten_lk}` : null]
      .filter(Boolean).join(" · "),
  };
  const cu = d.bh_tu_dien;
  const patch: Partial<DonHangDraft> = { bh_tu_dien: moi };
  if (lde !== d.loai_de_xuat) {
    patch.loai_de_xuat = lde;
    patch.chinh_sach = chinhSachMacDinh(lde);
  }
  for (const k of ["ma_yeu_cau_su_co", "tt_mail_duyet", "tt_khach_hang", "ghi_chu"] as const) {
    const hienTai = (d[k] ?? "").trim();
    if (!hienTai || (cu && hienTai === cu[k].trim())) patch[k] = moi[k];
  }
  return patch;
}

// v1.510 (chot 2026-11-17 - "khi tạo đơn trên app linh kiện, nv sửa chữa có thể chọn nhầm loại đề xuất => dựa vào thông tin case nv chọn =>
// nếu sai loại đề xuất => hiện cảnh báo nhắc nhở, ví dụ: đây là case bảo hành của đối tác KRF, loại đề xuất nên là "Hỗ trợ sửa chữa 0 đồng"..."):
// don bao hanh khop trong danh sach goi y (ma don / ma don cha) + loai dang chon khac loai theo don -> cau nhac + loai dung. Dung CHUNG o ma don BH
// (desktop + mobile) va khoi "Cảnh báo" cot phai form desktop. v1.547: server KHONG ghi de nua - giu loai nguoi dat, luu loai_goi_y de canh bao.
export function donBhKhop(rows: DonBh[] | undefined, ma: string | null | undefined): DonBh | undefined {
  const m = (ma ?? "").trim().toUpperCase();
  return m ? rows?.find((r) => r.id === m || r.parent_id === m) : undefined;
}
export function canhBaoLoaiDonBh(khop: DonBh | undefined, lde: string): { loaiDung: string; text: string } | null {
  if (!khop || !laDonSuaChua(lde)) return null;
  const loaiDung = loaiDeXuatTheoDonBh(khop);
  if (!loaiDung || loaiDung === lde) return null;
  const doiTac = khop.doi_tac ? `${t("đối tác")} ${khop.doi_tac}` : t("đối tác");
  const lyDo = laMuaHangSuaChua(loaiDung)
    ? t("Đây là case đã HẾT bảo hành")
    : laHoTroSuaChua0d(loaiDung)
      ? `${t("Đây là case bảo hành (còn BH) của")} ${doiTac} (Karofi)`
      : `${t("Đây là case bảo hành (còn BH) của")} ${doiTac} (${t("ngoài Karofi")})`;
  return { loaiDung, text: `${lyDo} — ${t("hệ thống gợi ý loại")} "${loaiDung}", ${t("bạn đang chọn")} "${lde}".` };
}
const giaiThichLoai = (lde: string) =>
  laMuaHangSuaChua(lde)
    ? t("NV chuyển tiền như đơn mua hàng thường, không xác nhận xác / trừ công nợ.")
    : laHoTroSuaChua0d(lde)
      ? t("0 đồng, không tính công nợ NV — Admin BH vẫn xác nhận xác.")
      : t("Linh kiện ký gửi — Admin BH xác nhận xác rồi trừ công nợ NV.");

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
  const laSuaChua = laDonSuaChua(d.loai_de_xuat);
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
  const khop = donBhKhop(dsRows, maHoa);
  const ldeTheoBh = khop ? loaiDeXuatTheoDonBh(khop) : null;
  const saiLoai = canhBaoLoaiDonBh(khop, d.loai_de_xuat);
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
                {nhanBh(r) && <div className="text-[11px] text-[var(--ink-400)] truncate">{nhanBh(r)}{loaiDeXuatTheoDonBh(r) ? ` → ${loaiDeXuatTheoDonBh(r)}` : ""}</div>}
                {r.ten_khach_hang && <div className="text-[11px] text-[var(--ink-400)] truncate">{r.ten_khach_hang}</div>}
              </button>
            ))
          )}
        </div>
      )}
      <div className={`mt-1 text-[11px] ${khop ? "text-[var(--color-success-strong)]" : "text-[var(--ink-500)]"}`}>
        {goiY || t("Mã đơn bảo hành đang sửa cần linh kiện này — dùng để đối trừ công nợ khi linh kiện đã thay thế.")}
      </div>
      {saiLoai ? (
        <div role="alert" className="mt-1.5 rounded-lg border-l-[3px] border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-2.5 py-2 text-[12px] leading-snug text-[var(--color-warning-strong)]">
          <div className="font-semibold">⚠ {t("Loại đề xuất khác loại hệ thống gợi ý theo case")}</div>
          <div className="mt-0.5">{saiLoai.text}</div>
          <div className="mt-0.5 text-[11px] opacity-90">{nhanBh(khop!)} · {giaiThichLoai(saiLoai.loaiDung)}</div>
          <div className="mt-0.5 text-[11px] font-semibold">{t("Bạn vẫn được giữ loại đang chọn (VD: sản phẩm hết bảo hành nhưng linh kiện bên trong còn bảo hành). Đơn sẽ được gắn cảnh báo cho Kế toán, Kho và Admin BH thấy.")}</div>
          <button
            type="button"
            onClick={() => onChange(tuDienTheoDon(d, khop!, tenNv))}
            className="focus-ring mt-1.5 rounded-md bg-[var(--color-warning)] px-2.5 py-1 text-[12px] font-semibold text-white hover:opacity-90"
          >
            {t("Đổi sang")} "{saiLoai.loaiDung}"
          </button>
        </div>
      ) : khop && (
        <div className="mt-1 text-[11px] text-[var(--ink-500)]">
          {nhanBh(khop) || t("Đơn bảo hành chưa có Hãng / Đối tác / bảo hành")}
          {ldeTheoBh ? ` — ${t("loại đề xuất theo đơn bảo hành")}` : ` — ${t("chưa đủ thông tin, giữ loại đang chọn")}`}
        </div>
      )}
    </div>
  );
}

// v1.547 (2026-11-21, "sẽ cho ktv chọn lại, nhưng ... hiện cảnh báo rất rõ ràng cho các đơn vị, bộ phận liên quan biết linh kiện này đang được
// chọn loại đề xuất khác với đề xuất thực tế phải chọn"): don co dat_don_hang.loai_goi_y (server luu luc tao don) -> chip o danh sach / dong
// don trong phieu + khoi do o chi tiet don.
type CoLoaiGoiY = { loai_de_xuat?: string | null; loai_goi_y?: string | null; loai_goi_y_ly_do?: string | null };
export function LoaiGoiYBadge({ d }: { d: CoLoaiGoiY }) {
  if (!d.loai_goi_y) return null;
  return (
    <span
      title={`${t("Hệ thống gợi ý")}: ${d.loai_goi_y}${d.loai_goi_y_ly_do ? ` — ${d.loai_goi_y_ly_do}` : ""}`}
      className="ml-1 inline-flex items-center rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-danger-strong)] whitespace-nowrap"
    >
      ⚠ {t("Khác loại gợi ý")}
    </span>
  );
}
export function LoaiGoiYKhoi({ d }: { d: CoLoaiGoiY }) {
  if (!d.loai_goi_y) return null;
  return (
    <div role="alert" className="mb-3 rounded-lg border-l-[3px] border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-3 py-2.5 text-[13px] leading-snug text-[var(--color-danger-strong)]">
      <div className="font-semibold">⚠ {t("Loại đề xuất KHÁC loại hệ thống gợi ý theo đơn bảo hành")}</div>
      <div className="mt-1">
        {t("Đang chọn")}: <b>{d.loai_de_xuat}</b> · {t("Hệ thống gợi ý")}: <b>{d.loai_goi_y}</b>
      </div>
      {d.loai_goi_y_ly_do && <div className="mt-0.5 text-[12px]">{t("Căn cứ gợi ý")}: {d.loai_goi_y_ly_do}</div>}
      <div className="mt-1 text-[12px]">
        {giaiThichLoai(d.loai_de_xuat ?? "")} {t("Người đặt đã chủ động chọn khác (VD: sản phẩm hết bảo hành nhưng linh kiện bên trong còn bảo hành) — Kế toán, Kho, Admin BH kiểm tra lại trước khi xử lý.")}
      </div>
    </div>
  );
}
