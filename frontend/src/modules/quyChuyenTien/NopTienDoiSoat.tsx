import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Money } from "../../components/ui/Money";
import { fmtDateTime, fmtVND } from "../../types";
import { PHIEN_BAN_OCR } from "../../lib/docTienAnh";
import { docDsAnh, docTienDocMap, type KetQuaDocAnh, type TienDocMap } from "../datMuaLinhKien/DocTienAnh";
import { MaPhieuLink } from "../datMuaLinhKien/MaLienKet";
import { XemAnhNhanh, type AnhXem } from "../datMuaLinhKien/XemAnhNhanh";
import { t } from "../../i18n";

// DOI SOAT YEU CAU NOP TIEN VOI CAC KHOAN DA XAC NHAN CUA CUNG QUY (2026-11-12, v1.481 - "tab bên cạnh hiện các hóa đơn đã xác nhận của cùng
// KTV nhận quỹ. nếu có phiếu nào có số tiền tương đương với 1 trong các ảnh hóa đơn (cùng màu, gần giống - nghi ngờ là cùng 1 ảnh) thì đẩy lên
// trên cùng và hiện cảnh báo"). Nguon: GET /quy-ktv/nop-tien/:id/doi-soat (180 ngay). So tren may Ke toan:
//  - so tien: OCR tung anh cua yeu cau == OCR 1 anh / so thuc nhan cua khoan cu (+ so khai == so thuc nhan khoan cu);
//  - van anh: anh thu nho 17x16 xam -> dHash 256 bit + mau trung binh -> % giong (chi la goi y, may chi so bo cuc / mau).
// Muc canh bao: DO = dung lai dung file anh, hoac trung so tien + anh gan giong; CAM = trung so tien, hoac anh rat giong. Chi canh bao, khong chan.

export interface KhoanDoiSoat {
  loai: "pxk" | "ntq" | "ngoai";
  id: number;
  ma: string;
  so_tien: number | null;
  anh: string | null;
  tien_doc_anh: string | null;
  luc: string;
  nguoi: string | null;
  ngay_chuyen: string | null;
  ghi_chu: string | null;
  trang_thai: string;
}

export const LOAI_KHOAN: Record<KhoanDoiSoat["loai"], string> = {
  pxk: "Chuyển tiền phiếu xuất",
  ntq: "Nộp tiền vào quỹ",
  ngoai: "Tiền ngoài vào quỹ",
};

