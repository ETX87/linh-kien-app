import { useEffect, useState, type ReactNode } from "react";
import { fmtVND } from "../../types";
import { Money } from "../../components/ui/Money";
import { docSoTienAnh, type SoTienDoc } from "../../lib/docTienAnh";

// So tien doc tu anh chuyen khoan (lib/docTienAnh.ts, 2026-09-30) - dung chung form KTV "Đã chuyển", form Ke toan "Duyệt
// bằng chứng" va modal "Sửa tiền" (Quỹ & chuyển tiền). CHI canh bao, khong chan.

/** Map url anh -> so tien da doc (luu DB: phieu_xuat_kho.bang_chung_tien_doc / khoan_chuyen_tien.tien_doc_anh). */
export type TienDocMap = Record<string, SoTienDoc>;

export function docTienDocMap(json: string | null | undefined): TienDocMap {
  if (!json) return {};
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as TienDocMap) : {};
  } catch {
    return {};
  }
}

export function docDsAnh(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export interface KetQuaDocAnh {
  url: string;
  xong: boolean;
  soTien: SoTienDoc;
}

/**
 * Doc so tien cac anh `urls` tren may nay (chay nen, tuan tu, 1 lan/anh/phien). So da luu trong `daLuu` chi dung TAM trong
 * luc doc - may nay doc xong thi so moi thang (2026-09-30: so luu tu bo nhan dang cu co the SAI, vd anh Techcombank luu
 * 9.202d do doc nham ngay "30 9 2026" trong loi nhan). `ketQua` = cac anh da co so (de gui luu kem luc "Đã chuyển").
 */
export function useDocTienAnh(urls: string[], daLuu: TienDocMap) {
  const [docDuoc, setDocDuoc] = useState<TienDocMap>({});
  const key = urls.join("|");
  useEffect(() => {
    let huy = false;
    for (const u of urls) {
      if (u in docDuoc) continue;
      void docSoTienAnh(u).then((so) => {
        if (!huy) setDocDuoc((m) => (u in m ? m : { ...m, [u]: so }));
      });
    }
    return () => {
      huy = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const items: KetQuaDocAnh[] = urls.map((url) =>
    // May nay doc ra null (loi mang/anh hong/khong nhan dang duoc) ma co so da luu -> giu so da luu.
    url in docDuoc && (docDuoc[url] != null || daLuu[url] == null)
      ? { url, xong: true, soTien: docDuoc[url] }
      : daLuu[url] != null
        ? { url, xong: true, soTien: daLuu[url] }
        : { url, xong: false, soTien: null },
  );
  const ketQua: TienDocMap = {};
  for (const it of items) if (it.xong) ketQua[it.url] = it.soTien;
  const xongHet = items.every((i) => i.xong);
  const docDuHet = xongHet && items.every((i) => i.soTien != null);
  const tong = items.reduce((s, i) => s + (i.soTien ?? 0), 0);
  return { items, ketQua, xongHet, docDuHet, tong };
}

/**
 * Hien "Đọc từ ảnh: ảnh 1 … + ảnh 2 … = tổng" + canh bao khi tong LECH `soSoSanh`. `sttCua` = so thu tu anh hien thi
 * (khop thu tu thumbnail); `nhan` = ten so dem so sanh (vd "số thực nhận", "số còn phải chuyển").
 */
export function TienDocTuAnh({
  doc,
  soSoSanh,
  nhan,
  sttCua,
  thongDiepLech,
}: {
  doc: ReturnType<typeof useDocTienAnh>;
  soSoSanh: number | null;
  nhan: string;
  sttCua: (url: string) => number;
  thongDiepLech?: (tong: number, so: number) => ReactNode;
}) {
  const { items, xongHet, docDuHet, tong } = doc;
  if (items.length === 0) return null;
  const lech = docDuHet && soSoSanh != null && soSoSanh > 0 && tong !== soSoSanh;
  const khongDoc = items.filter((i) => i.xong && i.soTien == null);
  return (
    <div className="space-y-1">
      <div className="text-[11.5px] text-[var(--color-text-secondary)]" title="Số tiền hệ thống tự đọc từ ảnh — có thể sai, chỉ để đối chiếu">
        <span className="font-semibold">Đọc từ ảnh:</span>{" "}
        {items.map((i, k) => (
          <span key={i.url}>
            {k > 0 && " + "}
            ảnh {sttCua(i.url)}{" "}
            {!i.xong ? (
              <span className="text-[var(--color-text-faint)]">đang đọc…</span>
            ) : i.soTien == null ? (
              <span className="text-[var(--color-warning-strong)]">không đọc được</span>
            ) : (
              <b className="text-[var(--color-text)]"><Money>{fmtVND(i.soTien)}</Money></b>
            )}
          </span>
        ))}
        {items.length > 1 && xongHet && tong > 0 && (
          <>
            {" "}= <b className="text-[var(--color-text)]"><Money>{fmtVND(tong)}</Money></b>
          </>
        )}
      </div>
      {lech && (
        <div className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--color-warning-strong)]">
          {thongDiepLech ? (
            thongDiepLech(tong, soSoSanh)
          ) : (
            <>
              ⚠ {nhan[0].toUpperCase() + nhan.slice(1)} <Money>{fmtVND(soSoSanh)}</Money> lệch <Money>{fmtVND(Math.abs(soSoSanh - tong))}</Money> so với tổng đọc từ ảnh{" "}
              <Money>{fmtVND(tong)}</Money> — kiểm tra lại ảnh/sao kê.
            </>
          )}
        </div>
      )}
      {xongHet && khongDoc.length > 0 && (
        <div className="text-[11px] text-[var(--color-text-faint)]">
          Ảnh {khongDoc.map((i) => sttCua(i.url)).join(", ")} không tự đọc được số tiền — kiểm tra bằng mắt.
        </div>
      )}
    </div>
  );
}
