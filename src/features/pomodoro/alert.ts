let audio: AudioContext | null = null;

/**
 * Gets sound ready. Browsers only let a page start audio after a tap, so this runs on taps; later
 * the chime can play on its own. The audio stays asleep until then: running, it keeps a thread
 * busy the whole time the app is open, which a tablet feels.
 */
export function unlockSound() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'running') audio.suspend().catch(() => {});
  } catch {
    // No Web Audio: the end of a phase just vibrates.
  }
}

/** Three soft rising notes, made on the spot (no sound file to download or cache). */
function chime(ctx: AudioContext) {
  const t0 = ctx.currentTime;
  [880, 1108.73, 1318.51].forEach((freq, i) => {
    const t = t0 + i * 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.2);
  });
}

/** The end of a phase: a chime and a buzz, as set. */
export function phaseAlert({ sound, vibrate }: { sound: boolean; vibrate: boolean }) {
  const ctx = audio;
  if (sound && ctx)
    ctx
      .resume()
      .then(() => {
        chime(ctx);
        // Asleep again once the notes have faded.
        setTimeout(() => ctx.suspend().catch(() => {}), 1600);
      })
      .catch(() => {});
  if (vibrate) navigator.vibrate?.([200, 100, 200, 100, 400]);
}
