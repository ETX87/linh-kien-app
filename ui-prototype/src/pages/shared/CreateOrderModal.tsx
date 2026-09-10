import { useMemo, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Btn } from "../../components/ui/Btn";
import { Icon } from "../../components/ui/Icon";
import { FormField, Select, TextInput, TextArea } from "../../components/ui/Form";
import { Badge } from "../../components/ui/Badge";
import { PARTS, LOAI_DE_XUAT } from "../../mock/catalog";
import { KTV_LIST } from "../../mock/people";
import { fmtVND } from "../../lib/format";
import { useToast } from "../../components/ui/Toast";
import { store } from "../../services/store";
import { usePersona } from "../../hooks/usePersona";
import type { Order } from "../../types";

interface Line {
  ma: string;
  ten: string;
  sl: number;
  gia: number;
  uuTien: boolean;
}

export function CreateOrderModal({ open, onClose, mobile, onOpenImport }: { open: boolean; onClose: () => void; mobile?: boolean; onOpenImport?: () => void }) {
  const toast = useToast();
  const { persona } = usePersona();
  const [nguoiNhan, setNguoiNhan] = useState(KTV_LIST[1].email);
  const [loaiDeXuat, setLoaiDeXuat] = useState(LOAI_DE_XUAT[0]);
  const [q, setQ] = useState("");
  const [sl, setSl] = useState(1);
  const [uuTien, setUuTien] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [ghiChu, setGhiChu] = useState("");
  const [hoaDon, setHoaDon] = useState("Có");
  const [maCase, setMaCase] = useState("");
  const [caseChecked, setCaseChecked] = useState(false);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return PARTS.filter((p) => p.batTat && (p.ma.toLowerCase().includes(s) || p.ten.toLowerCase().includes(s))).slice(0, 4);
  }, [q]);

  const tong = lines.reduce((a, l) => a + l.sl * l.gia, 0);

  function addLine(ma: string) {
    const p = PARTS.find((x) => x.ma === ma);
    if (!p) return;
    setLines((s) => [...s, { ma: p.ma, ten: p.ten, sl, gia: p.giaBan ?? 0, uuTien }]);
    setQ("");
    setSl(1);
    setUuTien(false);
  }

  function submit() {
    if (!lines.length) {
      toast("Chưa thêm dòng linh kiện nào", "danger");
      return;
    }
    const k = KTV_LIST.find((x) => x.email === nguoiNhan)!;
    const l0 = lines[0];
    const isCn = /công nợ/i.test(loaiDeXuat);
    const o: Order = {
      id: "DH-" + (2500 + Math.floor(Math.random() * 90)),
      loai: isCn ? "cong_no" : "mua",
      maLk: l0.ma,
      tenLk: l0.ten,
      loaiDeXuat,
      slDeXuat: l0.sl,
      slThucXuat: null,
      giaDeXuat: tong,
      giaChot: null,
      soTienCongNo: isCn ? tong : null,
      danhGiaCongNo: isCn ? "Đủ" : null,
      nguoiTao: persona.email,
      nguoiTaoTen: persona.ten,
      taoHo: nguoiNhan !== persona.email,
      nguoiNhanHang: nguoiNhan,
      nguoiNhanHangTen: k.ten,
      emailGs: k.giamSat,
      gsTen: k.gsTen,
      tram: k.tramCha,
      khuVuc: k.khuVuc,
      ngayTao: new Date().toISOString(),
      ghiChu,
      yeuCauHoaDon: hoaDon,
      ttMailDuyet: persona.email,
      ttKhachHang: "—",
      chinhSach: "Theo chính sách hiện hành",
      maYeuCauSuCo: maCase.trim() || null,
      uuTien: lines.some((l) => l.uuTien),
      trangThai: k.tramCha ? "Chờ Trạm duyệt" : "Chờ TN duyệt",
      quaHan: false,
      lyDoCham: null,
      tranCongNo: isCn ? 10_000_000 : null,
      cases: [],
      logs: [{ trangThai: "Đơn tạo", nguoiXuLy: persona.ten, ngayXuLy: new Date().toISOString(), ghiChu: null }],
      giaiTrinh: [],
    };
    store.createOrder(o);
    toast("Đã tạo đơn " + o.id);
    setLines([]);
    setGhiChu("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tạo đơn mới"
      width="720px"
      fullScreenMobile
      mobile={mobile}
      footer={
        <>
          <Btn variant="ghost" size="sm" onClick={onOpenImport}>
            <Icon.upload size={14} /> Nhập Excel
          </Btn>
          <Btn variant="ghost" size="sm" onClick={onClose}>
            Huỷ
          </Btn>
          <Btn size="sm" onClick={submit}>
            Tạo đơn
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Người nhận hàng">
          <Select value={nguoiNhan} onChange={setNguoiNhan} options={KTV_LIST.map((k) => ({ value: k.email, label: `${k.ten} · ${k.vaiTro}` }))} />
        </FormField>
        <FormField label="Loại đề xuất">
          <Select value={loaiDeXuat} onChange={setLoaiDeXuat} options={LOAI_DE_XUAT.map((l) => ({ value: l, label: l }))} />
        </FormField>
      </div>

      <div className="mt-3 rounded-lg border border-[var(--color-border)] p-2.5">
        <FormField label="Chọn linh kiện">
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã / tên linh kiện…" />
        </FormField>
        {results.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {results.map((p) => (
              <li key={p.ma}>
                <button
                  onClick={() => addLine(p.ma)}
                  className="focus-ring flex w-full items-center gap-2.5 rounded-lg border border-[var(--color-border)] p-2 text-left text-[12.5px] hover:border-[var(--color-primary)]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-[var(--color-neutral-soft)] text-[var(--color-text-faint)]">
                    <Icon.package size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[var(--color-text)]">
                      <span className="font-mono">{p.ma}</span> — {p.ten}
                    </span>
                    <span className="text-[11px] text-[var(--color-text-secondary)]">Hãng: {p.hang}</span>
                    {p.thayThe.length > 0 && <span className="ml-2 text-[11px] text-[var(--color-primary)]">Có thể thay bằng {p.thayThe.join(", ")}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono font-semibold text-[var(--color-success)]">{fmtVND(p.giaBan)}</span>
                    <span className="flex justify-end gap-1">
                      {p.dacThu && <Badge tone="warning">Đặc thù</Badge>}
                      {p.chiSuaChua && <Badge tone="purple">Only sửa chữa</Badge>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex items-end gap-2">
          <FormField label="Số lượng">
            <TextInput type="number" min={1} value={sl} onChange={(e) => setSl(Math.max(1, +e.target.value))} className="w-24" />
          </FormField>
          <label className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold">
            <input type="checkbox" checked={uuTien} onChange={(e) => setUuTien(e.target.checked)} className="h-4 w-4 accent-[var(--color-star)]" />
            <Icon.star size={13} className="text-[var(--color-star)]" /> Ưu tiên
          </label>
          <span className="mb-1.5 ml-auto text-[11px] text-[var(--color-text-faint)]">Gõ tên để tìm rồi bấm chọn từ danh sách</span>
        </div>
      </div>

      {lines.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-[var(--color-surface-soft)] text-left text-[var(--color-text-secondary)]">
                <th className="px-2.5 py-1.5">Mã LK</th>
                <th className="px-2.5 py-1.5">Tên</th>
                <th className="px-2.5 py-1.5 text-right">SL</th>
                <th className="px-2.5 py-1.5 text-right">Giá</th>
                <th className="px-2.5 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-[var(--color-border)]">
                  <td className="px-2.5 py-1.5 font-mono">
                    {l.ma} {l.uuTien && <Icon.star size={11} className="inline text-[var(--color-star)]" />}
                  </td>
                  <td className="px-2.5 py-1.5">{l.ten}</td>
                  <td className="px-2.5 py-1.5 text-right tabular">{l.sl}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono">{fmtVND(l.sl * l.gia)}</td>
                  <td className="px-2.5 py-1.5 text-right">
                    <button onClick={() => setLines((s) => s.filter((_, j) => j !== i))} className="focus-ring text-[var(--color-text-faint)] hover:text-[var(--color-danger)]">
                      <Icon.x size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-[var(--color-border)] font-semibold">
                <td className="px-2.5 py-1.5" colSpan={3}>
                  Tổng giá đề xuất
                </td>
                <td className="px-2.5 py-1.5 text-right font-mono text-[var(--color-success)]">{fmtVND(tong)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FormField label="Ghi chú">
          <TextArea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} placeholder="Ghi chú cho đơn…" />
        </FormField>
        <div className="space-y-2">
          <FormField label="Yêu cầu hoá đơn">
            <Select value={hoaDon} onChange={setHoaDon} options={[{ value: "Có", label: "Có" }, { value: "Không", label: "Không" }]} />
          </FormField>
          <FormField label="Mã yêu cầu sự cố (case)" hint="Nhập mã hợp lệ là case tự đính kèm vào đơn.">
            <div className="flex gap-1.5">
              <TextInput value={maCase} onChange={(e) => { setMaCase(e.target.value); setCaseChecked(false); }} placeholder="CS-2026-…" />
              <Btn variant="ghost" size="sm" onClick={() => { setCaseChecked(true); toast(maCase ? "Case hợp lệ: KH ABC · Hà Nội" : "Nhập mã case trước", maCase ? "success" : "danger"); }}>
                Kiểm tra
              </Btn>
            </div>
          </FormField>
          {caseChecked && maCase && (
            <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-soft)]/50 p-2 text-[11.5px] text-[var(--color-text-secondary)]">
              ✓ Sẽ đính kèm — KTV: Nguyễn Văn A · KH: KH ABC · Khu vực: Hà Nội · Hãng: Samsung · Tiến độ: Đang xử lý
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
