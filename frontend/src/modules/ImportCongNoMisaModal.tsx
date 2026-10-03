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
// 2026-09-30 ("có thể import riêng cho nhiều cột hoặc từng cột, chỉ cần cột mã misa làm đối chiếu"): doc file xong hien
// buoc CHON COT (chi cac cot co du lieu trong file) - bo chon cot nao thi cot do KHONG gui len (giu nguyen gia tri cu).
// Them cot tuy chon "Mã KTV": dong co Mã KTV duoc khop theo Mã KTV va GAN/DOI Mã MISA = cot Mã MISA (cho KTV chua co
// ma MISA - khong the khop theo chinh ma MISA chua ton tai); chi ap khi chon cot "Mã MISA".

interface DongImport {
  ma_misa: string;
  ma_ktv?: string;
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
  ma_ktv: ["Mã KTV", "Ma KTV", "ma_ktv"],
  cong_no: ["Trần công nợ", "Tran cong no", "Công nợ", "Cong no", "cong_no"],
  han_muc_du_phong: ["Hạn mức dự phòng", "Han muc du phong", "han_muc_du_phong"],
  han_muc_du_phong_hien_tai: ["Hạn mức dự phòng hiện tại", "Han muc du phong hien tai", "han_muc_du_phong_hien_tai"],
  ten_misa: ["Tên trên MISA", "Ten tren MISA", "Tên MISA", "ten_misa"],
};

// Cac cot chon import duoc (thu tu hien thi). "ma_misa" = gan/doi Ma MISA theo Ma KTV.
type CotChon = "cong_no" | "han_muc_du_phong" | "han_muc_du_phong_hien_tai" | "ten_misa" | "ma_misa";
const COT_CHON: { key: CotChon; nhan: string }[] = [
  { key: "cong_no", nhan: "Trần công nợ" },
  { key: "han_muc_du_phong", nhan: "Hạn mức dự phòng" },
  { key: "han_muc_du_phong_hien_tai", nhan: "Hạn mức dự phòng hiện tại" },
  { key: "ten_misa", nhan: "Tên trên MISA" },
  { key: "ma_misa", nhan: "Mã MISA (gán/đổi theo cột Mã KTV)" },
];

