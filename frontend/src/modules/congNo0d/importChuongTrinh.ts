// IMPORT CHUONG TRINH CONG NO 0 DONG HANG LOAT (2026-10-22, v1.386 - "file import này cần có ID KTV hoặc Mã misa + mã linh kiện hỗ trợ/
// hoặc từ khóa tìm kiếm (1 trong 2) + số lượng + từ ngày + đến ngày + tên chương trình + các thông tin khác nếu cần").
// Doc + kiem tra HOAN TOAN tren trinh duyet (ham thuan, khong goi mang) -> danh sach chuong trinh se tao, roi FE goi POST /cong-no-0d
// (API san co, kiem tra lai moi thu) cho TUNG chuong trinh.
//
// Moi dong file = 1 KTV (Mã KTV hoac Mã MISA; trong / "TẤT CẢ" = toan bo KTV) x 1 muc ho tro (Mã LK HOAC Từ khóa - dung 1 trong 2) x SL,
// thuoc chuong trinh (Tên + Từ ngày + Đến ngày). Trong 1 chuong trinh moi KTV huong CUNG bo muc + SL -> cung ten/ngay ma cac KTV co
// bo muc khac nhau thi TACH thanh nhieu chuong trinh (moi nhom KTV giong het nhau = 1 chuong trinh), KTV nao cung nhan dung so trong file.

export interface KtvImport {
  ma_ktv: string;
  ten_hien_thi: string | null;
  ma_misa?: string | null;
  ngung_hoat_dong: number;
}
export interface ChuongTrinhCo {
  ten: string | null;
  tu_ngay: string;
  den_ngay: string;
}
export interface MucHoTro {
  loai: "lk" | "tu_khoa";
  ma: string; // ma LK chuan / tu khoa
  sl: number;
  khop_ten: boolean;
}
export interface ChuongTrinhSeTao {
  khoa: string;
  ten: string;
  tu_ngay: string;
  den_ngay: string;
  tat_ca_ktv: boolean;
  ktv: string[];
  muc: MucHoTro[];
  bat_tat: boolean;
  dong: number[]; // so dong trong file (1-based, tinh ca dong tieu de)
  canhBao: string[];
}
export interface KetQuaDoc {
  chuongTrinh: ChuongTrinhSeTao[];
  loi: { dong: number; noiDung: string }[];
  canhBao: { dong: number; noiDung: string }[];
  soDongDoc: number;
  thieuCot: string[];
}

export const COT_MAU = ["Tên chương trình", "Từ ngày", "Đến ngày", "Mã KTV", "Mã MISA", "Mã LK", "Từ khóa", "Khớp cả tên", "SL hỗ trợ / KTV", "Bật"];

const boDau = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Nhan dien cot theo tieu de (bo dau, khong phan biet hoa/thuong). Thu tu kiem tra quan trong: "ma misa"/"ma ktv" truoc "ma lk".
function nhanCot(h: string): keyof CotIdx | null {
  if (!h) return null;
  // SL truoc: tieu de "SL hỗ trợ / KTV" chua chu "ktv".
  if (/^sl\b|so luong/.test(h)) return "sl";
  if (/ten chuong trinh|^chuong trinh|^ten ct/.test(h)) return "ten";
  if (/^tu ngay|ngay bat dau/.test(h)) return "tu";
  if (/^den ngay|ngay ket thuc/.test(h)) return "den";
  if (/misa/.test(h)) return "misa";
  if (/ktv|ky thuat vien/.test(h)) return "ktv";
  if (/tu khoa/.test(h)) return "tuKhoa";
  if (/khop.*ten/.test(h)) return "khopTen";
  if (/ma lk|ma linh kien|ma hang|^linh kien/.test(h)) return "lk";
  if (/^sl\b|so luong/.test(h)) return "sl";
  if (/^bat|trang thai/.test(h)) return "bat";
  return null;
}
interface CotIdx { ten: number; tu: number; den: number; ktv: number; misa: number; lk: number; tuKhoa: number; khopTen: number; sl: number; bat: number }

