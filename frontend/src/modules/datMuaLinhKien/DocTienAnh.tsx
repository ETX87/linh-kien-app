import { useEffect, useState, type ReactNode } from "react";
import { fmtVND } from "../../types";
import { Money } from "../../components/ui/Money";
import { docBiLoi, docSoTienAnh, PHIEN_BAN_OCR, type SoTienDoc } from "../../lib/docTienAnh";
import { api } from "../../api/client";
import { t } from "../../i18n";

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

// KET QUA OCR DUNG CHUNG MOI MAY (bang ocr_anh_tien, migration 0058): truoc khi doc, hoi server anh nao da co may khac doc
// (dung PHIEN_BAN_OCR) -> dung luon; anh con lai doc tren may nay roi GHI LEN server (gop theo lo) cho lan sau/may khac.
const ocrServer = new Map<string, SoTienDoc>();
const dangHoi = new Map<string, Promise<void>>();
function layOcrServer(urls: string[]): Promise<unknown> {
  const can = urls.filter((u) => !dangHoi.has(u));
  for (let i = 0; i < can.length; i += 50) {
    const lo = can.slice(i, i + 50);
    const p = api
      .get<{ ket_qua: TienDocMap }>(`/quy-ktv/ocr-anh?urls=${encodeURIComponent(JSON.stringify(lo))}&phien_ban=${PHIEN_BAN_OCR}`)
      .then((r) => {
        for (const [u, so] of Object.entries(r.ket_qua)) ocrServer.set(u, so);
      })
      .catch(() => undefined); // loi mang -> doc tren may nhu thuong
    for (const u of lo) dangHoi.set(u, p);
  }
  return Promise.all(urls.map((u) => dangHoi.get(u)));
}
let choGhi: TienDocMap = {};
let henGhi: number | undefined;
function ghiOcrServer(url: string, so: SoTienDoc) {
  if (ocrServer.has(url) && ocrServer.get(url) === so) return;
  ocrServer.set(url, so);
  choGhi[url] = so;
  window.clearTimeout(henGhi);
  henGhi = window.setTimeout(() => {
    const ket_qua = choGhi;
    choGhi = {};
    // Tai khoan chi xem (View/Mua hang) bi chan ghi -> bo qua, lan sau may khac ghi.
    void api.post("/quy-ktv/ocr-anh", { phien_ban: PHIEN_BAN_OCR, ket_qua }).catch(() => undefined);
  }, 1500);
}

/**
 * Doc so tien cac anh `urls`: ket qua server (may khac da doc, dung phien ban) dung luon; con lai doc tren may nay (chay nen,
 * tuan tu, 1 lan/anh/phien) roi ghi len server. So da luu trong `daLuu` (kem PXK/khoan) chi dung TAM trong
 * luc doc - may nay doc xong thi so moi thang (2026-09-30: so luu tu bo nhan dang cu co the SAI, vd anh Techcombank luu
 * 9.202d do doc nham ngay "30 9 2026" trong loi nhan). `ketQua` = cac anh da co so (de gui luu kem luc "Đã chuyển").
 */
export function useDocTienAnh(urls: string[], daLuu: TienDocMap) {
  const [docDuoc, setDocDuoc] = useState<TienDocMap>({});
  const key = urls.join("|");
  useEffect(() => {
    let huy = false;
    const can = urls.filter((u) => !(u in docDuoc));
    void layOcrServer(can).then(() => {
      if (huy) return;
      const tuServer: TienDocMap = {};
      for (const u of can) if (ocrServer.has(u)) tuServer[u] = ocrServer.get(u)!;
      if (Object.keys(tuServer).length) setDocDuoc((m) => ({ ...tuServer, ...m }));
      for (const u of can) {
        if (ocrServer.has(u)) continue;
        void docSoTienAnh(u).then((so) => {
          if (!docBiLoi(u)) ghiOcrServer(u, so);
          if (!huy) setDocDuoc((m) => (u in m ? m : { ...m, [u]: so }));
        });
      }
    });
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
      <div className="text-[11.5px] text-[var(--color-text-secondary)]" title={t("Số tiền hệ thống tự đọc từ ảnh — có thể sai, chỉ để đối chiếu")}>
        <span className="font-semibold">{t("Đọc từ ảnh:")}</span>{" "}
        {items.map((i, k) => (
          <span key={i.url}>
            {k > 0 && " + "}
            {t("ảnh {a}", { a: sttCua(i.url) })}
            {!i.xong ? (
              <span className="text-[var(--color-text-faint)]">{t("đang đọc…")}</span>
            ) : i.soTien == null ? (
              <span className="text-[var(--color-warning-strong)]">{t("không đọc được")}</span>
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
              ⚠ {nhan[0].toUpperCase() + nhan.slice(1)} <Money>{fmtVND(soSoSanh)}</Money> {t("lệch")} <Money>{fmtVND(Math.abs(soSoSanh - tong))}</Money> {t("so với tổng đọc từ ảnh")}{" "}
              <Money>{fmtVND(tong)}</Money> {t("— kiểm tra lại ảnh/sao kê.")}
            </>
          )}
        </div>
      )}
      {xongHet && khongDoc.length > 0 && (
        <div className="text-[11px] text-[var(--color-text-faint)]">
          {t("Ảnh {a} không tự đọc được số tiền — kiểm tra bằng mắt.", { a: khongDoc.map((i) => sttCua(i.url)).join(", ") })}
        </div>
      )}
    </div>
  );
}