const NHAN_LOI: Record<string, string> = {
  khong_tim_thay_ma_ktv: "Không có KTV nào mang Mã KTV này",
  ma_misa_cua_ktv_khac: "Mã MISA đã gán cho KTV khác",
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
    const maKtv = layO(raw, COT.ma_ktv);
    out.push({
      ma_misa: String(ma).trim(),
      ma_ktv: maKtv !== undefined ? String(maKtv).trim() || undefined : undefined,
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
    [
      { "Mã tài khoản MISA": "131-KTV001", "Mã KTV": "", "Trần công nợ": 5000000, "Hạn mức dự phòng": 2000000, "Hạn mức dự phòng hiện tại": 1500000, "Tên trên MISA": "" },
      { "Mã tài khoản MISA": "131-KTV002", "Mã KTV": "NS-1240", "Trần công nợ": "", "Hạn mức dự phòng": "", "Hạn mức dự phòng hiện tại": "", "Tên trên MISA": "Nguyễn Phi Long" },
    ],
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
  // Buoc chon cot: file da doc + cac cot co du lieu + cot dang chon.
  const [docDuoc, setDocDuoc] = useState<{ ten: string; rows: DongImport[]; coCot: CotChon[] } | null>(null);
  const [chon, setChon] = useState<Set<CotChon>>(new Set());

  function dong() {
    if (dangChay) return;
    setKetQua(null);
    setLoi([]);
    setDocDuoc(null);
    onClose();
  }

  async function docChon(file: File) {
    try {
      const rows = await docFile(file);
      if (rows.length === 0) {
        addToast('Không đọc được dòng nào (kiểm tra tiêu đề cột "Mã tài khoản MISA")');
        return;
      }
      const coCot = COT_CHON.map((c) => c.key).filter((k) =>
        k === "ma_misa" ? rows.some((r) => r.ma_ktv) : rows.some((r) => r[k] !== undefined && r[k] !== ""),
      );
      if (coCot.length === 0) {
        addToast("File chỉ có cột Mã MISA, không có cột nào để cập nhật");
        return;
      }
      setDocDuoc({ ten: file.name, rows, coCot });
      setChon(new Set(coCot));
    } catch (err) {
      addToast("Không đọc được file: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function chay() {
    if (!docDuoc || chon.size === 0) return;
    // Chi gui cac cot da chon - cot bo chon = undefined = backend giu nguyen gia tri cu.
    const rows: DongImport[] = docDuoc.rows.map((r) => ({
      ma_misa: r.ma_misa,
      ma_ktv: chon.has("ma_misa") ? r.ma_ktv : undefined,
      cong_no: chon.has("cong_no") ? r.cong_no : undefined,
      han_muc_du_phong: chon.has("han_muc_du_phong") ? r.han_muc_du_phong : undefined,
      han_muc_du_phong_hien_tai: chon.has("han_muc_du_phong_hien_tai") ? r.han_muc_du_phong_hien_tai : undefined,
      ten_misa: chon.has("ten_misa") ? r.ten_misa : undefined,
    }));
    setDangChay(true);
    setKetQua(null);
    setLoi([]);
    try {
      setTong(rows.length);
      setDaXuLy(0);
      let offset = 0;
      let success = 0;
      let errorCount = 0;
      const dsLoi: KetQuaChunk["details"] = [];
      while (offset < rows.length) {
        const res = await api.post<KetQuaChunk>("/settings/ktv-lien-he/bulk-import-cong-no-misa", { rows: rows.slice(offset, offset + 25), offset, total: rows.length } /* chi gui lo dang xu ly (2026-10-03) */);
        success += res.success;
        errorCount += res.errorCount;
        dsLoi.push(...res.details.filter((d) => d.status !== "thanh_cong"));
        offset = res.nextOffset;
        setDaXuLy(Math.min(offset, rows.length));
        if (res.done) break;
      }
      setKetQua({ success, errorCount });
      setLoi(dsLoi);
      setDocDuoc(null);
      await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
      addToast(`Đã import xong: ${success} thành công / ${rows.length} dòng`);
    } catch (err) {
      addToast("Lỗi import: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDangChay(false);
    }
  }

  return (
    <Modal open={open} onClose={dong} title="Import công nợ / hạn mức / MISA theo Mã MISA">
      <div className="space-y-3 text-sm">
        <div className="text-xs text-[var(--color-text-secondary)] space-y-1">
          <div>
            File Excel bắt buộc có cột <b>Mã tài khoản MISA</b> — mỗi dòng cập nhật đúng KTV mang mã đó (không tạo KTV mới).
          </div>
          <div>
            Các cột tuỳ chọn: <b>Trần công nợ</b>, <b>Hạn mức dự phòng</b>, <b>Hạn mức dự phòng hiện tại</b>, <b>Tên trên MISA</b> — chỉ cần có
            cột muốn cập nhật, đọc file xong chọn được import cột nào. Ô trống hoặc cột không chọn thì giữ nguyên giá trị cũ; số 0 vẫn được ghi.
          </div>
          <div>
            Gán/đổi <b>Mã MISA</b> cho KTV (kể cả KTV chưa có mã): thêm cột <b>Mã KTV</b> — dòng có Mã KTV sẽ khớp theo Mã KTV và ghi Mã MISA
            của dòng đó; dòng không có Mã KTV vẫn khớp theo Mã MISA.
          </div>
        </div>
        {!dangChay && !ketQua && docDuoc && (
          <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
            <div>
              File <b>{docDuoc.ten}</b>: <b>{docDuoc.rows.length}</b> dòng. Chọn cột cần import:
            </div>
            <div className="space-y-1.5">
              {COT_CHON.filter((c) => docDuoc.coCot.includes(c.key)).map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={chon.has(c.key)}
                    onChange={(e) => {
                      const next = new Set(chon);
                      if (e.target.checked) next.add(c.key);
                      else next.delete(c.key);
                      setChon(next);
                    }}
                  />
                  {c.nhan}
                  {c.key === "ma_misa" && (
                    <span className="text-xs text-[var(--color-text-secondary)]">({docDuoc.rows.filter((r) => r.ma_ktv).length} dòng có Mã KTV)</span>
                  )}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Btn variant="ghost" size="sm" onClick={() => setDocDuoc(null)}>
                Chọn file khác
              </Btn>
              <Btn size="sm" disabled={chon.size === 0} onClick={() => void chay()}>
                Import {chon.size} cột
              </Btn>
            </div>
          </div>
        )}
        {!dangChay && !ketQua && !docDuoc && (
          <div className="flex flex-wrap gap-2">
            <Btn variant="ghost" size="sm" onClick={() => void taiFileMau()}>
              ⬇ Tải file mẫu
            </Btn>
            <FileButton accept=".xlsx,.xls" variant="subtle" onFileSelected={(f) => void docChon(f)}>
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
