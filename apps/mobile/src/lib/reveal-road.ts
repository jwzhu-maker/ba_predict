import { createRef } from "react";
import type { HostInstance, ScrollView, View } from "react-native";

/** The Table tab's vertical scroller, attached in `App`. */
export const pageScrollRef = createRef<ScrollView>();
/** "The road" card's wrapper, attached in `ShoeRoads`. */
export const roadCardRef = createRef<View>();

/**
 * Scroll the page so "The road" card sits at the top of the scroller.
 *
 * Called by the record dock after every P / B / T: recording a result and
 * watching the road move are one action, so the road comes to the result
 * rather than the player scrolling to it. Deferred a frame so the card is
 * measured after the coup has laid out.
 */
export function revealRoad(): void {
  requestAnimationFrame(() => {
    const page = pageScrollRef.current;
    const card = roadCardRef.current;
    if (!page || !card) return;
    // `getInnerViewRef` is the host instance measureLayout wants; it is
    // missing from the published typings, hence the cast.
    const inner = (page as unknown as { getInnerViewRef?: () => HostInstance | null })
      .getInnerViewRef?.();
    if (!inner) return;
    card.measureLayout(inner, (_x, y) => {
      page.scrollTo({ y: Math.max(0, y - 8), animated: true });
    });
  });
}
