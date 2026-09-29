import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Modal } from "../components/ui/Modal";
import { Btn } from "../components/ui/Btn";
import { FileButton } from "../components/ui/FileButton";
import { exportRowsToExcel } from "../lib/exportExcel";
import { boDau } from "../lib/boDau";

// Import cong no / han muc du phong THEO MA TAI KHOAN MISA cho Ke toan (2026-09-29, "Bổ sung thêm chức năng import ở
// Danh sách KTV cho vai trò kế toán, họ có thể import trần công nợ... dựa theo Mã tài khoản MISA") - goi
// POST /settings/ktv-lien-he/bulk-import-cong-no-misa (chi 4 truong da uy quyen cho Ke toan, khop dong theo ma_misa,
// khong tao KTV moi). Khac "Nhập danh sách hàng loạt" cua Admin (khop theo Mã KTV, sua duoc moi truong).

interface DongImport {
  ma_misa: string;
  cong_no?: number;
  han_muc_du_phong?: number;
  han_muc_du_phong_hien_tai?: number;
  ten_misa?: string;
}
interface KetQuaChunk {
  done: boolean;
  nextOffset: number;
  success: number;
  errorCount: number;
  details: { ma_misa: string; status: string; ma_ktv?: string }[];
}

const COT = {
  ma_misa: ["Mã tài khoản MISA", "Mã MISA", "Ma MISA", "Mã tài khoản", "ma_misa"],
  cong_no: ["Trần công nợ", "Tran cong no", "Công nợ", "Cong no", "cong_no"],
  han_muc_du_phong: ["Hạn mức dự phòng", "Han muc du phong", "han_muc_du_phong"],
  han_muc_du_phong_hien_tai: ["Hạn mức dự phòng hiện tại", "Han muc du phong hien tai", "han_muc_du_phong_hien_tai"],
  ten_misa: ["Tên trên MISA", "Ten tren MISA", "Tên MISA", "ten_misa"],
};

const NHAN_LOI: Record<string, string> = {
  thieu_ma_misa: "Thiếu mã MISA",
  khong_tim_thay: "Không có KTV nào mang mã MISA này",
  trung_ma_misa: "Nhiều KTV cùng mã MISA - sửa tay từng KTV",
  khong_co_du_lieu: "Dòng không có cột nào để cập nhật",
  loi_ghi_db: "Lỗi ghi dữ liệu",
};

// Khop tieu de cot KHONG dau / khong phan biet hoa-thuong / bo khoang trang thua ("Mã tài khoản MISA " = "ma tai khoan misa").
function layO(raw: Record<string, unknown>, keys: string[]): unknown {
  const can = new Set(keys.map(boDau));
  for (const [k, v] of Object.entries(raw)) if (can.has(boDau(k)) && v != null && v !== "") return v;
  return undefined;
}
// So: o trong = bo qua (giu gia tri cu); 0 la gia tri hop le (khac parser import Admin cu bo mat so 0).
function laySo(raw: Record<string, unknown>, keys: string[]): number | undefined {
  const v = layO(raw, keys);
  if (v === undefined) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const s = String(v).replace(/[^\d.-]/g, "");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

async function docFile(file: File): Promise<DongImport[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null });
  const out: DongImport[] = [];
  for (const raw of rawRows) {
    const ma = layO(raw, COT.ma_misa);
    if (ma === undefined) continue;
    const ten = layO(raw, COT.ten_misa);
    out.push({
      ma_misa: String(ma).trim(),
      cong_no: laySo(raw, COT.cong_no),
      han_muc_du_phong: laySo(raw, COT.han_muc_du_phong),
      han_muc_du_phong_hien_tai: laySo(raw, COT.han_muc_du_phong_hien_tai),
      ten_misa: ten !== undefined ? String(ten).trim() : undefined,
    });
  }
  return out;
}

async function taiFileMau() {
  await exportRowsToExcel(
    [{ "Mã tài khoản MISA": "131-KTV001", "Trần công nợ": 5000000, "Hạn mức dự phòng": 2000000, "Hạn mức dự phòng hiện tại": 1500000, "Tên trên MISA": "" }],
    "mau_import_cong_no_misa.xlsx",
    "Import",
  );
}

