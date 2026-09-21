import type { Outcome } from "@ba-predict/engine";

/**
 * Reading a run of results typed as text — "BPPBT", "b p p b t", "B-P-P-B".
 *
 * It exists because catching up on a shoe one button at a time is the slow
 * path through the commonest situation there is: sitting down at a table
 * that is already half way through its shoe, with the whole road on the
 * display in front of you. Twenty taps, each one a chance to mis-tap, and
 * no way to check what you entered against what is on the board.
 *
 * Kept out of the components so both clients can share it, and so the
 * awkward parts — what counts as a separator, what happens to a stray
 * character — are settled by tests rather than by whichever screen was
 * written last.
 */

/** Characters allowed between results, so a road copied by eye still reads. */
const SEPARATORS = new Set([" ", "\t", "\n", "\r", ",", ".", ";", ":", "|", "/", "\\", "-", "_"]);

const OUTCOMES: Record<string, Outcome> = {
  p: "player",
  b: "banker",
  t: "tie",
};

export interface ParsedOutcomes {
  /** The results read, in the order they were typed. */
  outcomes: Outcome[];
  /**
   * Characters that are neither a result nor a separator, de-duplicated and
   * in the order met.
   *
   * Reported rather than skipped. A typo in a 40-character string is far
   * more likely to be a mis-reach for an adjacent key than a decoration,
   * and silently dropping it records a shoe one coup shorter than the one
   * the player actually typed — a road that looks right and is not.
   */
  invalid: string[];
}

export function parseOutcomeString(input: string): ParsedOutcomes {
  const outcomes: Outcome[] = [];
  const invalid: string[] = [];
  for (const character of input) {
    if (SEPARATORS.has(character)) continue;
    const outcome = OUTCOMES[character.toLowerCase()];
    if (outcome) {
      outcomes.push(outcome);
      continue;
    }
    if (!invalid.includes(character)) invalid.push(character);
  }
  return { outcomes, invalid };
}

/** "7 Player · 9 Banker · 1 Tie", for showing what is about to be recorded. */
export function describeOutcomes(outcomes: readonly Outcome[]): string {
  let player = 0;
  let banker = 0;
  let tie = 0;
  for (const outcome of outcomes) {
    if (outcome === "player") player += 1;
    else if (outcome === "banker") banker += 1;
    else tie += 1;
  }
  return `${player} Player · ${banker} Banker · ${tie} Tie`;
}
