# PSS-H4H-CRR-01.R1 | COGNITIVE RELIEF RENDERING (SUPPLEMENT & ACCEPTANCE PACKET)

- **Document ID:** `PSS-H4H-CRR-01.R1`
- **Date:** `2026-11-11`
- **Owner:** Melvin Jackson, Post Sheet
- **Target Repository:** `C:\Users\BugLab\Desktop\H4H-PS1-SUBMISSION`
- **Pre-Stage-C/D Baseline Commit:** `main @ 13fd030`
- **Authorization Scope:** Bounded presentation/ergonomics supplement to `PSS-H4H-CARBON-REACTIVE-MOONLIGHT-R1` and approved Stages C & D. Zero backend, solver, crypto, schema, test, script, or `web/src/claim-operation.js` modifications (`0 bytes` diff).

---

## 1. Visual-Source Provenance & Direct Composition Transfer Map

### 1.1 Reference Artifact Provenance
- **Inspected historical image:** `PostSomeSheet_PSS-MAP-07_Desktop.png` (`1600 x 960`), recovered from Google Drive file ID `1RQJN_8LlPysjHLiZVczjHONeZicahHtf` (`https://drive.google.com/file/d/1RQJN_8LlPysjHLiZVczjHONeZicahHtf/view`).
- **Epistemic boundary:** This PNG is a historical art-directed concept screenshot, **not** a live browser capture of `https://postsheet.org/explore`. An interactive TinyFish run returned insufficient wallet funds (no charge authorized), and public fetch did not yield an independently verified live screenshot. No files in the separate public PostSheet site were altered.

### 1.2 Screenshot-to-Workspace Composition Map

| Explore-Map Visual Element | Crew Network Workspace Counterpart | Implemented Rendering Mechanism (`web/src/`) |
| --- | --- | --- |
| Low-salience dark-green mountain/forest field | Persistent 3-column workspace ground & secondary cards | Steady `#0B0F14` canvas (`--bg-canvas`) + `100%` opaque `#121820` matte reading cores (`--glass-blur: none`); zero card backdrop-blur glare |
| Continuous road/trail geometry | Selected person `<->` task `<->` server team relationship | Exact-ID `.is-linked-ridge` (`3px` `--focus-ring` left ridge across Directory, Column 2 Plan, and Column 3 Spots); zero arbitrary arrows |
| Elevated warm/luminous discovery pins | Operable buttons, active step tab, current offline-relay step | CRR-02 shallow operable contact shadow (`--shadow-operable`) + CRR-08 `.step-current-relief` vs `.step-completed-calm` |
| Distinct marker categories (pin, water, trail, label) | Operation semantics (preview vs. device queue vs. peer relay vs. server commit) | Explicit plain-language status chips (`Preview only - not joined yet`, `Saved on this device`, `Sent through Mateo`, `Confirmed by server`) |
| Unified time-of-day directional shading | Scene-coherent top-left virtual lighting + bounded horizon arc | CRR-09 `inset 1px 1px 0 var(--optical-rim-top)` top-left edge; `SolarBatonHorizon.jsx` at `0` idle frames with bounded `850ms` interaction arc |
| Full scenic map overview (`1600x960`) | `60%` Desktop Panorama (`44fr / 28fr / 28fr` on `>= 1100px`) | Full-bleed `.workspace-layout.is-panoramic-3` (`width: 100%; max-width: none`) keeping Step 1..4, Team Plan, and Server Result simultaneously visible |

---

## 2. Scientific Support, Counterevidence & Transfer Grades

