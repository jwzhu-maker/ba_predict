import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { Platform, Vibration } from "react-native";

/**
 * The buzz and tick when P / B / T records a result.
 *
 * The buzz is the confirmation a thumb feels without looking up from the
 * table. Android takes the 250ms asked for; iOS has one fixed vibration of
 * its own length and ignores the number.
 *
 * The tick is a 90ms bundled clip. The audio session is set to NOT play in
 * silent mode and to mix with other apps, so the iPhone's silent switch
 * mutes it and it never pauses someone's music. On Android it follows the
 * media volume. The Settings toggle turns it off outright.
 */

const BUZZ_MS = 250;

let player: AudioPlayer | null = null;
let failed = false;

function tickPlayer(): AudioPlayer | null {
  if (player || failed) return player;
  try {
    void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers" }).catch(
      () => undefined,
    );
    player = createAudioPlayer(require("../../assets/tick.wav"));
  } catch {
    failed = true;
  }
  return player;
}

export function tapFeedback(sound: boolean): void {
  try {
    Vibration.vibrate(Platform.OS === "android" ? BUZZ_MS : undefined);
  } catch {
    // Feedback must never be the reason a result fails to record.
  }
  if (!sound) return;
  const tick = tickPlayer();
  if (!tick) return;
  try {
    // Rewind first so a quick second tap replays rather than being ignored.
    void tick.seekTo(0).catch(() => undefined);
    tick.play();
  } catch {
    // As above.
  }
}
