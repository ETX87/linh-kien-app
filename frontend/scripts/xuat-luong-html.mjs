// Xuat file HTML tu chua mo ta luong quy trinh / vai tro / nhiem vu cua he thong.
// Nguon DUY NHAT = frontend/src/modules/luongHeThong/noiDung.ts (cung noi dung muc "Luong & logic he thong" trong app)
// → sua noiDung.ts roi chay lai:  node frontend/scripts/xuat-luong-html.mjs
// Ket qua: docs/Luong_quy_trinh_he_thong.html (mo bang trinh duyet, khong can mang).
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const goc = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const nd = await import(pathToFileURL(resolve(goc, "frontend/src/modules/luongHeThong/noiDung.ts")).href);
const verMatch = readFileSync(resolve(goc, "frontend/src/version.ts"), "utf8").match(/["'](\d+\.\d+)["']/);
const phienBan = verMatch ? verMatch[1] : "";
const ngay = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10).split("-").reverse().join("/");

const data = { NHOM: nd.NHOM, VAI_TRO: nd.VAI_TRO, KET_NOI: nd.KET_NOI, LICH_CHAY: nd.LICH_CHAY, TONG_QUAN: nd.TONG_QUAN };
const json = JSON.stringify(data).replace(/</g, "\\u003c");

const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Luồng quy trình hệ thống — App Đặt hàng linh kiện</title>
<style>
:root{
  --primary:#1467E8; --primary-50:#EEF4FE; --grad:linear-gradient(135deg,#2466E4,#1285E7 55%,#0FC7F0);
  --ink:#0F172A; --ink-2:#334155; --ink-3:#64748B; --line:#E2E8F0; --bg:#F8FAFC; --card:#fff;
  --bat_dau:#1467E8; --bat_dau-bg:#EEF4FE;
  --tu_dong:#7C3AED; --tu_dong-bg:#F3EEFF;
  --cho:#EA7A0C; --cho-bg:#FFF4E8;
  --xong:#16A34A; --xong-bg:#ECFDF3;
  --huy:#DC2626; --huy-bg:#FEF2F2;
}
*{box-sizing:border-box}
body{margin:0;font-family:"Plus Jakarta Sans","Be Vietnam Pro","Segoe UI",system-ui,sans-serif;color:var(--ink);background:var(--bg);font-size:14px;line-height:1.55}
header{background:var(--grad);color:#fff;padding:28px 32px 22px}
header h1{margin:0 0 4px;font-size:24px;font-weight:800}
header p{margin:0;opacity:.92}
.meta{font-size:12px;opacity:.85;margin-top:8px}
nav{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);display:flex;gap:4px;padding:8px 24px;overflow-x:auto;align-items:center}
nav button{border:0;background:none;padding:8px 14px;border-radius:8px;font:inherit;font-weight:600;color:var(--ink-3);cursor:pointer;white-space:nowrap}
nav button:hover{background:var(--bg);color:var(--ink)}
nav button.on{background:var(--primary-50);color:var(--primary)}
nav .tim{margin-left:auto;min-width:220px;border:1.5px solid var(--primary);border-radius:8px;padding:7px 10px;font:inherit;outline:none;box-shadow:0 0 0 3px #1467e81a}
main{max-width:1240px;margin:0 auto;padding:22px 24px 60px}
h2{font-size:20px;margin:6px 0 4px}
h3{font-size:16px;margin:0 0 4px}
.gt{color:var(--ink-2);margin:0 0 18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:16px;box-shadow:0 1px 2px #0f172a0a}
.mota{color:var(--ink-3);margin:0 0 14px}
.chu-giai{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--ink-3);margin-bottom:16px}
.chu-giai span{display:inline-flex;align-items:center;gap:6px}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
/* Luong ngang */
.luong{display:flex;align-items:flex-start;overflow-x:auto;padding:6px 2px 10px;gap:0}
.moc{flex:1 0 128px;max-width:190px;display:flex;flex-direction:column;align-items:center;text-align:center;position:relative;cursor:pointer;padding:0 4px}
.moc::before{content:"";position:absolute;top:17px;left:-50%;width:100%;height:3px;background:var(--line);z-index:0}
.moc:first-child::before{display:none}
.vong{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:#fff;position:relative;z-index:1;border:3px solid #fff;box-shadow:0 0 0 2px currentColor}
.moc .ten{margin-top:8px;font-weight:700;font-size:13px;line-height:1.3}
.moc .ai{font-size:11.5px;color:var(--ink-3);margin-top:2px;line-height:1.3}
.moc:hover .vong,.moc.chon .vong{transform:scale(1.12)}
.moc.chon .ten{color:var(--primary)}
.moc.sang{animation:sang 1.6s ease 2}
@keyframes sang{50%{background:#fff7c2;border-radius:10px}}
.loai-bat_dau .vong{background:var(--bat_dau);color:var(--bat_dau)} .loai-bat_dau .vong{color:#fff;box-shadow:0 0 0 2px var(--bat_dau)}
.loai-tu_dong .vong{background:var(--tu_dong);box-shadow:0 0 0 2px var(--tu_dong)}
.loai-cho .vong{background:var(--cho);box-shadow:0 0 0 2px var(--cho)}
.loai-xong .vong{background:var(--xong);box-shadow:0 0 0 2px var(--xong)}
.loai-huy .vong{background:var(--huy);box-shadow:0 0 0 2px var(--huy)}
.ct{border-top:1px dashed var(--line);margin-top:10px;padding-top:14px}
.ct-moc{border-left:4px solid var(--line);padding:4px 0 4px 14px;margin-bottom:14px}
.ct-moc.loai-bat_dau{border-color:var(--bat_dau)} .ct-moc.loai-tu_dong{border-color:var(--tu_dong)} .ct-moc.loai-cho{border-color:var(--cho)} .ct-moc.loai-xong{border-color:var(--xong)} .ct-moc.loai-huy{border-color:var(--huy)}
.ct-moc .dong1{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px}
.b-bat_dau{background:var(--bat_dau-bg);color:var(--bat_dau)} .b-tu_dong{background:var(--tu_dong-bg);color:var(--tu_dong)} .b-cho{background:var(--cho-bg);color:var(--cho)} .b-xong{background:var(--xong-bg);color:var(--xong)} .b-huy{background:var(--huy-bg);color:var(--huy)}
code{font-family:ui-monospace,Consolas,monospace;font-size:12px;background:#F1F5F9;padding:1px 6px;border-radius:5px;color:var(--ink-2)}
.ai-line{font-size:13px;color:var(--ink-2);margin:4px 0}
.muc{font-size:12px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em;margin:8px 0 2px}
ul{margin:2px 0 4px;padding-left:20px} li{margin:2px 0}
.nut-xo{border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 12px;font:inherit;font-weight:600;color:var(--primary);cursor:pointer;margin-top:4px}
.nut-xo:hover{background:var(--primary-50)}
.nhanh{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}
.nhanh div{border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;flex:1 1 260px;background:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.the h3 .bt{margin-right:6px}
.vt .co{font-size:12px;color:var(--ink-3)}
.vt .xem{background:var(--bg);border-radius:8px;padding:8px 10px;font-size:13px;margin-top:8px;color:var(--ink-2)}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{background:#F8FAFC;font-size:12px;color:var(--ink-3);font-weight:700;position:sticky;top:0}
.bang{overflow:auto;max-height:70vh;border:1px solid var(--line);border-radius:12px}
.mt td.c{text-align:center;font-weight:700}
.tq{display:flex;align-items:stretch;gap:0;overflow-x:auto;padding:8px 0}
.tq .o{flex:1 0 130px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;margin-right:22px;position:relative;cursor:pointer;border-top:4px solid}
.tq .o:not(:last-child)::after{content:"→";position:absolute;right:-18px;top:50%;transform:translateY(-50%);color:var(--ink-3);font-weight:800}
.tq .o:hover{box-shadow:0 4px 14px #0f172a14}
.tq .o b{display:block;font-size:14px} .tq .o span{font-size:12px;color:var(--ink-3)}
.chieu{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--primary-50);color:var(--primary);margin-left:6px}
mark{background:#FEF08A;padding:0 1px;border-radius:2px}
.an{display:none!important}
.trong{color:var(--ink-3);padding:30px;text-align:center}
footer{color:var(--ink-3);font-size:12px;text-align:center;padding:20px}
@media print{nav{display:none}.card{break-inside:avoid;box-shadow:none}.ct{display:block!important}.nut-xo{display:none}body{background:#fff}.tab{display:block!important}}
</style>
</head>
<body>
<header>
  <h1>Luồng quy trình hệ thống — App Đặt hàng linh kiện</h1>
  <p>Toàn bộ luồng nghiệp vụ: đặt hàng &amp; tự duyệt, thiếu hàng, phiếu xuất &amp; chuyển tiền, hàng trả, giá &amp; công nợ, vai trò &amp; nhiệm vụ, kết nối hệ khác.</p>
  <div class="meta">Phiên bản app v${phienBan} · Xuất ngày ${ngay} · Nguồn: mục “Luồng &amp; logic hệ thống” trong app</div>
</header>
<nav id="nav"></nav>
<main id="main"></main>
<footer>Bấm vào mỗi mốc trên luồng để xem ai xử lý, điều kiện, bước kế tiếp, hệ thống tự làm gì. “▾ Xem chi tiết” mở toàn bộ các bước. In ra giấy: Ctrl + P (mọi tab, mọi chi tiết được mở).</footer>
<script>
const D = ${json};
const LOAI = {bat_dau:"Bắt đầu",tu_dong:"Hệ thống tự động",cho:"Chờ người xử lý",xong:"Hoàn tất",huy:"Hủy / từ chối"};
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const ds = (tieuDe, arr) => arr && arr.length ? '<div class="muc">'+tieuDe+'</div><ul>'+arr.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>' : "";
const chuGiai = '<div class="chu-giai">'+Object.entries(LOAI).map(([k,v])=>'<span><i class="dot" style="background:var(--'+k+')"></i>'+v+'</span>').join("")+'</div>';

function chiTietMoc(m, i){
  return '<div class="ct-moc loai-'+m.loai+'" id="ct-'+m._id+'">'
    + '<div class="dong1"><h3>'+(i+1)+'. '+esc(m.ten)+'</h3><span class="badge b-'+m.loai+'">'+LOAI[m.loai]+'</span>'+(m.ma?'<code>'+esc(m.ma)+'</code>':'')+'</div>'
    + '<div class="ai-line"><b>Ai xử lý:</b> '+esc(m.ai)+'</div>'
    + (m.moTa?'<div class="ai-line">'+esc(m.moTa)+'</div>':'')
    + ds("Điều kiện", m.dieuKien) + ds("Bước kế tiếp", m.tiepTheo) + ds("Hệ thống tự làm", m.tuDong) + ds("Lưu ý", m.luuY)
    + '</div>';
}
let dem = 0;
function veLuong(l){
  const id = "l"+(dem++);
  l.moc.forEach((m,i)=>m._id=id+"-"+i);
  return '<div class="card luong-card" data-tim="'+esc(l.ten+" "+l.moTa)+'">'
    + '<h3>'+esc(l.ten)+'</h3>' + (l.moTa?'<p class="mota">'+esc(l.moTa)+'</p>':'')
    + '<div class="luong">'+l.moc.map((m,i)=>'<div class="moc loai-'+m.loai+'" data-l="'+id+'" data-i="'+i+'" title="'+esc(m.ten+" — "+m.ai)+'"><div class="vong">'+(i+1)+'</div><div class="ten">'+esc(m.ten)+'</div><div class="ai">'+esc(m.ai.length>60?m.ai.slice(0,58)+"…":m.ai)+'</div></div>').join("")+'</div>'
    + '<div class="ct an" id="mot-'+id+'"></div>'
    + '<button class="nut-xo" data-xo="'+id+'">▾ Xem chi tiết</button>'
    + '<div class="ct an" id="tat-'+id+'">'+l.moc.map(chiTietMoc).join("")+'</div>'
    + (l.nhanh&&l.nhanh.length?'<div class="muc">Nhánh rẽ</div><div class="nhanh">'+l.nhanh.map(n=>'<div><span class="badge b-'+n.loai+'">'+esc(n.ten)+'</span><div style="margin-top:4px">'+esc(n.moTa)+'</div></div>').join("")+'</div>':'')
    + '</div>';
}
function veThe(t){
  return '<div class="card the" data-tim="'+esc(t.tieuDe+" "+t.dong.join(" "))+'"><h3><span class="bt">'+t.bieuTuong+'</span>'+esc(t.tieuDe)+'</h3><ul>'+t.dong.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>'+(t.luong?veLuong(t.luong).replace('class="card luong-card"','class="luong-card" style="margin-top:10px"'):'')+'</div>';
}

// Ma tran vai tro × buoc: tu dong suy tu truong "ai" cua moi moc.
const TU_VAI_TRO = [
  ["KTV / CTV / Trạm",/\\bKTV\\b|Trạm|người nhận|người tạo/i],["Vệ tinh",/Vệ tinh/i],["Giám sát",/\\bGS\\b|Giám sát/i],["TBP",/TBP|Trưởng bộ phận/i],
  ["Tác nghiệp",/\\bTN\\b|Tác nghiệp/i],["Kế toán",/Kế toán|\\bKT\\b/i],["Kho",/\\bKho\\b/i],["Mua hàng",/Mua hàng/i],["QC",/\\bQC\\b/i],["Admin",/Admin/i],["Hệ thống",/Hệ thống/i]];

const TABS = [{key:"tong-quan",ten:"Tổng quan"}].concat(D.NHOM.map(n=>({key:n.key,ten:n.ten}))).concat([{key:"vai-tro",ten:"Vai trò & nhiệm vụ"},{key:"ma-tran",ten:"Ma trận vai trò × bước"},{key:"ket-noi",ten:"Kết nối hệ khác"}]);
const nav = document.getElementById("nav"), main = document.getElementById("main");
nav.innerHTML = TABS.map(t=>'<button data-tab="'+t.key+'">'+esc(t.ten)+'</button>').join("") + '<input class="tim" id="tim" placeholder="🔍 Tìm trạng thái, vai trò, quy tắc…" />';

let out = "";
// Tong quan
out += '<section class="tab" data-tab="tong-quan"><h2>Tổng quan hệ thống</h2><p class="gt">Đơn linh kiện đi qua 8 giai đoạn lớn. Bấm 1 ô để mở luồng chi tiết.</p>'+chuGiai
  + '<div class="card"><div class="tq">'+D.TONG_QUAN.map(t=>'<div class="o" data-di="'+t.nhom+'" style="border-top-color:var(--'+t.loai+')"><b>'+esc(t.ten)+'</b><span>'+esc(t.ai)+'</span></div>').join("")+'</div></div>'
  + '<div class="grid"><div class="card"><h3>🧩 Các nhóm luồng</h3><ul>'+D.NHOM.map(n=>'<li><a href="#" data-di="'+n.key+'"><b>'+esc(n.ten)+'</b></a> — '+esc(n.gioiThieu)+'</li>').join("")+'</ul></div>'
  + '<div class="card"><h3>⏰ Lịch chạy tự động</h3><table><tbody>'+D.LICH_CHAY.map(l=>'<tr><td style="white-space:nowrap"><b>'+esc(l.gio)+'</b></td><td>'+esc(l.viec)+'</td></tr>').join("")+'</tbody></table></div>'
  + '<div class="card"><h3>👥 Vai trò</h3><ul>'+D.VAI_TRO.map(v=>'<li>'+v.bieuTuong+' <b>'+esc(v.ten)+'</b> — '+esc(v.lam[0])+'</li>').join("")+'</ul></div></div></section>';
// Tung nhom
for (const n of D.NHOM) {
  out += '<section class="tab" data-tab="'+n.key+'"><h2>'+esc(n.ten)+'</h2><p class="gt">'+esc(n.gioiThieu)+'</p>'+(n.luong?chuGiai:'')
    + (n.luong||[]).map(veLuong).join("") + (n.the&&n.the.length?'<div class="grid">'+n.the.map(veThe).join("")+'</div>':'') + '</section>';
}
// Vai tro
out += '<section class="tab" data-tab="vai-tro"><h2>Vai trò &amp; nhiệm vụ</h2><p class="gt">Phân quyền chủ yếu đến từ các cờ nghiệp vụ trên tài khoản; 1 người có thể mang nhiều cờ. Kế toán được làm thay mọi việc của Tác nghiệp.</p><div class="grid">'
  + D.VAI_TRO.map(v=>'<div class="card vt" data-tim="'+esc(v.ten+" "+v.lam.join(" ")+" "+v.xem)+'"><h3>'+v.bieuTuong+' '+esc(v.ten)+'</h3><div class="co">Cờ / vai trò: <code>'+esc(v.co)+'</code></div><div class="muc">Nhiệm vụ</div><ul>'+v.lam.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul><div class="xem"><b>Phạm vi xem:</b> '+esc(v.xem)+'</div></div>').join("")
  + '</div></section>';
// Ma tran
const hang = [];
for (const n of D.NHOM) for (const l of (n.luong||[]).concat((n.the||[]).filter(t=>t.luong).map(t=>t.luong))) for (const m of l.moc) hang.push({nhom:n.ten,luong:l.ten,m});
out += '<section class="tab" data-tab="ma-tran"><h2>Ma trận vai trò × bước</h2><p class="gt">Mỗi dòng là 1 mốc trong các luồng; ● = vai trò tham gia xử lý ở mốc đó (suy từ cột “Ai xử lý”).</p><div class="bang"><table class="mt"><thead><tr><th>Luồng</th><th>Mốc</th><th>Loại</th>'
  + TU_VAI_TRO.map(v=>'<th style="text-align:center">'+v[0]+'</th>').join("")+'</tr></thead><tbody>'
  + hang.map(h=>'<tr data-tim="'+esc(h.luong+" "+h.m.ten+" "+h.m.ai)+'"><td>'+esc(h.luong)+'</td><td><b>'+esc(h.m.ten)+'</b><div style="font-size:12px;color:var(--ink-3)">'+esc(h.m.ai)+'</div></td><td><span class="badge b-'+h.m.loai+'">'+LOAI[h.m.loai]+'</span></td>'
    + TU_VAI_TRO.map(v=>'<td class="c" style="color:var(--'+h.m.loai+')">'+(v[1].test(h.m.ai)?'●':'')+'</td>').join("")+'</tr>').join("")
  + '</tbody></table></div></section>';
// Ket noi
const CH = {vao:"Chiều vào",ra:"Chiều ra",hai_chieu:"Hai chiều"};
out += '<section class="tab" data-tab="ket-noi"><h2>Kết nối hệ khác</h2><p class="gt">Các hệ thống / nguồn dữ liệu app trao đổi.</p><div class="grid">'
  + D.KET_NOI.map(k=>'<div class="card" data-tim="'+esc(k.ten+" "+k.dong.join(" "))+'"><h3>'+k.bieuTuong+' '+esc(k.ten)+'<span class="chieu">'+CH[k.chieu]+'</span></h3><ul>'+k.dong.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul></div>').join("")
  + '</div></section>';
main.innerHTML = out;

// Tim moc theo id de mo chi tiet 1 moc
const MOC = {}; for (const n of D.NHOM) for (const l of (n.luong||[]).concat((n.the||[]).filter(t=>t.luong).map(t=>t.luong))) l.moc.forEach((m,i)=>MOC[m._id]=[m,i]);

function moTab(key){
  document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on",b.dataset.tab===key));
  document.querySelectorAll("section.tab").forEach(s=>s.classList.toggle("an",s.dataset.tab!==key));
  history.replaceState(null,"","#"+key); window.scrollTo({top:0});
}
document.addEventListener("click", e=>{
  const t = e.target.closest("[data-tab]"); if (t && t.tagName==="BUTTON") return moTab(t.dataset.tab);
  const di = e.target.closest("[data-di]"); if (di) { e.preventDefault(); return moTab(di.dataset.di); }
  const xo = e.target.closest("[data-xo]");
  if (xo) { const el = document.getElementById("tat-"+xo.dataset.xo); const mo = el.classList.toggle("an"); xo.textContent = mo ? "▾ Xem chi tiết" : "▴ Thu gọn"; return; }
  const moc = e.target.closest(".moc");
  if (moc) {
    const id = moc.dataset.l, ct = document.getElementById("mot-"+id), dang = moc.classList.contains("chon");
    moc.parentElement.querySelectorAll(".moc").forEach(x=>x.classList.remove("chon"));
    if (dang) { ct.classList.add("an"); return; }
    moc.classList.add("chon"); const [m,i] = MOC[id+"-"+moc.dataset.i];
    ct.innerHTML = chiTietMoc(m,i).replace('id="ct-','id="x-'); ct.classList.remove("an");
  }
});
// Tim kiem: loc the / luong / dong bang trong moi tab, tu chuyen sang tab co ket qua dau tien.
const boDau = s => String(s).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase();
document.getElementById("tim").addEventListener("input", e=>{
  const q = boDau(e.target.value.trim());
  let dau = null;
  document.querySelectorAll("[data-tim]").forEach(el=>{
    const nd = boDau(el.dataset.tim + " " + el.textContent);
    const khop = !q || nd.includes(q); el.classList.toggle("an", !khop);
    if (khop && q && !dau) dau = el.closest("section.tab")?.dataset.tab;
    if (q && khop && el.classList.contains("luong-card")) el.querySelectorAll(".moc").forEach(m=>{ if (boDau(m.textContent+" "+m.title).includes(q)) { m.classList.remove("sang"); void m.offsetWidth; m.classList.add("sang"); } });
  });
  if (dau) moTab(dau);
});
moTab(TABS.some(t=>t.key===location.hash.slice(1)) ? location.hash.slice(1) : "tong-quan");
// In: mo moi chi tiet
addEventListener("beforeprint", ()=>document.querySelectorAll('[id^="tat-"]').forEach(x=>x.classList.remove("an")));
</script>
</body>
</html>
`;
const outPath = resolve(goc, "docs/Luong_quy_trinh_he_thong.html");
writeFileSync(outPath, html, "utf8");
console.log("Da xuat", outPath, (html.length / 1024).toFixed(0) + " KB");
