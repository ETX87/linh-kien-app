import { useSyncExternalStore } from "react";
import { store } from "../services/store";

// Re-render khi store phat su kien. Tra ve thang cac getter (mang moi moi lan mutate).
export function useOrders() {
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return store.getOrders();
}
export function useReturns() {
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return store.getReturns();
}
export function useNotifications() {
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return store.getNotifications();
}
