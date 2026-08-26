import { useEffect, useState } from "react";
import { api } from "../api/client";

// Bat/tat Web Push tren THIET BI NAY (phan hoi 2026-08-26: "Khi có tin nhắn thông báo mới => đẩy
// thông báo lập tức... nếu dùng điện thoại thì đẩy qua hệ thống thông báo, web thì đẩy 1 thông báo
// popup") - CHI 1 co che (Web Push API chuan qua Service Worker, xem public/sw.js), trinh duyet/OS
// tu quyet dinh hien nhu he thong thong bao (mobile) hay popup goc man hinh (desktop). LUU Y: Safari
// tren iOS CHI ho tro Push khi app da duoc "Cài đặt vào màn hình chính" (khong hoat dong tren tab
// Safari thuong) - "supported" duoi day tu dong false trong truong hop do, nut bat se an di thay vi
// hien loi kho hieu.
const SUPPORTED = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!SUPPORTED) {
      setChecked(true);
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSubscribed(false))
      .finally(() => setChecked(true));
  }, []);

  async function subscribe() {
    if (!SUPPORTED || busy) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await api.get<{ publicKey: string }>("/push/vapid-public-key");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON();
      await api.post("/push/subscribe", { endpoint: json.endpoint, keys: json.keys });
      setSubscribed(true);
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    if (!SUPPORTED || busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.post("/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }

  return { supported: SUPPORTED, checked, subscribed, busy, subscribe, unsubscribe };
}
