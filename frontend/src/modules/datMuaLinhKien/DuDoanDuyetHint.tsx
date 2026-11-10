import { Modal } from "../../components/ui/Modal";
import { Btn } from "../../components/ui/Btn";
import type { KiemTraDong, KetQuaTaoDon } from "./types";
import { t } from "../../i18n";
import { giaiThichTrangThai, TONE_LY_DO } from "./LyDoTrangThai";
import { trangThaiLabel } from "./helpers";
import { DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL } from "./constants";

// Ket qua DU KIEN cua tung dong ngay luc soan don (viet lai 2026-10-14, tu dong duyet 100% - truoc goi GET /du-doan-duyet chi xem
// ton kho). Nguon: POST /dat-mua-lk/phieu-dat/kiem-tra (useTaoDonForm.ts ketQuaTheoDong) - CUNG bo quyet dinh voi luc tao that
// (backend lib/tuDongDuyet.ts danhGiaPhieu), nen dieu KTV thay o day = dieu xay ra khi bam "Tạo đơn".

const KHUNG = "mt-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium";
const TONE = {
  ok: "border-[var(--color-success)]/30 bg-[var(--color-success-soft)] text-[var(--color-success-strong)]",
  canhBao: "border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]",
  chan: "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)] font-bold",
  tim: "border-[var(--color-purple)]/30 bg-[var(--color-purple-soft)] text-[var(--color-purple-strong)]",
};

function conTon(r: KiemTraDong): string {
  return t("còn {a}/{b}", { a: Math.max(0, r.ton ?? 0), b: r.so_luong });
}

// Dong PHU (v1.455, "tài khoản gs đặt hàng không thấy hiện cảnh báo linh kiện thiếu hàng giống bên admin"): don di "Chờ GS duyệt" (vuot tran -
// hay gap khi GS dat ho KTV) / "Chờ TBP" truoc day CHI hien cau duyet, che mat viec kho thieu hang - gio luon bao them thieu hang (ton kho
// cong ty la dieu kien xet NGAY SAU khi GS / TBP duyet).
function thieuHangPhu(r: KiemTraDong, khuVuc?: string | null): string | null {
  if (r.loi || r.nguon_ton !== "kho" || r.ton == null || r.ton >= r.so_luong) return null;
  if (r.trang_thai !== "Cho GS duyet" && r.trang_thai !== "Cho TBP xac nhan") return null;
  return t("⚠ Kho {kv} thiếu hàng ({a}) — sau khi duyệt, đơn sẽ {b}.", {
    kv: khuVuc ? t("khu vực {a}", { a: khuVuc }) : t("khu vực"),
    a: conTon(r),
    b: r.bat_buoc_chuyen_tien ? t("vào phiếu chờ chuyển tiền") : t("chờ hàng"),
  });
}

// 1 cau mo ta + tone cho 1 dong ket qua.
export function moTaKetQua(r: KiemTraDong): { tone: keyof typeof TONE; text: string } | null {
  if (r.loi) return { tone: "chan", text: "✕ " + (r.thong_diep ?? r.loi) };
  switch (r.trang_thai) {
    case "TN da duyet":
      return {
        tone: "ok",
        text:
          r.nguon_ton === "ktv"
            ? t("✅ Tồn kho của KTV còn đủ — đơn tự động duyệt và vào phiếu xuất.")
            : r.bat_buoc_chuyen_tien
              ? t("✅ Kho khu vực còn đủ hàng — đơn tự động duyệt, vào phiếu chờ chuyển tiền.")
              : t("✅ Kho khu vực còn đủ hàng — đơn tự động duyệt và vào phiếu xuất."),
      };
    case "Cho thanh toan":
      return {
        tone: "canhBao",
        text: t("⚠ Kho khu vực thiếu hàng ({a}) — đơn vào phiếu để chuyển tiền trước; Kế toán xác nhận tiền xong, nếu vẫn thiếu đơn chuyển sang chờ hàng.", { a: conTon(r) }),
      };
    case "Cho hang":
      return { tone: "canhBao", text: t("⚠ Kho khu vực thiếu hàng ({a}) — đơn sẽ chờ hàng (Kho xác nhận chờ hàng hoặc từ chối).", { a: conTon(r) }) };
    case "Cho GS duyet":
      return { tone: "tim", text: t("⚠ Vượt trần công nợ — đơn chờ Giám sát khu vực duyệt (nhập mã EO).") };
    case "Cho TBP xac nhan":
      return { tone: "canhBao", text: t("🔒 Linh kiện đặc thù — đơn chờ TBP DVBH duyệt.") };
    default:
      return null;
  }
}