// ---------- "van anh" (dHash + mau) ----------
interface VanAnh { bit: Uint8Array; mau: [number, number, number] }
const vanAnhCache = new Map<string, Promise<VanAnh | null>>();
function urlNho(url: string): string {
  const m = url.match(/drive\.google\.com\/thumbnail\?id=([\w-]+)/) ?? url.match(/lh3\.googleusercontent\.com\/d\/([\w-]+)/);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w256` : url;
}
// Hang doi 3 luong - tranh tai cung luc ca chuc anh.
let dangChay = 0;
const choChay: (() => void)[] = [];
async function trongHang<T>(fn: () => Promise<T>): Promise<T> {
  if (dangChay >= 3) await new Promise<void>((res) => choChay.push(res));
  dangChay++;
  try {
    return await fn();
  } finally {
    dangChay--;
    choChay.shift()?.();
  }
}
export function vanAnh(url: string): Promise<VanAnh | null> {
  let p = vanAnhCache.get(url);
  if (!p) {
    p = trongHang(async () => {
      try {
        const blob = await (await fetch(urlNho(url), { mode: "cors" })).blob();
        const bmp = await createImageBitmap(blob);
        const cv = document.createElement("canvas");
        cv.width = 17;
        cv.height = 16;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(bmp, 0, 0, 17, 16);
        const px = ctx.getImageData(0, 0, 17, 16).data;
        const xam: number[] = [];
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < px.length; i += 4) {
          xam.push(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
          r += px[i]; g += px[i + 1]; b += px[i + 2];
        }
        const n = px.length / 4;
        const bit = new Uint8Array(256);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) bit[y * 16 + x] = xam[y * 17 + x] > xam[y * 17 + x + 1] ? 1 : 0;
        bmp.close?.();
        return { bit, mau: [r / n, g / n, b / n] };
      } catch {
        return null;
      }
    });
    vanAnhCache.set(url, p);
  }
  return p;
}
/** % giong 0..1 - bo cuc (dHash) 75% + mau trung binh 25%. */
function doGiong(a: VanAnh, b: VanAnh): number {
  let khac = 0;
  for (let i = 0; i < 256; i++) if (a.bit[i] !== b.bit[i]) khac++;
  const boCuc = 1 - khac / 256;
  const dm = Math.hypot(a.mau[0] - b.mau[0], a.mau[1] - b.mau[1], a.mau[2] - b.mau[2]) / 441.7;
  return boCuc * 0.75 + (1 - dm) * 0.25;
}
const GAN_GIONG = 0.85;
const RAT_GIONG = 0.93;

function useVanAnh(urls: string[]): Record<string, VanAnh | null> {
  const [kq, setKq] = useState<Record<string, VanAnh | null>>({});
  const key = urls.join("|");
  useEffect(() => {
    let huy = false;
    for (const u of urls) {
      void vanAnh(u).then((v) => {
        if (!huy) setKq((m) => (u in m ? m : { ...m, [u]: v }));
      });
    }
    return () => {
      huy = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return kq;
}

// So OCR da luu cua anh cac khoan cu (bang ocr_anh_tien dung chung moi may) - KHONG doc lai tren may (nang); thieu thi dung so luu kem khoan.
function useOcrDaLuu(urls: string[]): TienDocMap {
  const key = urls.join("|");
  const { data } = useQuery({
    queryKey: ["quy-ktv-ocr-luu", key],
    enabled: urls.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const kq: TienDocMap = {};
      for (let i = 0; i < urls.length; i += 50) {
        const lo = urls.slice(i, i + 50);
        const r = await api.get<{ ket_qua: TienDocMap }>(`/quy-ktv/ocr-anh?urls=${encodeURIComponent(JSON.stringify(lo))}&phien_ban=${PHIEN_BAN_OCR}`).catch(() => ({ ket_qua: {} }));
        Object.assign(kq, r.ket_qua);
      }
      return kq;
    },
  });
  return data ?? {};
}

export type MucCanhBao = "do" | "cam" | null;
export interface KetQuaKhoan {
  k: KhoanDoiSoat;
  urls: string[];
  tienAnh: TienDocMap;
  muc: MucCanhBao;
  lyDo: string[];
  giongNhat: number | null; // % giong cao nhat voi 1 anh cua yeu cau
  anhTrung: Set<string>; // anh CUA KHOAN CU bi nghi trung
  anhCuaToiTrung: Set<string>; // anh CUA YEU CAU bi nghi trung
}

const MAX_ANH_SO_HINH = 80;

/** Doi soat yeu cau nop tien (anh + OCR tung anh) voi lich su cung quy. */
export function useDoiSoatNopTien(id: number, docItems: KetQuaDocAnh[], soKhai: number) {
  return useDoiSoatAnh(`/quy-ktv/nop-tien/${id}/doi-soat`, docItems, soKhai);
}

/** Doi soat bo anh bat ky voi lich su quy - duongDan tra { rows: KhoanDoiSoat[] } (nop tien / phieu xuat - v1.487). soKhai = 0: khong so so khai. */
export function useDoiSoatAnh(duongDan: string, docItems: KetQuaDocAnh[], soKhai: number) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["quy-ktv-doi-soat", duongDan],
    queryFn: () => api.get<{ rows: KhoanDoiSoat[] }>(duongDan),
    staleTime: 60_000,
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const anhCu = useMemo(() => rows.flatMap((k) => docDsAnh(k.anh)), [rows]);
  const ocrLuu = useOcrDaLuu(anhCu);
  const cuaToi = docItems.map((d) => d.url);
  const van = useVanAnh(useMemo(() => [...cuaToi, ...anhCu.slice(0, MAX_ANH_SO_HINH)], [cuaToi.join("|"), anhCu]));

  const ketQua: KetQuaKhoan[] = useMemo(() => {
    const out = rows.map((k): KetQuaKhoan => {
      const urls = docDsAnh(k.anh);
      const tienAnh: TienDocMap = { ...docTienDocMap(k.tien_doc_anh), ...Object.fromEntries(urls.filter((u) => ocrLuu[u] != null).map((u) => [u, ocrLuu[u]])) };
      const lyDo: string[] = [];
      const anhTrung = new Set<string>();
      const anhCuaToiTrung = new Set<string>();
      let cungFile = false;
      let trungTien = false;
      let giongNhat: number | null = null;
      let ganGiongKhiTrungTien = false;
      docItems.forEach((d, i) => {
        if (urls.includes(d.url)) {
          cungFile = true;
          anhTrung.add(d.url);
          anhCuaToiTrung.add(d.url);
          lyDo.push(t("Ảnh {a} là CÙNG 1 file ảnh đã dùng ở khoản này", { a: i + 1 }));
        }
        const a = d.soTien;
        const vanToi = van[d.url];
        urls.forEach((u, j) => {
          const vanCu = van[u];
          const giong = vanToi && vanCu && u !== d.url ? doGiong(vanToi, vanCu) : null;
          if (giong != null && (giongNhat == null || giong > giongNhat)) giongNhat = giong;
          const cungSo = a != null && a > 0 && tienAnh[u] === a;
          if (cungSo) {
            trungTien = true;
            anhTrung.add(u);
            anhCuaToiTrung.add(d.url);
            lyDo.push(t("Ảnh {a} ({b}) cùng số tiền với ảnh {c} của khoản này", { a: i + 1, b: fmtVND(a), c: j + 1 }));
          }
          if (giong != null && giong >= GAN_GIONG && (cungSo || giong >= RAT_GIONG)) {
            anhTrung.add(u);
            anhCuaToiTrung.add(d.url);
            if (cungSo) ganGiongKhiTrungTien = true;
            lyDo.push(t("Ảnh {a} giống ảnh {c} của khoản này {p}% (màu + bố cục)", { a: i + 1, c: j + 1, p: Math.round(giong * 100) }));
          }
        });
        if (a != null && a > 0 && k.so_tien === a && !urls.some((u) => tienAnh[u] === a)) {
          trungTien = true;
          anhCuaToiTrung.add(d.url);
          lyDo.push(t("Ảnh {a} ({b}) bằng đúng số tiền của khoản này", { a: i + 1, b: fmtVND(a) }));
        }
      });
      if (soKhai > 0 && k.so_tien != null && k.so_tien === soKhai && !trungTien) {
        trungTien = true;
        lyDo.push(t("Số tiền khai {a} bằng đúng số tiền của khoản này", { a: fmtVND(soKhai) }));
      }
      const ratGiong = giongNhat != null && giongNhat >= RAT_GIONG;
      const muc: MucCanhBao = cungFile || ganGiongKhiTrungTien ? "do" : trungTien || ratGiong ? "cam" : null;
      return { k, urls, tienAnh, muc, lyDo: [...new Set(lyDo)], giongNhat, anhTrung, anhCuaToiTrung };
    });
    const hang = (m: MucCanhBao) => (m === "do" ? 0 : m === "cam" ? 1 : 2);
    return out.sort((a, b) => hang(a.muc) - hang(b.muc) || (a.k.luc < b.k.luc ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ocrLuu, van, docItems.map((d) => `${d.url}:${d.soTien}`).join("|"), soKhai]);

  const soDo = ketQua.filter((x) => x.muc === "do").length;
  const soCam = ketQua.filter((x) => x.muc === "cam").length;
  const anhCuaToiNghi = new Map<string, MucCanhBao>();
  for (const x of ketQua) for (const u of x.anhCuaToiTrung) if (anhCuaToiNghi.get(u) !== "do") anhCuaToiNghi.set(u, x.muc);
  const dangSoHinh = [...cuaToi, ...anhCu.slice(0, MAX_ANH_SO_HINH)].some((u) => !(u in van));
  return { ketQua, soDo, soCam, anhCuaToiNghi, isLoading, isError, dangSoHinh, tong: rows.length };
}

// ---------- Giao dien ----------
function MaKhoan({ k }: { k: KhoanDoiSoat }) {
  if (k.loai === "pxk") return <MaPhieuLink id={k.ma} className="font-mono text-[14px] font-bold" />;
  return <span className="font-mono text-[14px] font-bold text-[var(--color-text)]">{k.ma}</span>;
}

export function DanhSachDoiSoat({ ds, ten, chiNghi }: {
  ds: ReturnType<typeof useDoiSoatAnh>;
  ten: (e: string | null | undefined) => string;
  chiNghi: boolean;
}) {
  const [xem, setXem] = useState<{ items: AnhXem[]; i: number } | null>(null);
  if (ds.isLoading) return <div className="py-6 text-center text-sm text-[var(--color-text-secondary)]">{t("Đang tải lịch sử quỹ…")}</div>;
  if (ds.isError) return <div className="py-6 text-center text-sm text-[var(--color-danger-strong)]">{t("Không tải được lịch sử quỹ")}</div>;
  const hien = chiNghi ? ds.ketQua.filter((x) => x.muc) : ds.ketQua;
  if (!hien.length) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-8 text-center text-sm text-[var(--color-text-secondary)]">
        {chiNghi ? (
          <><div className="text-2xl">✓</div>{t("Không thấy khoản nào trùng số tiền hoặc giống ảnh trong 180 ngày.")}</>
        ) : t("Quỹ này chưa có khoản nào được xác nhận trong 180 ngày.")}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {hien.map((x) => {
        const khung = x.muc === "do"
          ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)]"
          : x.muc === "cam" ? "border-[var(--color-warning)] bg-[var(--color-warning-soft)]" : "border-[var(--color-border)] bg-[var(--color-surface)]";
        const items: AnhXem[] = x.urls.map((url, i) => ({
          url,
          tieuDe: x.k.ma,
          phu: t("Ảnh {a}/{b} · {c}", { a: i + 1, b: x.urls.length, c: t(LOAI_KHOAN[x.k.loai]) }),
          urlsNhom: x.urls,
          urlsTinh: x.urls,
          tienDoc: x.tienAnh,
          tien: x.k.so_tien != null ? [{ nhan: t("Đã xác nhận"), giaTri: fmtVND(x.k.so_tien) }] : [],
          soSanh: x.k.so_tien != null ? { nhan: t("Đã xác nhận"), giaTri: x.k.so_tien } : null,
          chungTu: [
            { nhan: x.k.trang_thai === "Cho ke toan" ? t("Gửi lúc") : t("Xác nhận lúc"), giaTri: fmtDateTime(x.k.luc) },
            ...(x.k.nguoi ? [{ nhan: t("Người xác nhận"), giaTri: ten(x.k.nguoi) || x.k.nguoi }] : []),
          ],
          ghiChu: x.lyDo.map((l, j) => ({ nhan: `⚠ ${j + 1}`, giaTri: l })),
        }));
        return (
          <div key={`${x.k.loai}-${x.k.id}`} className={`rounded-xl border px-3 py-2.5 ${khung}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {x.muc === "do" && <span className="rounded-md bg-[var(--color-danger)] px-1.5 py-0.5 text-[11px] font-bold text-white">{t("NGHI TRÙNG")}</span>}
              {x.muc === "cam" && <span className="rounded-md bg-[var(--color-warning-strong)] px-1.5 py-0.5 text-[11px] font-bold text-white">{t("CẦN KIỂM TRA")}</span>}
              <MaKhoan k={x.k} />
              <span className="text-[12px] text-[var(--color-text-secondary)]">{t(LOAI_KHOAN[x.k.loai])}</span>
              {x.k.trang_thai === "Cho ke toan" && <span className="text-[12px] font-semibold text-[var(--color-warning-strong)]">· {t("đang chờ xác nhận")}</span>}
              <span className="ml-auto text-[17px] font-extrabold tabular text-[var(--color-text)]">
                {x.k.so_tien != null ? <Money>{fmtVND(x.k.so_tien)}</Money> : "—"}
              </span>
            </div>
            <div className="mt-0.5 text-[12px] text-[var(--color-text-secondary)]">
              {fmtDateTime(x.k.luc)}
              {x.k.nguoi ? ` · ${ten(x.k.nguoi)}` : ""}
              {x.k.ghi_chu ? ` · ${x.k.ghi_chu}` : ""}
              {x.giongNhat != null && (
                <span className={x.giongNhat >= GAN_GIONG ? "font-semibold text-[var(--color-danger-strong)]" : ""}>
                  {" · "}{t("Ảnh giống nhất {p}%", { p: Math.round(x.giongNhat * 100) })}
                </span>
              )}
            </div>
            {x.lyDo.length > 0 && (
              <ul className={`mt-1.5 space-y-0.5 text-[12.5px] font-medium ${x.muc === "do" ? "text-[var(--color-danger-strong)]" : "text-[var(--color-warning-strong)]"}`}>
                {x.lyDo.map((l) => <li key={l}>⚠ {l}</li>)}
              </ul>
            )}
            {x.urls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {x.urls.map((u, i) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setXem({ items, i })}
                    className={`focus-ring overflow-hidden rounded-lg border-2 bg-[var(--color-surface)] text-left ${x.anhTrung.has(u) ? (x.muc === "do" ? "border-[var(--color-danger)]" : "border-[var(--color-warning)]") : "border-[var(--color-border)]"}`}
                  >
                    <img src={u} alt="" loading="lazy" className="h-20 w-16 object-cover" />
                    <div className="px-1 py-0.5 text-center text-[11px] font-semibold tabular">
                      {x.tienAnh[u] != null ? fmtVND(x.tienAnh[u]!) : <span className="text-[var(--color-text-faint)]">?</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {xem && <XemAnhNhanh items={xem.items} batDau={xem.i} onClose={() => setXem(null)} />}
    </div>
  );
}
