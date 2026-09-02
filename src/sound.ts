/**
 * Very small, optional sound layer. Sound is never the only signal for any
 * state (plan §10): every cue it makes is also shown and announced.
 */
type Cue = "move" | "exchange" | "complete" | "invalid";

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, duration: number, when = 0, gain = 0.05): void {
  const ac = context();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const t0 = ac.currentTime + when;
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playCue(cue: Cue, enabled: boolean): void {
  if (!enabled) return;
  switch (cue) {
    case "move":
      tone(440, 0.12);
      break;
    case "exchange":
      tone(523.25, 0.12, 0);
      tone(659.25, 0.14, 0.09);
      break;
    case "complete":
      tone(523.25, 0.16, 0);
      tone(659.25, 0.16, 0.12);
      tone(783.99, 0.24, 0.24);
      break;
    case "invalid":
      tone(196, 0.16, 0, 0.04);
      break;
  }
}
