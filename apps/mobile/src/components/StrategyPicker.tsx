import { describeBetRate, describeSystemRules } from "@ba-predict/app-core";
import { BETTING_SYSTEMS } from "@ba-predict/engine";
import { View } from "react-native";
import { useAppState, useDispatch, useMoney } from "../state/store";
import { Card, Chip, Hint, Notice, Prose, SwitchRow } from "./ui";

/**
 * Choose the system to play before the first hand of the sitting.
 *
 * First on the Strategies tab because it is the first decision of the day:
 * what is chosen here is what the Table tab's Bet card then instructs, and
 * what a recorded result settles against. Everything below it on this screen
 * is measurement of that choice, not part of making it.
 *
 * "None" is the default and is not a lesser option: it is the app as an
 * advisor, recommending the cheapest bet at a flat stake.
 */
export default function StrategyPicker() {
  const { activeSystem, session, tableMode } = useAppState();
  const dispatch = useDispatch();
  const money = useMoney();

  const active = BETTING_SYSTEMS.find((system) => system.id === activeSystem) ?? null;
  const started = session.coups.length > session.shoeStartIndex;
  // Once, not once as the render condition and again in the body.
  const betRate = active ? describeBetRate(active.defaults) : null;

  return (
    <Card
      title="Playing tonight"
      // The definition's own one-line summary. The chip and the paragraph
      // below both carry the name, so repeating it here spent the subtitle
      // on nothing and left `summary` rendered in no client at all.
      subtitle={active ? active.summary : "No system — the app's own recommendation"}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip
          label="None"
          active={activeSystem === null}
          onPress={() => dispatch({ type: "set-active-system", system: null })}
        />
        {BETTING_SYSTEMS.map((system) => (
          <Chip
            key={system.id}
            label={system.name}
            active={activeSystem === system.id}
            onPress={() => dispatch({ type: "set-active-system", system: system.id })}
          />
        ))}
      </View>

      {active ? (
        <Prose>
          {active.name}. {describeSystemRules(active.defaults, money)}
        </Prose>
      ) : (
        <Prose>
          No system. The Table tab recommends the cheapest bet available and stakes your flat
          plan, which is what this app does when it is left to its own judgement.
        </Prose>
      )}

      {/*
        The one number that separates the systems on offer, derived rather
        than written out: 16 hands or 48. A comparison paragraph naming them
        would be wrong the day a third is added.
      */}
      {betRate ? (
        <Hint>
          {betRate} Staking more does not cost more per unit — how often you bet has never
          changed what a bet costs — but it does mean bigger swings either way, and a bigger
          total loss at the same rate.
        </Hint>
      ) : null}

      {/* Observing sits with the system choice because it is the same kind
          of decision — what this sitting is. */}
      <SwitchRow
        label="Observe only — never stake"
        hint={
          tableMode === "observe"
            ? "Recording results fills the roads, the card tracker and the strategy record, and leaves your bankroll alone."
            : "Recording a result stakes whatever the Bet card shows. Turn this on to watch a shoe without betting it."
        }
        value={tableMode === "observe"}
        onChange={(checked) =>
          dispatch({ type: "set-table-mode", mode: checked ? "observe" : "play" })
        }
      />

      <Hint>
        Whatever is chosen here is what the Bet card on the Table tab instructs, and what a
        recorded result settles against. Change it between shoes rather than mid-shoe: a system
        reads the hands before the current one, so switching part-way gives it a history it did
        not play.
      </Hint>

      {active && started ? (
        <Notice tone="warn">
          This shoe is already {session.coups.length - session.shoeStartIndex} coups in.{" "}
          {active.name} will read those hands as if it had been watching them, which is fine for
          following the rule but means the hands before now were not staked by it.
        </Notice>
      ) : null}
    </Card>
  );
}
