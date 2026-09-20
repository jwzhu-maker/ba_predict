/**
 * How to describe a realised edge, given that it is signed.
 *
 * `actualEdge` is `-netProfit / totalWagered`, so it goes NEGATIVE the moment
 * the player is ahead on turnover. Every screen that renders it has to branch,
 * and rendering it raw under a word like "cost" produces "-22.08% actual
 * cost", which states the opposite of what happened.
 *
 * This existed in three places and was fixed twice before being found a third
 * time, each fix covering only the instances that had been reported. The
 * branch lives here now so there is one copy to get right.
 */
export interface EdgeDescription {
  /** True when the player is up on everything they have staked. */
  ahead: boolean;
  /** Non-negative, ready to hand to a percent formatter. */
  magnitude: number;
  /** A one-word noun for a tight label: "cost" or "ahead". */
  noun: "cost" | "ahead";
  /** A sentence-case label for a stat tile: "Cost of play" or "Ahead by". */
  label: string;
}

export function describeEdge(actualEdge: number): EdgeDescription {
  const ahead = actualEdge < 0;
  return {
    ahead,
    magnitude: Math.abs(actualEdge),
    noun: ahead ? "ahead" : "cost",
    label: ahead ? "Ahead by" : "Cost of play",
  };
}
