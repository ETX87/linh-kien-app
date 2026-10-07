// Kiem tra cau giao dien chua co ban dich EN/ID (xem src/i18n/index.tsx).
//   node frontend/scripts/kiem-tra-dich.mjs          -> in so cau thieu + danh sach
//   node frontend/scripts/kiem-tra-dich.mjs --json   -> in JSON mang cau thieu (de bo sung tu dien)
// Nguon cau: moi t("...") / t('...') trong src + moi chuoi co dau tieng Viet trong cac file HANG SO duoc dich luc hien thi
// (nhan trang thai, menu, thong bao loi) - FILE_HANG_SO ben duoi.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const FILE_HANG_SO = ["layout/navConfig.ts", "modules/datMuaLinhKien/constants.ts", "modules/datMuaLinhKien/PipelineFlow.tsx", "modules/datMuaLinhKien/LoaiChietKhau.tsx"];
// Nhan the "Trang chu" do backend tra ve (luong-quy-trinh / home-summary) - StatCard tu tn() nen chi can co trong tu dien.
const FILE_NHAN_BACKEND = ["../../backend/src/routes/datMuaLinhKien.ts"];
const VIET = /[À-ỹđĐ]/;

function duyet(dir, out = []) {
  for (const ten of readdirSync(dir)) {
    const p = join(dir, ten);
    if (statSync(p).isDirectory()) duyet(p, out);
    else if (/\.(tsx?|mjs)$/.test(ten) && !p.includes(`${join("src", "i18n")}`)) out.push(p);
  }
  return out;
}

function boChuThich(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

function giaiChuoi(raw, q) {
  return raw.replace(new RegExp(`\\\\${q}`, "g"), q).replace(/\\n/g, "\n");
}

const khoa = new Set();
for (const f of duyet(SRC)) {
  const s = boChuThich(readFileSync(f, "utf8"));
  for (const m of s.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) khoa.add(giaiChuoi(m[1], '"'));
  for (const m of s.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) khoa.add(giaiChuoi(m[1], "'"));
}
for (const rel of FILE_HANG_SO) {
  const s = boChuThich(readFileSync(join(SRC, rel), "utf8"));
  for (const m of s.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const v = giaiChuoi(m[1], '"');
    if (VIET.test(v)) khoa.add(v);
  }
}

for (const rel of FILE_NHAN_BACKEND) {
  const s = boChuThich(readFileSync(join(SRC, rel), "utf8"));
  for (const m of s.matchAll(/\blabel:\s*"((?:[^"\\]|\\.)*)"/g)) {
    const v = giaiChuoi(m[1], '"');
    if (VIET.test(v)) khoa.add(v);
  }
}

function docTuDien(ma) {
  const s = readFileSync(join(SRC, "i18n", `${ma}.ts`), "utf8");
  const co = new Set();
  for (const m of s.matchAll(/^\s*"((?:[^"\\]|\\.)*)"\s*:/gm)) co.add(JSON.parse(`"${m[1]}"`));
  return co;
}

const thieu = {};
for (const ma of ["en", "id"]) {
  const co = docTuDien(ma);
  thieu[ma] = [...khoa].filter((k) => !co.has(k)).sort();
}
if (process.argv.includes("--json")) {
  console.log(JSON.stringify([...new Set([...thieu.en, ...thieu.id])].sort(), null, 1));
} else {
  console.log(`Tong ${khoa.size} cau. Thieu EN: ${thieu.en.length}, thieu ID: ${thieu.id.length}`);
  for (const k of thieu.en) console.log("  -", k);
  process.exitCode = thieu.en.length || thieu.id.length ? 1 : 0;
}
