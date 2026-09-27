let ctx = null;

// เสียงเตือนสั้นๆ สองโทน สร้างด้วย Web Audio API ไม่ต้องมีไฟล์เสียง
// หมายเหตุ: เบราว์เซอร์จะเล่นเสียงได้หลังผู้ใช้เคยคลิก/กดอะไรในหน้าเว็บแล้วเท่านั้น
export function playAlertSound() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();

    const beep = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + start;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    };

    beep(880, 0, 0.18);
    beep(1175, 0.2, 0.25);
  } catch (e) {
    console.warn("เล่นเสียงแจ้งเตือนไม่ได้:", e);
  }
}
