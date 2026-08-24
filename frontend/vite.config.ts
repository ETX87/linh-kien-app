import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port RIENG voi he DVBH goc (5173/8787) de 2 he chay dev song song khong dung do - xem CLAUDE.md.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:8788",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