| Source | Domain / Method | Key Finding | Role in CRR & Transfer Uncertainty |
| --- | --- | --- | --- |
| Rosenholtz, Li, Mansfield & Jin (CHI 2005); Rosenholtz, Li & Nakano (*J. Vision* 2007) | Computational visual clutter (Feature Congestion, Subband Entropy) | Adding high-contrast edges everywhere saturates display clutter and degrades search | **Supports finite saliency budget:** motivates opaque `#121820` reading cards, calm `#52525B` High-Contrast inner dividers, and removing 9-pill header clutter |
| Rosenholtz & Twarog (CHI 2009); Rosenholtz et al. (*J. Vision* 2012) | Perceptual grouping & peripheral summary statistics | Peripheral vision pools summary statistics; grouping/continuation aid structure | **Motivates CRR-04 & CRR-05:** stable category chips + cross-panel `.is-linked-ridge`, while keeping exact words for foveal inspection (CSS is not a model of V1/V2) |
| Sandra Lynn Loop (1995 thesis) | Depth-from-shading as UI active-window cue | Shading can cue active regions when lighting direction is coherent and text stays crisp | **Motivates CRR-02 & CRR-09:** shallow contact shadow on operable controls with coherent top-left rim; requires preserving `>= 11:1` text contrast |
| Gutwin, Cockburn & Coveney (CHI 2017) | Peripheral popout across eccentricity & stimulus intensity | Motion remains a strong peripheral capture cue far into eccentricity | **Critical inversion:** perpetual peripheral motion harms concentration; justifies `0` idle animation frames in `SolarBatonHorizon.jsx` |
| Li & Liu (2024, WebGIS icon search, `N=18`) | Combined visual variables (hue, stroke, shadow, size) | Combining shadow with multiple competing visual variables significantly **hurt** search speed/accuracy in their task | **Critical falsifier against blanket shadows:** restricts CRR to a small bounded subset and provides `[data-crr="flat"]` fallback |
| Cammarano et al. (VIS 2004); ISPRS (2018); Popelka (2018) | Cartographic shaded relief & landform eye-tracking | Relief shading aids terrain apprehension under consistent top-left light, yet attractive shading lowered search performance on some map tasks | **Task-over-aesthetics rule:** coherent top-left light prior (`CRR-09`); Partial `2/3` plans must never look "complete" via decorative styling |
| Temporal Visual Attention / Dynamic Highlights (2025 preprint); Hierarchical Search (2026); FocusAdapt (2026) | Preprint models of dynamic emphasis & context preservation | Unintended dynamic highlights disrupt sustained monitoring; selective context preservation must be empirically validated | **Risk bound (preprints, non-peer-reviewed H4H proof):** `850ms` pulse fires only on explicit user action and freezes when `motion="off"` |
| Eraslan et al. (2021); Karreman et al. (2007); W3C COGA; UW ACE Lab | Neurodivergent eye-tracking, easy-to-read copy, ability-based design | Intricate visual noise increases irrelevant fixations; art direction cannot replace plain words or user-controlled density/scale | **Primary UX driver:** plain-language workflow (`Find teammates`, `Plan the work`, `Manage your team`, `Test the last spot`) + persistent `h4h-ps1:ergonomics:v4` preferences |

---

## 3. CRR Material Token Budget & Fallback Matrix

### 3.1 Normalized Decorative Emphasis Ceiling (`I_cap <= 0.26`)
- `I_cap = 0.26` bounds the **normalized decorative channel** (perimeter highlight alpha and ambient lift), never text contrast or `:focus-visible` outlines.
- Implemented `--crr-proximity-glow` in `h4h-glass`: `rgba(126, 231, 210, 0.11)` (`0.11 <= 0.26`), applied strictly to `[data-crr="crr"]:not([data-motion="off"]) [data-reactive-surface]:hover` via a scoped `requestAnimationFrame` CSS custom property update (`--rx`, `--ry`) with `0` React state re-renders and `0` idle frames.

### 3.2 Core Material & Contrast Tokens (`web/src/style.css`)

