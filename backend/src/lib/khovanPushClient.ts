import type { Env } from "../types";

// Day phieu xuat kho (phieu_xuat_kho) sang khovan (he Quan ly hang ve kho) - danh dau
// "cho xu ly" (pending) ben do - de Kho biet truoc hang sap can xu ly, nhan dien duoc
// khi quet ma (nguyen tac "Kho chi thao tac qua app kho van", chot 2026-09-07). Goi LUC
// "Da chot xong don xuat" (Ke toan chot xong, moc ban giao sang Kho) - AP DUNG CHO CA
// loai_don thuong (mua/cong_no, Kho se "Gui cho KTV"/"Hang tru kho" tu khovan) VA
// loai_don='tra_hang' (Kho se "Nhan hang tra" tu khovan) - phan biet nhanh nao qua
// sender_info.loai_don (xem lib/orderPrefix.ts + routes/shipments.ts ben khovan).
// Tai dung KHOVAN_SYNC_SERVICE/KHOVAN_SYNC_API_KEY da co san (dvbhSyncClient.ts dung
// cho dong bo KTV) - cung 1 Worker khovan, cung 1 external_systems.api_key, chi khac
// duong dan goi (inbound/orders thay vi partner/sync/ktv), khong can secret rieng.
// Best-effort: loi/khovan down KHONG duoc chan thao tac cua nguoi dung (chi log).
export async function pushPxkToKhovan(env: Env, orderCode: string, senderName: string, loaiDon: string | null, note: string): Promise<void> {
  const url = `${env.KHOVAN_SYNC_BASE_URL.replace(/\/$/, "")}/api/v1/inbound/orders`;
  try {
    const res = await env.KHOVAN_SYNC_SERVICE.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": env.KHOVAN_SYNC_API_KEY },
      body: JSON.stringify({
        order_code: orderCode,
        sender_name: senderName,
        sender_info: { loai_don: loaiDon },
        note,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[khovanPush] fetch that bai", res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.error("[khovanPush] exception", err instanceof Error ? err.message : err);
  }
}
