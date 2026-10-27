import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Btn } from "../../components/ui/Btn";
import { useChanDong } from "../../components/ui/chanDong";
import { t } from "../../i18n";
import type { TaoDonForm } from "./useTaoDonForm";

// 2 popup ve don dang soan do (chot 2026-10-27): (1) mo form ma con nhap lan truoc (app tat bat ngo / da chon "Lưu lại") -> hoi mo lai;
// (2) dong form khi con noi dung chua tao -> hoi luu lai cho lan sau (Không lưu = xoa). Dat BEN TRONG Modal / man mobile de chan dong
// (chanDong.tsx) - dung chung TaoDonTab (desktop) + TaoDonMobileScreen.
export function NhapTaoDonHoi({ form }: { form: TaoDonForm }) {
  const [hoiDong, setHoiDong] = useState<((dong: boolean) => void) | null>(null);
  // Khong hoi khi tai lai trang (nhap da tu luu - mo lai se hoi khoi phuc).
  useChanDong(form.coNoiDungChuaTao, () => new Promise<boolean>((resolve) => setHoiDong(() => resolve)), false);
  const traLoi = (dong: boolean) => {
    hoiDong?.(dong);
    setHoiDong(null);
  };
  // Mo popup khoi phuc SAU lan render dau: Modal form (portal) phai gan vao body truoc, popup gan sau moi nam tren (cung z-50).
  const [daGan, setDaGan] = useState(false);
  useEffect(() => setDaGan(true), []);
  const nhap = daGan ? form.hoiKhoiPhuc : null;
  const gio = nhap ? new Date(nhap.luc).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";
  const soDong = nhap ? nhap.drafts.length : 0;
  return (
    <>
      <Modal open={!!nhap} onClose={form.boQuaNhapCu} title={t("Có đơn tạo dở lần trước")} width="max-w-md">
        <div className="space-y-3 text-sm">
          <p>
            {t("Bạn có thông tin tạo đơn lần trước chưa tạo xong (lưu lúc {gio}, {n} dòng linh kiện). Bạn có muốn mở lại thông tin đã tạo dở không?", { gio, n: soDong })}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Btn size="sm" variant="ghost" onClick={form.boQuaNhapCu}>{t("Không, soạn mới")}</Btn>
            <Btn size="sm" onClick={form.moLaiNhap}>{t("Mở lại đơn tạo dở")}</Btn>
          </div>
        </div>
      </Modal>
      <Modal open={!!hoiDong} onClose={() => traLoi(false)} title={t("Thông tin đơn chưa được tạo")} width="max-w-md">
        <div className="space-y-3 text-sm">
          <p>{t("Đơn đang soạn chưa được tạo. Bạn có muốn lưu lại thông tin này cho lần sau không?")}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Btn size="sm" variant="ghost" onClick={() => traLoi(false)}>{t("Tiếp tục soạn")}</Btn>
            <Btn
              size="sm"
              variant="danger"
              onClick={() => {
                form.xoaNhap();
                traLoi(true);
              }}
            >
              {t("Không lưu")}
            </Btn>
            <Btn
              size="sm"
              onClick={() => {
                form.luuNhapNgay();
                traLoi(true);
              }}
            >
              {t("Lưu lại cho lần sau")}
            </Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}
