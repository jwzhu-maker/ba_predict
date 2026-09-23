import { useState, type ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
  tone,
  className,
  id,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  tone?: "default" | "warn" | "good";
  /** Extra class, for a card that needs its own sizing or placement. */
  className?: string;
  /** DOM id, for a card something else scrolls to. */
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`card${tone && tone !== "default" ? ` card-${tone}` : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      {title ? (
        <header className="card-header">
          <h2>{title}</h2>
          {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

/**
 * A number input that can be typed in.
 *
 * The obvious version — value straight from state, `onChange` on every
 * keystroke, ignore anything that does not parse — cannot be edited. To
 * type 6 over an 8 you first clear the box, the empty string does not
 * parse, so nothing is dispatched, so state still says 8 — and React, for
 * which this is a controlled input, immediately puts the 8 back. The field
 * reads as frozen: it refuses every edit that is not a single keystroke
 * onto a selected value. Anything with a narrow range showed it worst
 * (Decks, which is one character wide), but every field here had it.
 *
 * So what is being typed is held locally, and state is told about it once
 * the number is finished — on blur, or on Enter — clamped into range, which
 * is also what turns a "1" typed into a field whose floor is 10 into 10
 * rather than into a silent refusal. An empty or partial entry ("", "-",
 * "1.") commits nothing: that is somebody mid-edit, not a number.
 *
 * Not on every keystroke, which was the first fix and was worse than the
 * bug. These fields are money: "4200" typed into the bankroll passes
 * through 4, 42 and 420 on its way, and a bankroll of 4 is a session
 * 2996 down — so the stop-loss dialog fired, over the field being used to
 * set it, before the fourth digit was typed. A number being typed is not a
 * number yet.
 *
 * The local draft is dropped on blur, so the field goes back to mirroring
 * state — including when state rejected, rounded or clamped what was typed.
 */
export function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  // Null means "not being edited": show what state says.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (Number.isFinite(value) ? String(value) : "");

  const commit = (text: string) => {
    const parsed = Number.parseFloat(text);
    if (!Number.isFinite(parsed)) return;
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    if (next !== value) onChange(next);
  };

  return (
    <Field label={label} hint={hint}>
      <input
        className="input"
        type="number"
        inputMode="decimal"
        value={shown}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          commit(event.currentTarget.value);
          setDraft(null);
        }}
        onBlur={(event) => {
          commit(event.target.value);
          setDraft(null);
        }}
      />
    </Field>
  );
}

/** A labelled dropdown, for a setting whose values are a short fixed list. */
export function SelectField<T extends string | number>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <select
        className="input"
        value={String(value)}
        onChange={(event) => {
          const chosen = options.find((option) => String(option.value) === event.target.value);
          if (chosen) onChange(chosen.value);
        }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {hint ? <span className="field-hint">{hint}</span> : null}
      </span>
    </label>
  );
}

export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "muted";
  hint?: string;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value${tone ? ` stat-${tone}` : ""}`}>{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "info" | "warn" | "danger"; children: ReactNode }) {
  return (
    <p className={`notice notice-${tone}`} role={tone === "info" ? undefined : "alert"}>
      {children}
    </p>
  );
}
