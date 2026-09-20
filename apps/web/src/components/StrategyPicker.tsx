import { describeBetRate, describeSystemRules } from "@ba-predict/app-core";
import { BETTING_SYSTEMS } from "@ba-predict/engine";
import { Card, Notice, Toggle } from "./Primitives";
import { useAppState, useDispatch, useMoney } from "../state/store";

/**
 * Choose the system to play before the first hand of the sitting.
 *
 * This is the first thing on the Strategies tab because it is the first
 * decision of the day: the choice made here is what the Table tab's headline
 * then instructs, and what a recorded result settles against. Nothing else on
 * this screen changes what the app tells you to do — the replays and records
 * below are measurement.
 *
 * "None" is the default and is not a lesser option: it is the app as an
 * advisor, recommending the cheapest bet at a flat stake, which is the only
 * approach here with nothing to go wrong in it.
 */
export default function StrategyPicker() {
  const { activeSystem, session, tableMode } = useAppState();
  const dispatch = useDispatch();
  const money = useMoney();

  const active = BETTING_SYSTEMS.find((system) => system.id === activeSystem) ?? null;
  const started = session.coups.length > session.shoeStartIndex;

  return (
    <Card
      title="Playing tonight"
      subtitle={active ? active.name : "No system — the app's own recommendation"}
    >
      <div className="chip-row" role="group" aria-label="Betting system">
        <button
          type="button"
          className={`chip${activeSystem === null ? " chip-active" : ""}`}
          aria-pressed={activeSystem === null}
          onClick={() => dispatch({ type: "set-active-system", system: null })}
        >
          None
        </button>
        {BETTING_SYSTEMS.map((system) => (
          <button
            key={system.id}
            type="button"
            className={`chip${activeSystem === system.id ? " chip-active" : ""}`}
            aria-pressed={activeSystem === system.id}
            onClick={() => dispatch({ type: "set-active-system", system: system.id })}
          >
            {system.name}
          </button>
        ))}
      </div>

      {active ? (
        <p className="prose">
          <strong>{active.name}.</strong> {describeSystemRules(active.defaults, money)}
        </p>
      ) : (
        <p className="prose">
          No system. The Table tab recommends the cheapest bet available and stakes your flat
          plan, which is what this app does when it is left to its own judgement.
        </p>
      )}

      {/*
        Observing sits with the system choice because it is the same kind of
        decision — what this sitting is — and because the two interact: a
        system's call still shows in observe mode, it just never settles.
      */}
      <Toggle
        label="Observe only — never stake"
        hint={
          tableMode === "observe"
            ? "Recording results fills the roads, the card tracker and the strategy record, and leaves your bankroll alone."
            : "Recording a result stakes whatever the Bet card shows. Turn this on to watch a shoe without betting it."
        }
        checked={tableMode === "observe"}
        onChange={(checked) =>
          dispatch({ type: "set-table-mode", mode: checked ? "observe" : "play" })
        }
      />

      {/*
        The one number that separates the systems on offer, derived rather
        than written out: 16 hands or 48. A comparison paragraph naming them
        would be wrong the day a third is added.
      */}
      {active && describeBetRate(active.defaults) ? (
        <p className="field-hint">
          {describeBetRate(active.defaults)} Staking more does not cost more per unit &mdash; how
          often you bet has never changed what a bet costs &mdash; but it does mean bigger swings
          either way, and a bigger total loss at the same rate.
        </p>
      ) : null}

      <p className="field-hint">
        Whatever is chosen here is what the <strong>Bet</strong> card on the Table tab instructs,
        and what a recorded result settles against. Change it between shoes rather than
        mid-shoe: a system reads the hands before the current one, so switching part-way gives it
        a history it did not play.
      </p>

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