export function DuDoanDuyetHint({ ketQua, khuVuc }: { ketQua: KiemTraDong[] | undefined; khuVuc?: string | null }) {
  if (!ketQua?.length) return null;
  const nhieu = ketQua.length > 1; // dong combo -> 1 ket qua cho moi LK thanh phan
  return (
    <>
      {ketQua.map((r, i) => {
        const m = moTaKetQua(r);
        if (!m) return null;
        const phu = thieuHangPhu(r, khuVuc);
        // Kho da kiem (khu vuc) - de nguoi dat hieu vi sao 2 tai khoan dat cung 1 ma lai ra ket qua ton khac nhau (khu vuc cua don khac nhau).
        const kvKho = r.nguon_ton === "kho" && khuVuc && !r.loi ? ` (${t("kho khu vực {a}", { a: khuVuc })})` : "";
        return (
          <div key={i}>
            <div className={`${KHUNG} ${TONE[m.tone]}`} role={m.tone === "chan" ? "alert" : undefined}>
              {nhieu && <span className="font-mono font-semibold">{r.ma_lk}: </span>}
              {m.text}
              {!phu && kvKho}
            </div>
            {phu && <div className={`${KHUNG} ${TONE.canhBao}`}>{nhieu && <span className="font-mono font-semibold">{r.ma_lk}: </span>}{phu}</div>}
          </div>
        );
      })}
    </>
  );
}

// Hop hoi lai truoc khi gui khi co dong KHONG tu duyet ngay (thieu hang / vuot tran) - 2 lua chon: Dat tiep / Quay lai (chot 2026-10-14).
export function XacNhanTaoDonModal({
  open, dong, onDatTiep, onQuayLai, dangGui,
}: {
  open: boolean;
  dong: (KiemTraDong & { idx: number })[];
  onDatTiep: () => void;
  onQuayLai: () => void;
  dangGui: boolean;
}) {
  return (
    <Modal open={open} onClose={onQuayLai} title={t("Đơn chưa thể duyệt ngay")}>
      <div className="space-y-3 text-sm">
        <div className="text-[var(--color-text-secondary)]">{t("Một số dòng sẽ không được duyệt tự động:")}</div>
        <ul className="space-y-1.5">
          {dong.map((r, i) => {
            const m = moTaKetQua(r);
            return (
              <li key={i} className={`rounded-lg border px-2.5 py-1.5 text-[12px] ${m ? TONE[m.tone] : ""}`}>
                <span className="font-semibold">{t("Dòng {n}", { n: r.idx + 1 })} · <span className="font-mono">{r.ma_lk}</span> × {r.so_luong}</span>
                <div>{m?.text}</div>
              </li>
            );
          })}
        </ul>
        <div className="text-[var(--color-text-secondary)]">{t("Bạn vẫn muốn đặt tiếp, hay quay lại sửa đơn?")}</div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" size="sm" onClick={onQuayLai}>{t("Quay lại")}</Btn>
          <Btn size="sm" onClick={onDatTiep} loading={dangGui} disabled={dangGui}>{t("Đặt tiếp")}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// Hop "Kết quả đặt hàng" chuyen sang KetQuaTaoDon.tsx (2026-11-10 - luon hien, kem phieu xuat + quy du).
export { KetQuaTaoDonModal } from "./KetQuaTaoDon";