| Token | Moonlight Dark (`h4h-glass`) | High Contrast (`aaa-contrast`) | Moonlit Pearl (`warm-paper`) | Purpose |
| --- | --- | --- | --- | --- |
| `--bg-canvas` | `#0B0F14` | `#000000` | `#EEF2F6` | Steady workspace ground |
| `--bg-surface` / `--glass-surface-bg` | `#121820` (`100%` opaque) | `#070708` (`100%` opaque) | `#FFFFFF` (`100%` opaque) | Zero-glare reading core (`--glass-blur: none`) |
| `--header-blur` | `blur(16px) saturate(140%)` | `none` | `blur(16px) saturate(135%)` | Restricted to `.top-header`, `.ide-popover`, `.command-palette` |
| `--text-primary` | `#E4EEEB` (`~13.5:1` on `#121820`) | `#FFFFFF` (`~20.1:1`) | `#0F172A` (`~17.8:1` on `#FFFFFF`) | High-frequency crisp typography (`CRR-03`) |
| `--border-inner-subtle` | `rgba(148, 163, 184, 0.16)` | `#52525B` (calm nested zinc) | `#E2E8F0` | Prevents 60+ blinding nested white boxes in High Contrast |
| `--bg-toast-solid` | `#121820` | `#09090B` | `#FFFFFF` | Theme-aware toast surface (fixes dark-ink-on-dark-toast in light mode) |
| `--focus-ring` | `#7EE7D2` (`2px` stationary) | `#FFD60A` (`3px` stationary) | `#0369A1` (`2px` stationary) | Keyboard `:focus-visible` equivalence (`CRR Invariant #7`) |

---

## 4. Ten-State Annotated Interaction & Semantic Honesty Map

| # | UI State | Visual / Relief Behavior | Semantic Guarantee |
| --- | --- | --- | --- |
| 1 | **Idle (At Rest)** | Opaque `#121820` cards, shallow `--shadow-operable` on buttons, `SolarBatonHorizon` draws `1` static frame (`0` rAF loop) | Entire `60%` 3-column panorama is legible from a single static screenshot |
| 2 | **Pointer-Near / Card Hover** | Scoped `--rx`/`--ry` `210px` radial highlight (`alpha = 0.11 <= 0.26`) + `--shadow-lift` on `[data-reactive-surface]` | Highlights card boundary without dimming surrounding context (`CRR-01`) |
| 3 | **Cross-Panel Entity Hover / Focus** | Matching `personId` / `taskId` / `teamId` receives `.is-linked-ridge` (`3px` `--focus-ring` left ridge) + horizon node ring | Exact canonical ID matching (`normalizeBuilderId`); zero fuzzy name guessing (`CRR-04`) |
| 4 | **Keyboard `:focus-visible`** | Stationary `2px` (`3px` in High Contrast) `--focus-ring` outline + dynamic keycap hint update in `KeyboardLightRibbon` | Equivalent orientation and `.is-linked-ridge` tethering without pointer hover |
| 5 | **Active Press (`:active`)** | `translateY(1px)` satin compression + reduced shadow (`inset 0 1px 2px`) while hitbox stays fixed (`CRR-06`) | Signals physical click registration only; never claims server acceptance |
| 6 | **Local Plan Preview (`Try in plan`)** | Updates Column 2 `Team Plan & Schedule` in `<2ms` + `850ms` horizon arc; Column 3 chip stays `Preview only - not joined yet` | Never mutates SQLite team spots; `2/3` partial plans stay amber (`Plan incomplete: 2 of 3 tasks covered`) |
| 7 | **Pending / Offline Device Save** | Step 1 moves to `.step-completed-calm`, Step 2 receives `.step-current-relief` (`CRR-08`); status reads `"Saved on this device. Waiting to send."` | Explicitly distinguishes browser outbox persistence from peer delivery or server membership |
| 8 | **Confirmed by Server** | Green `Confirmed by server` chip in Column 3 + updated `X/5 spots` count after HTTP `200` from `/api/teams`, `/api/invitations/claim`, or `/api/peer/relay-claim` | Only authoritative SQLite `BEGIN IMMEDIATE` responses render confirmed spot badges |
| 9 | **Error / Full Team Rejection** | Stable `--tone-err-bg` / `--tone-err-border` contrast + explicit count (`49 turned away - team full at 2/2`); zero flashing | Contention rejections (`HTTP 409 TEAM_FULL`) remain inspectable without alarmist animation |
| 10 | **Reduced / Static Motion & Mobile Touch** | `[data-motion="off"]` disables transitions, proximity glow, and canvas pulse (`0` frames); `<768px` switches to `16px` root, `44x44px` targets, and `.mobile-mini-panorama-strip` | Full feature parity for vestibular safety and narrow viewports down to `360px` |

---

## 5. Implementation Boundaries, Touched Files & Rollback