export function ImportCongNoMisaModal({ open, onClose, addToast }: { open: boolean; onClose: () => void; addToast: (msg: string) => void }) {
  const qc = useQueryClient();
  const [dangChay, setDangChay] = useState(false);
  const [tong, setTong] = useState(0);
  const [daXuLy, setDaXuLy] = useState(0);
  const [ketQua, setKetQua] = useState<{ success: number; errorCount: number } | null>(null);
  const [loi, setLoi] = useState<KetQuaChunk["details"]>([]);

  function dong() {
    if (dangChay) return;
    setKetQua(null);
    setLoi([]);
    onClose();
  }

  async function chay(file: File) {
    setDangChay(true);
    setKetQua(null);
    setLoi([]);
    try {
      const rows = await docFile(file);
      if (rows.length === 0) {
        addToast('Không đọc được dòng nào (kiểm tra tiêu đề cột "Mã tài khoản MISA")');
        return;
      }
      setTong(rows.length);
      setDaXuLy(0);
      let offset = 0;
      let success = 0;
      let errorCount = 0;
      const dsLoi: KetQuaChunk["details"] = [];
      while (offset < rows.length) {
        const res = await api.post<KetQuaChunk>("/settings/ktv-lien-he/bulk-import-cong-no-misa", { rows, offset });
        success += res.success;
        errorCount += res.errorCount;
        dsLoi.push(...res.details.filter((d) => d.status !== "thanh_cong"));
        offset = res.nextOffset;
        setDaXuLy(Math.min(offset, rows.length));
        if (res.done) break;
      }
      setKetQua({ success, errorCount });
      setLoi(dsLoi);
      await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
      addToast(`Đã import xong: ${success} thành công / ${rows.length} dòng`);
    } catch (err) {
      addToast("Lỗi import: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDangChay(false);
    }
  }

  return (
    <Modal open={open} onClose={dong} title="Import công nợ / hạn mức theo Mã MISA">
      <div className="space-y-3 text-sm">
        <div className="text-xs text-[var(--color-text-secondary)] space-y-1">
          <div>
            File Excel bắt buộc có cột <b>Mã tài khoản MISA</b> — mỗi dòng cập nhật đúng KTV mang mã đó (không tạo KTV mới).
          </div>
          <div>
            Các cột tuỳ chọn: <b>Trần công nợ</b>, <b>Hạn mức dự phòng</b>, <b>Hạn mức dự phòng hiện tại</b>, <b>Tên trên MISA</b>. Ô trống hoặc
            thiếu cột thì giữ nguyên giá trị cũ; số 0 vẫn được ghi.
          </div>
        </div>
        {!dangChay && !ketQua && (
          <div className="flex flex-wrap gap-2">
            <Btn variant="ghost" size="sm" onClick={() => void taiFileMau()}>
              ⬇ Tải file mẫu
            </Btn>
            <FileButton accept=".xlsx,.xls" variant="subtle" onFileSelected={(f) => void chay(f)}>
              ⬆ Chọn file Excel
            </FileButton>
          </div>
        )}
        {dangChay && (
          <div>
            Đang xử lý... {daXuLy}/{tong} dòng
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--color-subtle)]">
              <div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${tong ? Math.min(100, (daXuLy / tong) * 100) : 0}%` }} />
            </div>
          </div>
        )}
        {ketQua && (
          <div className="space-y-2">
            <div>
              ✅ Thành công: <b>{ketQua.success}</b> · Lỗi: <b>{ketQua.errorCount}</b>
            </div>
            {loi.length > 0 && (
              <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--color-border)] p-2 text-xs">
                {loi.map((d, i) => (
                  <div key={i}>
                    <span className="font-mono">{d.ma_misa}</span>: {NHAN_LOI[d.status] ?? d.status}
                    {d.ma_ktv && <span className="text-[var(--color-text-secondary)]"> ({d.ma_ktv})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end">
          <Btn variant="ghost" onClick={dong} disabled={dangChay}>
            {ketQua ? "Đóng" : "Hủy"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
