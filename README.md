# ba_predict

A baccarat bet advisor: exact shoe-aware odds, per-bet expected value, and bet
sizing you can actually defend. Ships as an installable PWA and an Expo mobile
app over one shared, tested engine.

## Read this first

This app will not tell you who wins the next hand. Nothing can.

Baccarat's drawing rules are fixed and the shoe's composition barely moves as
it is dealt, so every bet on the layout has a **negative expected value** at
all times. The cheapest of them, Banker, costs about **1.06%** of everything
you stake. No pattern on the big road and no staking system — Martingale,
Fibonacci, Labouchere, any of them — changes that number. `ba_predict` proves
it rather than asserting it: the simulator plays your chosen plan out 20,000
times and shows you that the edge it pays is the table's edge, whichever plan
you pick.

What the app *can* do honestly:

- compute the **exact** probability of every outcome from the cards left in the
  shoe (no sampling, no approximation — the whole game tree, weighted);
- price **every bet** against your table's real rules, so you can see that the
  "no commission" table is worse and the Tie is thirteen times more expensive
  than Banker;
- size a stake from your own staking plan, and say out loud when that plan has
  outrun the table maximum or your bankroll;
- tell you to **stop**, when you hit a limit you set earlier.

That last one is the most valuable feature here.

If gambling has stopped being entertainment, see
[BeGambleAware](https://www.begambleaware.org).

## Quick start

```bash
npm install          # required after any package.json change, before any build
npm test             # 158 tests across the engine and shared app state
npm run typecheck    # engine, app-core, web, mobile
npm run dev:web      # PWA on http://localhost:5173
npm run dev:mobile   # Expo
npm run build        # production web bundle into apps/web/dist
```

Node 20+ (developed on 22).

## What is in it

| Screen | What it answers |
|---|---|
| **Table** | What to bet, how much, and what it costs. Records each coup — tapped, typed on the **P / B / T** keys, or pasted in as a run like `BPPBT` — tracks the bankroll, and prices all eight bets. |
| **Roads** | Bead plate, big road (with the dragon tail), big eye boy, small road, cockroach pig, and "ask the road". |
| **Simulate** | Plays a staking plan out thousands of times: how often you finish ahead, how bad the bad night is, and what edge you actually paid. |
| **History** | Every closed session, and the lifetime total. One session is luck; the lifetime cost is where the edge shows up. |
| **Settings** | Table rules, currency, bankroll, unit size, limits, staking plan. |

## Layout

```
packages/engine/     the whole domain: odds, EV, Kelly, progressions, roads, risk
packages/app-core/   reducer, persistence, session archive, currency, sparkline geometry
apps/web/            React 19 + Vite PWA (offline-capable, installable)
apps/mobile/         Expo / React Native
scripts/             icon generation
```

Both clients are thin. Every rule that could drift between them — the reducer,
the big-road layout, the persistence format, the recommendation itself — lives
in a shared package with tests, because the two copies of a rule are how these
things rot.

There is **no backend**. Nothing you record leaves the device.

## The engine

`packages/engine` is the point of the project, and it is tested as such.

**Odds** (`odds.ts`) walks the full game tree — 55 unordered Player pairs × 55
Banker pairs × the tableau's forced third cards — weighting every leaf by its
exact without-replacement probability. There is no Monte Carlo in the answer.
On a fresh 8-deck shoe it reproduces the published figures to six decimal
places (Banker 0.458597, Player 0.446247, Tie 0.095156), and
`odds-simulation.test.ts` cross-checks it independently by dealing a million
real coups and counting.

Pairs are computed from **rank** counts, not point values — two Kings are a
pair, a King and a Ten are not — which the ten point-value buckets cannot
express.

**EV** (`ev.ts`) turns those probabilities plus your table's rules into each
bet's discrete return distribution. Everything downstream reads those
distributions, so a rule change propagates from one place. The tests pin
Banker at 1.058%, Player at 1.235%, Tie 8:1 at 14.360%, Tie 9:1 at 4.844%,
pairs at 10.36%.

**Kelly** (`kelly.ts`) maximises `E[ln(1 + f·r)]` numerically rather than using
the two-outcome textbook formula, because baccarat bets have three outcomes (a
tie pushes) or four (a no-commission Banker win pays differently on 6). It
returns **zero for every real baccarat bet**. That is the sizing telling the
truth, and the app says so before falling back to your own plan.

**Progressions** (`progressions.ts`) implements ten staking systems as
serializable state machines. Each records what it *asked* for alongside what
the table *allowed*, because the gap between those two is precisely how these
systems fail and clamping it silently would hide the failure.

**Risk** (`risk.ts`) is the honest comparison: a seeded Monte Carlo over whole
sessions, with table limits, stop-loss and stop-win. It reports the median, the
5th percentile, the ruin rate, and the edge actually paid.

**Roads** (`roads.ts`) builds the scoreboard, including the derived roads and
the big road's dragon-tail layout. Reproduced faithfully, and labelled in the
UI for what it is: a complete description of the past with no bearing on the
next coup.

## Running it on your phone

Two ways, and they do different things.

**Quick look, same Wi-Fi.** `npm run dev:web` binds every interface and prints
a `Network:` URL (`http://192.168.x.x:5173`). Open that on the handset. This is
plain HTTP, so it runs as an ordinary browser tab — no install prompt, no
offline, no home-screen icon. Fine for trying it; not the real thing.

**Actually installing it.** A service worker and the install prompt require
HTTPS, so the app has to be served from somewhere with a certificate. It is a
static bundle with no backend, so any static host works and the free tiers are
more than enough:

| Host | Settings |
|---|---|
| Vercel / Netlify / Cloudflare Pages | Build `npm run build`, output `apps/web/dist`, install `npm install`, root = repo root |
| GitHub Pages | Needs Actions, which is currently blocked on billing |

Point the host at this repo's root, not at `apps/web`: the build needs the
workspace root to resolve `@ba-predict/engine` and `@ba-predict/app-core`.
These hosts build on their own infrastructure, so they work even while GitHub
Actions is unavailable.

Then, on the phone:

- **Android / Chrome** — an install prompt appears, or use the ⋮ menu →
  *Add to Home screen*.
- **iOS / Safari** — Share → *Add to Home Screen*. (iOS only honours this from
  Safari's share sheet.)

Installed, it opens standalone with its own icon and works with no signal,
which is the normal condition on a casino floor.

## Deploying the web app

`npm run build` emits a static bundle in `apps/web/dist`. It is a pure
client-side app, so any static host works — no server, no environment
variables, no database.

The service worker (`apps/web/public/sw.js`) caches the shell network-first and
fingerprinted assets cache-first, so an installed PWA opens and works with no
signal, which is the normal condition on a casino floor. It must be served over
HTTPS (or localhost) for the install prompt and the service worker to register.

Icons are generated by `npm run icons` (a dependency-free PNG encoder in
`scripts/generate-icons.mjs`) and committed, so a fresh checkout builds without
running it.

## Mobile

```bash
npm run dev:mobile
```

`apps/mobile/metro.config.js` carries the monorepo wiring — watch folders, both
`node_modules` paths, and `disableHierarchicalLookup` — without which Metro
either cannot resolve the shared packages or resolves two copies of React. The
Android bundle is verified to build in CI.

Both clients are at feature parity. The bankroll curve's geometry comes from
`buildSparkline` in `app-core`, so web (inline `<svg>`) and mobile
(`react-native-svg`) draw the identical shape for identical numbers.

## Recording a coup

Three ways, all landing in the same ledger:

- **P / B / T** in the docked row at the bottom of the Table tab, with the
  pair and card-count chips above them for the coup being recorded.
- **The P, B and T keys**, which do exactly what those buttons do. They stand
  down while you are typing in a field, while a shortcut key is held, and
  while a limit is waiting to be answered.
- **A run of results** — `BPPBT`, `b p p b t`, `B-P-P-B` — typed into "Type a
  run of results" on the Table tab, for a shoe that was already going when you
  sat down. Nothing is staked on those and the bankroll does not move: they
  are history, not hands the app was asked to call, so they fill in the road
  and the replays only. One **Undo** takes the whole run back, and a character
  that is not a result is reported rather than quietly dropped.

## What a fresh install assumes

A no-commission table, 8 decks, 3000 bankroll staked in units of the 50 table
minimum, a ceiling of 10,000, and limits at +3300 and −1000 (both measured as
profit from where the session opened). They live in one place,
`INITIAL_RULES` / `INITIAL_BANKROLL` in `packages/app-core/src/reducer.ts`,
and they are read on a first launch only — settings you have made are
persisted and are never overwritten by a later build changing its mind.

The engine's own `DEFAULT_RULES` and `DEFAULT_BANKROLL` are a different thing
and deliberately unchanged: the textbook 5%-commission game its pricing tests
are written against.

## Hitting a limit

Reaching your stop-win or stop-loss raises a dialog that covers the screen and
has to be answered — close the session, or keep playing — because a limit is
set in advance precisely by the person who will not want it when it arrives.
It is asked once per limit, not once per coup: answering it stands until the
session moves off that limit, and it survives a relaunch. Moving the limit,
correcting the balance, undoing the coup that crossed it or closing the
session all re-arm it.

The advisor still refuses to size a stake past a limit either way. Keeping
playing changes nothing except that you were asked.

## Sessions, money and history

A **session** is one sitting. Closing it files it under History with what it
cost, and there are two ways to close, differing only in what the next one
opens with:

- **End session** carries your current balance forward, so the new session's
  profit starts at zero. This is the normal "done for tonight" flow.
- **Reset stake** puts the original starting bankroll back, for when you were
  experimenting rather than playing.

A session with no wagers is never filed — an untouched session is not a night
out, and empty rows would bury the one figure the screen exists for.

**Currency** is a display setting (`packages/app-core/src/currency.ts`). It
labels the numbers and converts nothing. It reaches the advice text too: the
advisor takes a `formatAmount` callback rather than fixing two decimal places
internally, so "you are up RM 200.00" cannot end up beside a bankroll rendered
some other way.

The **lifetime cost** on the History screen is the point of keeping any of
this. A single session is mostly variance in either direction; across enough
of them the figure settles on the table's edge, and watching that happen with
your own numbers is more convincing than being told it will.

## Known gaps

- **No cloud sync.** Everything is on one device. Clearing site data or
  uninstalling takes the history with it, and there is no export yet.
- **The mobile client has not caught up.** The Expo app shares the reducer, so
  it opens with the same table and can hold the same run of results, but the
  keyboard entry, the run box and the limit dialog are web-only so far.
- **Card tracking is manual and optional.** Skipping it is not a degraded mode:
  unseen cards leave the shoe in the proportions it already holds, so the
  untracked numbers are the correct estimate. Tracking sharpens them by a
  fraction of a percent deep into a shoe.

## Licence

MIT.
