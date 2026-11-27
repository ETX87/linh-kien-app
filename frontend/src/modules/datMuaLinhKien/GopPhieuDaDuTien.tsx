import type { ReactNode } from "react";
import { fmtVND } from "../../types";
import { Money } from "../../components/ui/Money";
import { t } from "../../i18n";
import type { KiemTraPhieuDat } from "./types";

// CHON TACH / GOP PHIEU KHI DA CO PHIEU DU TIEN (v1.538, chot 2026-11-20 - "khi nhân viên đặt đơn, hiện tại đang tự động tách phiếu xuất nếu đơn có
// tiền với đơn chưa chuyển tiền ... thêm lựa chọn cho người tạo (có muốn tách thành phiếu chờ chuyển/ phiếu đã có đủ tiền không - vì có ktv muốn được
// chuyển về trong cùng 1 lần)"). Nguon: POST /phieu-dat/kiem-tra -> phieu_da_du_tien (phieu dang tao Ke toan DA duyet tien, cung nhom phieu voi dong
// moi). Gop -> gui gop_phieu_da_du_tien, phieu do ve "Chờ KTV chuyển" so con thieu.
// + CHON GOP / TACH DON THIEU HANG (v1.578, 2026-11-27 - "khi tạo đơn, hiện nhắc nhở và cho ktv hoặc người đặt lựa chọn gộp chung 1 phiếu hay tách phiếu
// chứ không tự quyết"): nguon tach_cho_hang; Gop -> gui tach_phieu_cho_hang = false. CA HAI hop deu BAT BUOC chon (null = chua chon -> chan tao don,
// useTaoDonForm.ts chuaChonPhieu). Tach theo loai de xuat / hoa don / KH chuyen khoan van bat buoc (quy tac Ke toan, khong hoi).
export function GopPhieuDaDuTien({
  kiemTra, gop, setGop, gopThieu, setGopThieu, gon = false,
}: {
  kiemTra: KiemTraPhieuDat | null | undefined;
  gop: boolean | null; setGop: (v: boolean) => void;
  gopThieu: boolean | null; setGopThieu: (v: boolean) => void;
  gon?: boolean;
}) {
  const ds = kiemTra?.phieu_da_du_tien ?? [];
  const thieu = kiemTra?.tach_cho_hang ?? [];
  if (!ds.length && !thieu.length) return null;
  const ma = ds.map((p) => p.id).join(", ");
  const maLk = (idx: number[]) => [...new Set(idx.map((i) => kiemTra?.dong[i]?.ma_lk).filter(Boolean))].join(", ");
  const dongThieu = thieu.flatMap((g) => g.dong_thieu);
  const dongCoHang = thieu.flatMap((g) => g.dong_co_hang);
  const phieuMo = [...new Set(thieu.map((g) => g.phieu_mo).filter((x): x is string => !!x))].join(", ");
  return (
    <div className="space-y-2">
      {thieu.length > 0 && (
        <HopChon gon={gon} chuaChon={gopThieu === null}
          tieuDe={t("Có {n} đơn kho thiếu hàng — chọn cách lập phiếu xuất kho", { n: dongThieu.length })}
          moTa={<>
            {t("Thiếu hàng")}: {maLk(dongThieu)}
            {dongCoHang.length > 0 && <span className="block">{t("Có hàng")}: {maLk(dongCoHang)}</span>}
            {phieuMo && <span className="block">{t("Phiếu đang tạo của bạn: {ma}", { ma: phieuMo })}</span>}
          </>}
          luaChon={[
            { chon: gopThieu === true, onChon: () => setGopThieu(true), nhan: t("Gộp chung 1 phiếu (chuyển tiền 1 lần)"),
              giaiThich: t("Đơn có hàng phải chờ đơn thiếu hàng về đủ mới xuất cả phiếu.") },
            { chon: gopThieu === false, onChon: () => setGopThieu(false), nhan: t("Tách phiếu chờ hàng riêng"),
              giaiThich: t("Đơn có hàng được Kế toán xuất trước; đơn thiếu hàng đi phiếu chờ hàng, chuyển tiền riêng.") },
          ]} />
      )}
      {ds.length > 0 && (
        <HopChon gon={gon} chuaChon={gop === null}
          tieuDe={t("Bạn đang có phiếu đã đủ tiền: {ma}", { ma })}
          moTa={ds.map((p) => (
            <span key={p.id} className="block">
              {p.id}: {t("{n} đơn", { n: p.so_don })} · {t("Kế toán đã xác nhận")} <Money>{fmtVND(p.da_thanh_toan)}</Money>
            </span>
          ))}
          luaChon={[
            { chon: gop === true, onChon: () => setGop(true), nhan: t("Gộp vào phiếu đã đủ tiền (nhận hàng 1 lần)"),
              giaiThich: t("Phiếu {ma} sẽ quay về chờ chuyển bổ sung phần tiền tăng thêm; Kế toán xác nhận lại rồi mới xuất cả phiếu.", { ma }) },
            { chon: gop === false, onChon: () => setGop(false), nhan: t("Tách phiếu mới chờ chuyển tiền"),
              giaiThich: t("Phiếu đã đủ tiền được gửi Kế toán xuất hàng ngay, đơn mới đi phiếu riêng.") },
          ]} />
      )}
    </div>
  );
}

function HopChon({ tieuDe, moTa, luaChon, chuaChon, gon }: {
  tieuDe: string; moTa: ReactNode; chuaChon: boolean; gon: boolean;
  luaChon: { chon: boolean; onChon: () => void; nhan: string; giaiThich: string }[];
}) {
  return (
    <div
      className={`rounded-xl border ${chuaChon ? "border-[var(--coral-500)]/60" : "border-[var(--color-primary)]/30"} bg-[var(--color-primary-soft)] ${gon ? "p-2.5" : "p-3"} text-[12px]`}
      role="radiogroup"
    >
      <div className="font-semibold text-[var(--color-text)]">{tieuDe}</div>
      <div className="mt-0.5 text-[11.5px] text-[var(--ink-500)]">{moTa}</div>
      {luaChon.map((l, i) => (
        <label key={i} className={`${i ? "mt-1.5" : "mt-2"} flex items-start gap-2 cursor-pointer`}>
          <input type="radio" className="mt-0.5" checked={l.chon} onChange={l.onChon} />
          <span>
            <b>{l.nhan}</b>
            <span className="block text-[11.5px] text-[var(--ink-500)]">{l.giaiThich}</span>
          </span>
        </label>
      ))}
      {chuaChon && <div className="mt-1.5 text-[11.5px] font-medium text-[var(--coral-700)]">⚠ {t("Chọn 1 cách trước khi tạo đơn")}</div>}
    </div>
  );
}
