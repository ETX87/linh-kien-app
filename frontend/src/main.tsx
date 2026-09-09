import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/ui/Toast";
import { App } from "./App";
import { capturePxkDeepLinkFromUrl } from "./lib/pxkDeepLink";
import "./styles/tokens.css";

// Ghi nho link truy cap truc tiep PXK (vd "/PMH-000001/") CANG SOM CANG TOT, truoc ca khi React mount -
// xem giai thich day du trong lib/pxkDeepLink.ts (can bat duoc URL truoc khi nguoi dung dieu huong sang
// Google OAuth neu chua dang nhap, luc do URL goc se mat).
capturePxkDeepLinkFromUrl();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 2 * 60_000 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
