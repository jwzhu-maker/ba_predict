/** The DOM id of "The road" card, so the record dock can bring it on screen. */
export const ROAD_CARD_ID = "the-road";

/**
 * Scroll the page so "The road" card sits just under the sticky header.
 *
 * Called by the record dock after every P / B / T: recording a result and
 * watching the road move are one action, so the road comes to the result
 * rather than the player scrolling to it. Deferred a frame so the card is
 * measured after the coup has rendered — before the first coup it is a
 * shorter placeholder, and afterwards the page above it may have changed
 * height too.
 */
export function revealRoad(): void {
  requestAnimationFrame(() => {
    const card = document.getElementById(ROAD_CARD_ID);
    if (!card) return;
    const header = document.querySelector(".app-header");
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const top = card.getBoundingClientRect().top + window.scrollY - headerHeight - 8;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });
  });
}
