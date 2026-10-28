import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Btn } from "../ui/Btn";
import { useToast } from "../ui/Toast";
import { t } from "../../i18n";
import { loiHetHanMucAnh } from "../../lib/hanMucAnh";
import { describeApiError } from "../../modules/datMuaLinhKien/helpers";
import { goiHuongDan, maTuTuKhoa } from "./cayHoiNhanh";
import type { HuongDan } from "./HuongDan";

// "📥 Nạp bộ hướng dẫn" (2026-10-28, phuong an 2 - docs/Phan_luong_hoi_dap_tu_dong.md): tao san cac huong dan ngan cua cay "Hỏi nhanh"
// (cayHoiNhanh.ts). Anh goc o /huong-dan-goi/*.jpg (frontend/public) -> tai len Drive bang CHINH tai khoan nguoi bam (POST /huong-dan/anh),
// roi POST /huong-dan. Huong dan da co (cung ma "#..." trong tu_khoa, ke ca dang tat) bo qua -> bam lai nap tiep phan con thieu, khong trung.
// Het luot anh trong ngay (Mua hang 20 anh/ngay; Admin khong gioi han) -> dung, bao so da nap.
export function NapGoiHuongDan({ dangCo }: { dangCo: HuongDan[] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [tienDo, setTienDo] = useState<{ xong: number; tong: number } | null>(null);
  const daCo = new Set(dangCo.map((h) => maTuTuKhoa(h.tu_khoa)).filter(Boolean));
  const conThieu = goiHuongDan().filter((m) => !daCo.has(m.ma));
  if (conThieu.length === 0) return null;

  const nap = async () => {
    const soAnh = new Set(conThieu.flatMap((m) => m.anh)).size;
    if (!window.confirm(t("Nạp {n} hướng dẫn ngắn (kèm {a} ảnh tải lên Google Drive bằng tài khoản của bạn)? Hướng dẫn đã có sẽ được bỏ qua.", { n: conThieu.length, a: soAnh }))) return;
    const urlAnh = new Map<string, string>();
    let xong = 0;
    let dung: string | null = null;
    setTienDo({ xong: 0, tong: conThieu.length });
    try {
      for (const m of conThieu) {
        const anh: string[] = [];
        for (const ten of m.anh) {
          let url = urlAnh.get(ten);
          if (!url) {
            const blob = await fetch(`/huong-dan-goi/${ten}.jpg`).then((r) => {
              if (!r.ok) throw new Error(`Không tải được ảnh mẫu ${ten}`);
              return r.blob();
            });
            const res = await api.postBinary<{ url: string }>("/huong-dan/anh", await blob.arrayBuffer(), "image/jpeg");
            url = res.url;
            urlAnh.set(ten, url);
          }
          anh.push(url);
        }
        await api.post("/huong-dan", { tieu_de: m.tieu_de, noi_dung: m.noi_dung, anh, tu_khoa: m.tu_khoa, nhom: m.nhom, stt: m.stt, bat_tat: true });
        xong += 1;
        setTienDo({ xong, tong: conThieu.length });
      }
    } catch (e) {
      dung = loiHetHanMucAnh(e) ?? describeApiError(e);
    } finally {
      setTienDo(null);
      qc.invalidateQueries({ queryKey: ["huong-dan"] });
    }
    toast(
      dung
        ? t("Đã nạp {a}/{b} hướng dẫn rồi dừng: {c}. Bấm \"Nạp bộ hướng dẫn\" lại để nạp tiếp phần còn thiếu.", { a: xong, b: conThieu.length, c: dung })
        : t("Đã nạp {a} hướng dẫn.", { a: xong }),
    );
  };

  return (
    <Btn variant="ghost" loading={!!tienDo} onClick={nap} title={t("Nạp sẵn bộ hướng dẫn ngắn cho mục \"Hỏi nhanh\" của KTV")}>
      {tienDo ? t("Đang nạp {a}/{b}…", { a: tienDo.xong, b: tienDo.tong }) : t("📥 Nạp bộ hướng dẫn ({n})", { n: conThieu.length })}
    </Btn>
  );
}
