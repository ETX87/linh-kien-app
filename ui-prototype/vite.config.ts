import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Prototype UI doc lap (xem ui-prototype/README.md) - port 5175 de KHONG dung do voi he goc (5173),
// frontend that (5174), worker (8788). Khong proxy /api: prototype chi dung mock data.
export default defineConfig({
  plugins: [react()],
  server: { port: 5175, strictPort: false },
  build: { outDir: "dist" },
});