const pad = (n: number) => String(n).padStart(2, "0");
// Ngay: so serial Excel / Date / "dd/mm/yyyy" / "d-m-yyyy" / "yyyy-mm-dd". Sai -> null.
export function docNgay(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel 1900 date system: 25569 = 1970-01-01.
    const d = new Date(Math.round((v - 25569) * 86400_000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; } else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3];
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const laCo = (v: unknown) => /^(1|x|co|yes|y|true|bat|on)$/.test(boDau(v));
const laKhong = (v: unknown) => /^(0|khong|no|n|false|tat|off)$/.test(boDau(v));
const laTatCa = (v: unknown) => /^(tat ca|toan bo|all|\*)$/.test(boDau(v));

export function docFileChuongTrinh(
  bang: unknown[][],
  ktvAll: KtvImport[],
  maLkDanhMuc: Map<string, string>, // UPPER(ma) -> ma chuan trong danh muc
  daCo: ChuongTrinhCo[],
): KetQuaDoc {
  const loi: KetQuaDoc["loi"] = [];
  const canhBao: KetQuaDoc["canhBao"] = [];
  // Tim dong tieu de trong 5 dong dau: dong co >= 3 cot nhan dien duoc.
  let dongTieuDe = -1;
  let cot: Partial<CotIdx> = {};
  for (let i = 0; i < Math.min(5, bang.length); i++) {
    const c: Partial<CotIdx> = {};
    (bang[i] ?? []).forEach((o, j) => {
      const k = nhanCot(boDau(o));
      if (k && c[k] == null) c[k] = j;
    });
    if (Object.keys(c).length >= 3) { dongTieuDe = i; cot = c; break; }
  }
  const thieuCot: string[] = [];
  if (dongTieuDe < 0) return { chuongTrinh: [], loi: [], canhBao: [], soDongDoc: 0, thieuCot: ["Dòng tiêu đề (xem file mẫu)"] };
  if (cot.tu == null) thieuCot.push("Từ ngày");
  if (cot.den == null) thieuCot.push("Đến ngày");
  if (cot.lk == null && cot.tuKhoa == null) thieuCot.push("Mã LK hoặc Từ khóa");
  if (cot.sl == null) thieuCot.push("SL hỗ trợ / KTV");
  if (thieuCot.length) return { chuongTrinh: [], loi: [], canhBao: [], soDongDoc: 0, thieuCot };

  const theoMaKtv = new Map(ktvAll.map((k) => [k.ma_ktv.trim().toUpperCase(), k]));
  const theoMisa = new Map<string, KtvImport[]>();
  for (const k of ktvAll) {
    const m = k.ma_misa?.trim().toUpperCase();
    if (m) theoMisa.set(m, [...(theoMisa.get(m) ?? []), k]);
  }
  const lay = (dong: unknown[], k: keyof CotIdx) => (cot[k] == null ? "" : dong[cot[k] as number]);
  const tim = (ma: string, uuTienMisa: boolean): { ktv?: KtvImport; loi?: string } => {
    const u = ma.toUpperCase();
    const quaMisa = () => {
      const ds = theoMisa.get(u);
      if (!ds) return undefined;
      const dangBat = ds.filter((k) => !k.ngung_hoat_dong);
      return (dangBat.length ? dangBat : ds)[0];
    };
    const k = uuTienMisa ? quaMisa() ?? theoMaKtv.get(u) : theoMaKtv.get(u) ?? quaMisa();
    return k ? { ktv: k } : { loi: `không tìm thấy KTV "${ma}"` };
  };

  // Gom: chuong trinh (ten|tu|den) -> nguoi nhan ("*" = toan bo KTV, con lai ma KTV) -> muc (lk:MA / tk:TUKHOA) -> {sl, khop_ten, dong}.
  type Muc = { loai: "lk" | "tu_khoa"; ma: string; sl: number; khop_ten: boolean; dong: number };
  const gom = new Map<string, { ten: string; tu: string; den: string; bat: boolean; dong: number[]; nguoi: Map<string, Map<string, Muc>> }>();
  let soDongDoc = 0;
  for (let i = dongTieuDe + 1; i < bang.length; i++) {
    const r = bang[i] ?? [];
    const so = i + 1;
    if (r.every((o) => String(o ?? "").trim() === "")) continue;
    soDongDoc++;
    const ten = String(lay(r, "ten") ?? "").trim();
    const tuRaw = lay(r, "tu");
    const denRaw = lay(r, "den");
    const tu = docNgay(tuRaw);
    const den = docNgay(denRaw);
    const maLk = String(lay(r, "lk") ?? "").trim();
    const tk = String(lay(r, "tuKhoa") ?? "").trim();
    const slRaw = String(lay(r, "sl") ?? "").trim();
    const sl = Number(slRaw.replace(/[.,\s]/g, ""));
    const ktvRaw = String(lay(r, "ktv") ?? "").trim();
    const misaRaw = String(lay(r, "misa") ?? "").trim();
    const loiDong: string[] = [];
    if (!tu) loiDong.push(tuRaw === "" ? "thiếu Từ ngày" : `Từ ngày sai "${tuRaw}"`);
    if (!den) loiDong.push(denRaw === "" ? "thiếu Đến ngày" : `Đến ngày sai "${denRaw}"`);
    if (tu && den && tu > den) loiDong.push("Từ ngày sau Đến ngày");
    if (maLk && tk) loiDong.push("chỉ điền 1 trong 2: Mã LK hoặc Từ khóa");
    if (!maLk && !tk) loiDong.push("thiếu Mã LK hoặc Từ khóa");
    let maChuan = "";
    if (maLk && !tk) {
      maChuan = maLkDanhMuc.get(maLk.toUpperCase()) ?? "";
      if (!maChuan) loiDong.push(`mã LK "${maLk}" không có trong danh mục`);
    }
    if (tk && !maLk && tk.length < 3) loiDong.push(`từ khóa "${tk}" cần ít nhất 3 ký tự`);
    if (slRaw === "" || !Number.isInteger(sl) || sl <= 0) loiDong.push(slRaw === "" ? "thiếu SL" : `SL sai "${slRaw}"`);
    // KTV: o Ma KTV / Ma MISA trong, hoac ghi "TẤT CẢ" -> toan bo KTV.
    let nguoi = "";
    const tatCa = (!ktvRaw && !misaRaw) || laTatCa(ktvRaw) || laTatCa(misaRaw);
    if (!tatCa) {
      const kq = misaRaw && !laTatCa(misaRaw) ? tim(misaRaw, true) : tim(ktvRaw, false);
      if (kq.loi) loiDong.push(kq.loi);
      else if (kq.ktv) {
        nguoi = kq.ktv.ma_ktv;
        if (kq.ktv.ngung_hoat_dong) canhBao.push({ dong: so, noiDung: `KTV ${kq.ktv.ma_ktv} đang ngừng hoạt động` });
        if (ktvRaw && misaRaw && !laTatCa(misaRaw)) {
          const theoKtv = theoMaKtv.get(ktvRaw.toUpperCase());
          if (theoKtv && theoKtv.ma_ktv !== kq.ktv.ma_ktv) loiDong.push(`Mã KTV "${ktvRaw}" và Mã MISA "${misaRaw}" là 2 KTV khác nhau`);
        }
      }
    } else nguoi = "*";
    if (loiDong.length) { loi.push({ dong: so, noiDung: loiDong.join("; ") }); continue; }

    const tenCt = ten || `Công nợ 0đ ${tu} → ${den}`;
    const khoaCt = `${tenCt.toUpperCase()}|${tu}|${den}`;
    const batRaw = lay(r, "bat");
    const ct = gom.get(khoaCt) ?? { ten: tenCt, tu: tu!, den: den!, bat: true, dong: [] as number[], nguoi: new Map<string, Map<string, Muc>>() };
    if (laKhong(batRaw)) ct.bat = false;
    ct.dong.push(so);
    gom.set(khoaCt, ct);
    const muc: Muc = maChuan
      ? { loai: "lk", ma: maChuan, sl, khop_ten: false, dong: so }
      : { loai: "tu_khoa", ma: tk, sl, khop_ten: laCo(lay(r, "khopTen")), dong: so };
    const khoaMuc = `${muc.loai}:${muc.ma.toUpperCase()}`;
    const dsMuc = ct.nguoi.get(nguoi) ?? new Map<string, Muc>();
    const cu = dsMuc.get(khoaMuc);
    if (cu) {
      if (cu.sl !== muc.sl) loi.push({ dong: so, noiDung: `trùng dòng ${cu.dong} (cùng chương trình, KTV, ${muc.loai === "lk" ? "mã LK" : "từ khóa"} ${muc.ma}) nhưng SL khác (${cu.sl} ≠ ${muc.sl})` });
      else canhBao.push({ dong: so, noiDung: `trùng dòng ${cu.dong} — bỏ qua` });
      continue;
    }
    dsMuc.set(khoaMuc, muc);
    ct.nguoi.set(nguoi, dsMuc);
  }

  // Tach: trong moi chuong trinh, nhom KTV co CUNG bo muc + SL -> 1 chuong trinh; "*" (toan bo KTV) tach rieng.
  const daCoKhoa = new Set(daCo.map((c) => `${(c.ten ?? "").trim().toUpperCase()}|${c.tu_ngay}|${c.den_ngay}`));
  const chuongTrinh: ChuongTrinhSeTao[] = [];
  for (const [khoaCt, ct] of gom) {
    const theoBo = new Map<string, { ktv: string[]; muc: Muc[] }>();
    for (const [nguoi, dsMuc] of ct.nguoi) {
      const muc = [...dsMuc.values()].sort((a, b) => `${a.loai}${a.ma}`.localeCompare(`${b.loai}${b.ma}`));
      const chuKy = (nguoi === "*" ? "*#" : "") + muc.map((m) => `${m.loai}:${m.ma.toUpperCase()}:${m.sl}:${m.khop_ten ? 1 : 0}`).join("|");
      const nhom = theoBo.get(chuKy) ?? { ktv: [], muc };
      if (nguoi !== "*") nhom.ktv.push(nguoi);
      theoBo.set(chuKy, nhom);
    }
    const tach = theoBo.size > 1;
    let stt = 0;
    for (const [chuKy, nhom] of theoBo) {
      stt++;
      const canhBaoCt: string[] = [];
      if (daCoKhoa.has(khoaCt)) canhBaoCt.push("Đã có chương trình cùng tên + thời gian — import tạo THÊM (SL hỗ trợ cộng dồn)");
      if (tach) canhBaoCt.push(`Tách ${theoBo.size} chương trình vì các KTV có linh kiện / SL khác nhau`);
      chuongTrinh.push({
        khoa: `${khoaCt}#${stt}`,
        ten: tach ? `${ct.ten} (${stt})` : ct.ten,
        tu_ngay: ct.tu,
        den_ngay: ct.den,
        tat_ca_ktv: chuKy.startsWith("*#"),
        ktv: nhom.ktv,
        muc: nhom.muc.map(({ loai, ma, sl, khop_ten }) => ({ loai, ma, sl, khop_ten })),
        bat_tat: ct.bat,
        dong: [...new Set(nhom.muc.map((m) => m.dong))].sort((a, b) => a - b),
        canhBao: canhBaoCt,
      });
    }
  }
  return { chuongTrinh, loi, canhBao, soDongDoc, thieuCot: [] };
}
