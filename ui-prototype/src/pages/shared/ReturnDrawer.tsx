import { useEffect, useState } from "react";
import type { ReturnOrder } from "../../types";
import { Drawer } from "../../components/ui/Drawer";
import { Tabs } from "../../components/ui/Tabs";
import { Badge } from "../../components/ui/Badge";
import { Btn } from "../../components/ui/Btn";
import { Icon } from "../../components/ui/Icon";
import { KvRow, SectionTitle } from "../../components/ui/Card";
import { Timeline } from "../../components/ui/Timeline";
import { CaseList } from "../../components/ui/Misc";
import { TextArea } from "../../components/ui/Form";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { fmtVND, fmtDateTime } from "../../lib/format";
import { usePersona } from "../../hooks/usePersona";
import { returnRowActions, returnsReadOnly } from "../../lib/permissions";
import { store } from "../../services/store";
import { useToast } from "../../components/ui/Toast";

export function ReturnDrawer({
  row,
  onClose,
  nav,
  mobile,
}: {
  row: ReturnOrder | null;
  onClose: () => void;
  nav?: { hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void };
  mobile?: boolean;
}) {
  const { persona } = usePersona();
  const toast = useToast();
  const [tab, setTab] = useState("info");
  const [gt, setGt] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setTab("info");
    setGt("");
  }, [row?.id]);

  if (!row) return null;
  const readOnly = returnsReadOnly(persona);
  const acts = returnRowActions(persona, row);
  const canAdvance = acts.some((a) => a.kind === "success");
  const canStepBack = acts.some((a) => a.label === "Lùi bước");

  return (
    <>
      <Drawer
        open={!!row}
        onClose={onClose}
        mobile={mobile}
        nav={nav}
        title={
          <>
            <span className="font-mono text-[15px] font-bold text-[var(--color-text)]">{row.id}</span>
            {row.uuTien && <Icon.star size={15} className="text-[var(--color-star)]" />}
            <Badge tone="warning" variant="soft">
              {row.buoc}
            </Badge>
          </>
        }
        footer={
          readOnly ? undefined : (
            <div className="flex flex-wrap items-center gap-2">
              {canAdvance && (
                <Btn size="sm" variant="success" onClick={() => { store.advanceReturn(row.id, persona.ten); toast("Đã duyệt " + row.id); }}>
                  Duyệt
                </Btn>
              )}
              <Btn size="sm" variant="danger" onClick={() => setConfirm(true)}>
                Từ chối <Icon.chevronDown size={13} />
              </Btn>
              {canStepBack && (
                <Btn size="sm" variant="ghost" onClick={() => { store.stepBackReturn(row.id, persona.ten); toast("Đã lùi bước " + row.id); }}>
                  Lùi bước
                </Btn>
              )}
              <Btn variant="ghost" size="sm" onClick={() => toast("Huỷ yêu cầu trả hàng (mô phỏng)", "info")}>
                Huỷ đơn
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => toast("Mở form sửa đơn (mô phỏng)", "info")}>
                Sửa đơn
              </Btn>
              {canAdvance && nav?.hasNext && (
                <Btn
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    store.advanceReturn(row.id, persona.ten);
                    toast("Đã duyệt, sang đơn tiếp theo");
                    nav.onNext();
                  }}
                >
                  Duyệt và tiếp theo <Icon.arrowRight size={14} />
                </Btn>
              )}
            </div>
          )
        }
      >
        <Tabs
          size="sm"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "info", label: "Thông tin đơn" },
            { key: "case", label: "Case", count: row.cases.length },
            { key: "log", label: "Lịch sử xử lý" },
            { key: "giaitrinh", label: "Giải trình", count: row.giaiTrinh.length },
          ]}
        />

        {tab === "info" && (
          <div className="pt-3">
            <SectionTitle right={<Icon.chevronDown size={14} className="text-[var(--color-text-faint)]" />}>Thông tin đơn trả hàng</SectionTitle>
            <div className="grid grid-cols-2 gap-x-5">
              <KvRow label="Loại đơn">Trả hàng</KvRow>
              <KvRow label="Mã linh kiện">
                <span className="font-mono">{row.maLk}</span> — {row.tenLk}
              </KvRow>
              <KvRow label="SL đề xuất / thực xuất">
                {row.slDeXuat} / {row.slThucXuat ?? "—"}
              </KvRow>
              <KvRow label="Giá xuất / chốt">
                <span className="font-mono">{fmtVND(row.giaDeXuat)}</span> / <span className="font-mono">{fmtVND(row.giaChot)}</span>
              </KvRow>
              <KvRow label="Loại đề xuất">{row.loaiDeXuat}</KvRow>
              <KvRow label="Người nhận hàng">
                {row.nguoiNhanHangTen}
                <span className="block text-[11px] text-[var(--color-text-secondary)]">GS: {row.gsTen}</span>
              </KvRow>
              <KvRow label="Người tạo">
                {row.nguoiTaoTen} {row.taoHo && <span className="text-[var(--color-text-secondary)]">(tạo hộ)</span>}
              </KvRow>
              <KvRow label="Ngày tạo">{fmtDateTime(row.ngayTao)}</KvRow>
              <KvRow label="Khu vực">{row.khuVuc}</KvRow>
              <KvRow label="Ghi chú">{row.ghiChu ?? "—"}</KvRow>
              <KvRow label="Yêu cầu hoá đơn">{row.yeuCauHoaDon ?? "—"}</KvRow>
              <KvRow label="TT mail duyệt">{row.ttMailDuyet ?? "—"}</KvRow>
              <KvRow label="TT khách hàng">{row.ttKhachHang ?? "—"}</KvRow>
              <KvRow label="Chính sách">{row.chinhSach ?? "—"}</KvRow>
              <KvRow label="Mã yêu cầu sự cố">
                {row.maYeuCauSuCo ? <span className="font-mono text-[var(--color-primary)]">{row.maYeuCauSuCo}</span> : "—"}
              </KvRow>
            </div>

            <div className="mt-3 rounded-lg border border-[var(--color-border)] p-2.5">
              <div className="mb-1 flex items-center gap-2 text-[12.5px] font-semibold">
                <span className="text-[var(--color-success)]">✓ Đủ trong hạn</span>
                <span className="ml-auto font-mono text-[12px] text-[var(--color-text-secondary)]">5.000.000đ / 10.000.000đ</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-neutral-soft)]">
                <div className="h-full w-1/2 rounded-full bg-[var(--color-primary)]" />
              </div>
            </div>

            <div className="mt-3">
              <SectionTitle>Ảnh linh kiện trả</SectionTitle>
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-[var(--color-border-strong)] text-[var(--color-text-faint)]">
                    <Icon.file size={16} />
                  </div>
                ))}
              </div>
              <div className="mt-1 text-[11px] text-[var(--color-text-faint)]">Bắt buộc 1–3 ảnh khi tạo đơn trả hàng (mô phỏng).</div>
            </div>
          </div>
        )}

        {tab === "case" && (
          <div className="pt-3">
            <SectionTitle>Case đính kèm</SectionTitle>
            <CaseList cases={row.cases} onAttach={() => toast("Gắn thêm case (mô phỏng)", "info")} />
          </div>
        )}

        {tab === "log" && (
          <div className="pt-3">
            <SectionTitle>Lịch sử xử lý</SectionTitle>
            <Timeline logs={row.logs} />
          </div>
        )}

        {tab === "giaitrinh" && (
          <div className="pt-3">
            <div className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)]/50 p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--color-danger)]">
                <Icon.alert size={14} /> Giải trình lý do chậm
              </div>
              <TextArea value={gt} onChange={(e) => setGt(e.target.value)} placeholder="Nhập lý do giải trình…" />
              <div className="mt-1.5 flex justify-end">
                <Btn size="xs" disabled={!gt.trim()} onClick={() => { store.addGiaiTrinh(row.id, gt.trim(), persona.ten); setGt(""); toast("Đã lưu giải trình"); }}>
                  Lưu giải trình
                </Btn>
              </div>
            </div>
            <div className="mt-3">
              <SectionTitle>Lịch sử giải trình</SectionTitle>
              {row.giaiTrinh.length === 0 && <div className="text-[12px] text-[var(--color-text-secondary)]">Chưa có lần giải trình nào.</div>}
              <ul className="space-y-2">
                {row.giaiTrinh.map((g, i) => (
                  <li key={i} className="rounded-lg border border-[var(--color-border)] p-2 text-[12.5px]">
                    <div>{g.noiDung}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--color-text-faint)]">
                      {g.nguoiTao} · {fmtDateTime(g.ngayTao)} {g.lanDau && "· Lần đầu"}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        mobile={mobile}
        title={`Từ chối trả hàng ${row.id}`}
        danger
        confirmLabel="Xác nhận từ chối"
        noteLabel="Lý do từ chối"
        message="Bắt buộc ghi rõ lý do từ chối."
        onConfirm={({ note }) => {
          store.rejectReturn(row.id, persona.ten, note ?? "");
          setConfirm(false);
          toast("Đã từ chối " + row.id, "danger");
        }}
      />
    </>
  );
}
