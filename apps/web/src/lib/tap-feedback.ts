/**
 * The buzz and tick when P / B / T records a result.
 *
 * The buzz is the confirmation a thumb feels without looking up from the
 * table. `navigator.vibrate` exists on Android browsers and is simply absent
 * on iOS Safari and on desktops, so there it quietly does nothing.
 *
 * The tick is synthesised with Web Audio rather than loaded from a file, so
 * it costs no request and is ready on the first tap. Where the browser
 * exposes an audio session (Safari 17+), it is set to "ambient", which is
 * what makes the iPhone's silent switch silence it — the closest a web page
 * gets to "only if the sound is turned on". Everywhere else it follows the
 * media volume, and the Settings toggle turns it off outright.
 */

const BUZZ_MS = 250;

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (context) return context;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "ambient";
  } catch {
    // An audio session that refuses the type still plays; nothing to do.
  }
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

/** A short, soft two-tone tick: ~90ms, well under the buzz. */
function tick(): void {
  const ctx = audio();
  if (!ctx) return;
  // Created inside the tap, so the browser allows it to start; resume in
  // case an earlier context was suspended by the autoplay policy.
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  gain.connect(ctx.destination);
  const tone = ctx.createOscillator();
  tone.type = "sine";
  tone.frequency.setValueAtTime(1320, now);
  tone.frequency.exponentialRampToValueAtTime(880, now + 0.09);
  tone.connect(gain);
  tone.start(now);
  tone.stop(now + 0.1);
}

export function tapFeedback(sound: boolean): void {
  try {
    navigator.vibrate?.(BUZZ_MS);
  } catch {
    // Some embedded browsers throw instead of ignoring it.
  }
  if (sound) {
    try {
      tick();
    } catch {
      // Feedback must never be the reason a result fails to record.
    }
  }
}
