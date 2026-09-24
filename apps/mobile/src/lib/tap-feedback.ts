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

let player: Promise<AudioPlayer | null> | null = null;

/**
 * The tick player, created only once the audio mode is in place, so even
 * the first tick after launch obeys the silent switch and mixes with other
 * audio rather than playing under the default session.
 */
function tickPlayer(): Promise<AudioPlayer | null> {
  player ??= setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers" })
    .catch(() => undefined)
    .then(() => {
      try {
        return createAudioPlayer(require("../../assets/tick.wav"));
      } catch {
        return null;
      }
    });
  return player;
}

export function tapFeedback(sound: boolean): void {
  try {
    Vibration.vibrate(Platform.OS === "android" ? BUZZ_MS : undefined);
  } catch {
    // Feedback must never be the reason a result fails to record.
  }
  if (!sound) return;
  // Rewind first so a second tap replays rather than being ignored, and
  // play only once the rewind has landed — playing straight away can start
  // from the end of the last tick and make no sound.
  void tickPlayer()
    .then(async (tick) => {
      if (!tick) return;
      await tick.seekTo(0).catch(() => undefined);
      tick.play();
    })
    .catch(() => undefined);
}
