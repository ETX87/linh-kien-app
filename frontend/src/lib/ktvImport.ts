// Tach tu SettingsModule.tsx (2026-08-26, xay lai quan ly tai khoan/vai tro - tab "Danh sach KTV"
// chuyen sang UsersModule.tsx lam the "KTV hien truong", con file nay giu lai phan parse Excel dung
// chung, tranh nhan doi logic).

export interface BulkImportKtvRow {
  ma_ktv: string; ten_hien_thi?: string; sdt?: string; ghi_chu?: string;
  vai_tro_ktv?: string; gmail?: string; giam_sat_quan_ly?: string; email_dang_nhap?: string;
  khu_vuc_ma?: string; cong_no?: number; ma_misa?: string;
}
export interface BulkImportKtvChunkResult {
  done: boolean; nextOffset: number; success: number; errorCount: number;
  details: { ma_ktv: string; status: string }[];
}

function pickKtvField(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (raw[k] != null && raw[k] !== "") return String(raw[k]).trim();
  }
  return undefined;
}

// SDT bi mat so 0 dau (2026-08-26): Excel luu cot SDT dang so (khong phai text) neu nguoi nhap
// khong dinh dang cell la Text - "0912345678" thanh so 912345678, xlsx doc ve mat luon so 0, khong
// the phuc hoi tu gia tri string sau do. Chi co the suy doan: SDT di dong VN luon 10 chu so bat dau
// bang 0, nen 1 day CHINH XAC 9 chu so (khong co ky tu nao khac dinh kem) gan nhu chac chan la so da
// mat 0 dau - them lai. KHONG dung cho cac gia tri co nhieu so ghep chung qua "/" (vd so ban da dinh
// dang dung san dang text) vi cac day so trong do khong bao gio dai dung 9 (kiem chung tren du lieu
// that: 09xxxxxxxx = 10 so, 02xxxxxxxxx = 11 so).
function normalizeVnPhone(raw: string): string {
  return raw.replace(/\d+/g, (digits) => (digits.length === 9 ? "0" + digits : digits));
}

const VAI_TRO_KTV_ALIASES: Record<string, string> = {
  ktv: "KTV", ctv: "CTV", tram: "Tram", "trạm": "Tram", "ve tinh": "Ve tinh", "vệ tinh": "Ve tinh", "vetinh": "Ve tinh",
};

export async function parseKtvImportFile(file: File): Promise<BulkImportKtvRow[]> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const rows: BulkImportKtvRow[] = [];
  for (const raw of rawRows) {
    const ma = pickKtvField(raw, ["Mã KTV", "Ma KTV", "ma_ktv"]);
    if (!ma) continue;
    const vaiTroRaw = pickKtvField(raw, ["Vai trò", "Vai tro", "vai_tro_ktv"]);
    const vaiTro = vaiTroRaw ? (VAI_TRO_KTV_ALIASES[vaiTroRaw.toLowerCase()] ?? vaiTroRaw) : undefined;
    const congNoRaw = pickKtvField(raw, ["Công nợ", "Cong no", "cong_no"]);
    rows.push({
      ma_ktv: ma,
      ten_hien_thi: pickKtvField(raw, ["Tên hiển thị", "Ten hien thi", "ten_hien_thi"]),
      sdt: (() => {
        const v = pickKtvField(raw, ["SĐT", "Số điện thoại", "sdt"]);
        return v ? normalizeVnPhone(v) : v;
      })(),
      ghi_chu: pickKtvField(raw, ["Ghi chú", "Ghi chu", "ghi_chu"]),
      vai_tro_ktv: vaiTro,
      gmail: pickKtvField(raw, ["Gmail", "gmail"]),
      giam_sat_quan_ly: pickKtvField(raw, ["Email Giám sát quản lý", "Giám sát quản lý", "giam_sat_quan_ly"]),
      email_dang_nhap: pickKtvField(raw, ["Email đăng nhập", "Email dang nhap", "email_dang_nhap"]),
      khu_vuc_ma: pickKtvField(raw, ["Khu vực", "Khu vuc", "khu_vuc_ma"]),
      cong_no: congNoRaw ? Number(congNoRaw.replace(/[^\d.-]/g, "")) || undefined : undefined,
      ma_misa: pickKtvField(raw, ["Mã MISA", "Ma MISA", "ma_misa"]),
    });
  }
  return rows;
}
