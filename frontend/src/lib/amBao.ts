// Am bao ngan 2 not (WebAudio, khong can file am thanh). Trinh duyet chan am thanh khi nguoi dung chua tung bam vao trang - bo qua im lang.
export function amBao() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    [880, 1175].forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      const t0 = ac.currentTime + i * 0.18;
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.connect(g).connect(ac.destination);
      o.start(t0);
      o.stop(t0 + 0.32);
    });
    setTimeout(() => void ac.close().catch(() => undefined), 800);
  } catch {
    /* khong phat duoc am thanh - van con popup */
  }
}
