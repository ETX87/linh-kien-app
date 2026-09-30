import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

// Doc so tien tren anh chuyen khoan NGAY TREN TRINH DUYET (2026-09-30, lib/docTienAnh.ts): tesseract.js tu dat tren web
// minh (khong tai tu CDN ngoai) - chep worker + 3 bien the loi LSTM + du lieu tieng Viet (best_int, 1,4 MB) vao
// public/ocr moi lan build/dev. public/ocr nam trong .gitignore (file lon, lay lai tu node_modules).
function ocrAssets(): Plugin {
  const pkgDir = (name: string) => dirname(require.resolve(`${name}/package.json`));
  const chep = () => {
    const out = join(here, "public", "ocr");
    const files: [string, string][] = [
      [join(pkgDir("tesseract.js"), "dist", "worker.min.js"), join(out, "worker.min.js")],
      ...["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"].map(
        (f) => [join(pkgDir("tesseract.js-core"), f), join(out, "core", f)] as [string, string],
      ),
      [join(pkgDir("@tesseract.js-data/vie"), "4.0.0_best_int", "vie.traineddata.gz"), join(out, "lang", "vie.traineddata.gz")],
    ];
    for (const [src, dst] of files) {
      if (existsSync(dst) && statSync(dst).size === statSync(src).size) continue;
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
  };
  return { name: "ocr-assets", buildStart: chep };
}

// Port RIENG voi he DVBH goc (5173/8787) de 2 he chay dev song song khong dung do - xem CLAUDE.md.
export default defineConfig({
  plugins: [react(), ocrAssets()],
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
