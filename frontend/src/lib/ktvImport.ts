// Tach tu SettingsModule.tsx (2026-08-26, xay lai quan ly tai khoan/vai tro - tab "Danh sach KTV"
// chuyen sang UsersModule.tsx lam the "KTV hien truong", con file nay giu lai phan parse Excel dung
// chung, tranh nhan doi logic).

export interface BulkImportKtvRow {
  ma_ktv: string; ten_hien_thi?: string; sdt?: string; ghi_chu?: string;
  vai_tro_ktv?: string; gmail?: string; giam_sat_quan_ly?: string; email_dang_nhap?: string;
  khu_vuc_ma?: string; cong_no?: number;
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
      sdt: pickKtvField(raw, ["SĐT", "Số điện thoại", "sdt"]),
      ghi_chu: pickKtvField(raw, ["Ghi chú", "Ghi chu", "ghi_chu"]),
      vai_tro_ktv: vaiTro,
      gmail: pickKtvField(raw, ["Gmail", "gmail"]),
      giam_sat_quan_ly: pickKtvField(raw, ["Email Giám sát quản lý", "Giám sát quản lý", "giam_sat_quan_ly"]),
      email_dang_nhap: pickKtvField(raw, ["Email đăng nhập", "Email dang nhap", "email_dang_nhap"]),
      khu_vuc_ma: pickKtvField(raw, ["Khu vực", "Khu vuc", "khu_vuc_ma"]),
      cong_no: congNoRaw ? Number(congNoRaw.replace(/[^\d.-]/g, "")) || undefined : undefined,
    });
  }
  return rows;
}