### 5.1 Protected Files Verified (`0 bytes` diff)
- `src/authority.mjs`, `src/goal-planner.mjs`, `src/peer-envelope.mjs`, `src/peer-receipts.mjs`, `src/peer-relay.mjs`, `src/seed.mjs`, `src/server.mjs`, `src/synchronicity-ext.mjs`, `src/synchronicity-solvers.mjs`
- `tests/*` (`85/85` automated unit/integration tests untouched)
- `scripts/*` (`run-gates.sh`, `baseline.sh`, `adversarial.sh`, `independent.sh` untouched)
- `web/src/claim-operation.js` (`0 bytes` diff)

### 5.2 Permitted Presentation & Documentation Files Touched
- `web/index.html`
- `web/src/ergonomics.js`
- `web/src/icons.jsx`
- `web/src/presets-and-catalog.js`
- `web/src/style.css`
- `web/src/App.jsx`
- `web/src/components/SolarBatonHorizon.jsx`
- `web/src/components/KeyboardLightRibbon.jsx`
- `web/src/components/CrewCharterExportModal.jsx`
- `web/src/components/Overlays.jsx`
- `web/src/components/TaskDagTimeline.jsx`
- `web/src/views/DiscoverView.jsx`
- `web/src/views/MissionArchitectView.jsx`
- `web/src/views/SeatAuthorityView.jsx`
- `web/src/views/ProofArenaView.jsx`
- `docs/PSS-H4H-CRR-01.R1-SUPPLEMENT.md`
- `docs/DECISION_AND_EXPERIMENT_LEDGER.md`
- `SOURCE_MANIFEST.json`

### 5.3 Instant Diagnostic & Rollback Controls
1. **Runtime A/B Toggle (No Rebuild):** Open `Display & A11y -> More palettes & shortcuts...` and toggle **Cognitive Relief Rendering (CRR): Active / Flat Baseline** (`data-crr="crr"` vs `data-crr="flat"`), or switch **Motion: Static Off** (`data-motion="off"`).
2. **Git Rollback:** `git checkout 13fd030 -- web/` restores the pre-Stage-C/D presentation layer while keeping backend/tests untouched.

---

## 6. Evaluation Status: Automated Proofs vs. Unexecuted Human Tasks

| Evidence Class | Status | Concrete Result |
| --- | --- | --- |
| **Backend & Concurrency Gates (`tests/*`, `scripts/run-gates.sh`)** | **EXECUTED (PASS)** | `85/85` Node tests + `43` baseline + `4` adversarial + `12` independent SQLite race-oracle checks pass (`0` regressions) |
| **Desktop `1440x900` (`60% Panorama`) Headless DOM/CSS Audit** | **EXECUTED (PASS)** | `data-scale="60"` (`11.75px` root), full-bleed `44fr / 28fr / 28fr` columns, `0` duplicate inner View 1 docks, `3` IDE header controls, honest `Plan incomplete: 2 of 3 tasks covered` banner, `0` CSP errors, `0` long dashes |
| **Mobile `360x800` Viewport Conversion Audit** | **EXECUTED (PASS)** | Auto-converts to `data-viewport="mobile"` (`16px` root), `scrollWidth <= clientWidth` (`0` horizontal overflow), pinned `.mobile-mini-panorama-strip` active, `>= 44px` touch targets |
| **1-Click `#FFFFFF` White-Paper Plan Download** | **EXECUTED (PASS)** | Header `Download Plan` triggers immediate `<a download="team-plan-<teamId>.html" href="data:text/html;charset=utf-8,...">` export with `#FFFFFF` paper styling |
| **Computational Saliency (`ImageSaliencyFilter`) & Condition `B4` Lab Fixture** | **UNEXECUTED (DEFERRED)** | Condition `B1` (`data-crr="flat" data-motion="off"`), `B2`, and `B3` (`data-crr="crr"`) are switchable live in-app; adversarial over-glow `B4` intentionally withheld from production bundle |
| **Consented Human Usability, Eye-Tracking & NASA-TLX (`Tasks 1..10`)** | **UNEXECUTED (HUMAN STUDY REQUIRED)** | Behavioral search times, revisit counts, comprehension retellings, and subjective strain require consented human participants and are not claimed from automated checks |
