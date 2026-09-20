/**
 * The baccarat drawing rules ("tableau"). These are fixed by the game, not by
 * the house, and they are what makes the exact enumeration in `odds.ts`
 * possible: given the first four cards, every later card is forced.
 */

/** Player draws a third card on 0-5 and stands on 6-7. Naturals are handled by the caller. */
export function playerDraws(playerTotal: number): boolean {
  return playerTotal <= 5;
}

/**
 * Banker's third-card rule when the Player *did* draw, keyed on the value of
 * the card the Player drew.
 */
export function bankerDrawsAfterPlayerCard(bankerTotal: number, playerThirdCard: number): boolean {
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return playerThirdCard !== 8;
    case 4:
      return playerThirdCard >= 2 && playerThirdCard <= 7;
    case 5:
      return playerThirdCard >= 4 && playerThirdCard <= 7;
    case 6:
      return playerThirdCard >= 6 && playerThirdCard <= 7;
    default:
      return false;
  }
}

/** Banker's rule when the Player stood: the same 0-5 draw / 6-7 stand line. */
export function bankerDrawsAfterPlayerStand(bankerTotal: number): boolean {
  return bankerTotal <= 5;
}

/** A natural stops the coup at four cards. */
export function isNatural(total: number): boolean {
  return total >= 8;
}
