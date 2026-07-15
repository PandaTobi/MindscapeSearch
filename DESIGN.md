# Mindscape AMA Search — UI/UX Design Specification

## 1. Design Rationale

### The core concept: the search bar *is* the product

Everything else — filters, cards, the transcript view — exists in service of one loop: **type → see → jump to the moment Sean answers**. So the design treats the query input the way Raycast treats its command bar: it's the largest, brightest, most typographically dominant element on every screen, always one keystroke away, never scrolled out of reach.

Three consequences follow:

1. **Typography carries the hierarchy, not chrome.** There are no card borders doing the work of headings, no icons doing the work of labels. Hierarchy comes from four levers only: size, weight, color (four steps of gray), and space. A result card is legible as a card because of its internal rhythm, not because of a box around it.
2. **Dark is the canonical theme.** This is a late-night "what did Sean say about the measurement problem" tool. Design dark-first (light mode is derived, not the reverse): near-black surface, warm-gray text ramp, one accent used *only* for interaction states and highlights — never decoration.
3. **The interface must never make the user wait on the machine's ambition.** The spec's keyword-first / semantic-opt-in contract becomes a visible UX principle: keyword results render as-you-type, and the semantic layer *upgrades* the page in place — it never blocks it, never reflows it, and announces itself quietly.

### Personality in one line

*A physics library at midnight*: austere, precise, quiet — with a single point of warmth (the accent) marking where the answers are.

### Palette (dark canonical)

| Token | Value | Use |
|---|---|---|
| `bg` | `#0B0C0E` | page background |
| `bg-raised` | `#111317` | cards on hover, sheets, palette |
| `border` | `#1F2228` | hairlines only, 1px |
| `text-primary` | `#EDEEF0` | questions, headings, input text |
| `text-secondary` | `#9BA1AB` | answer snippets, labels |
| `text-tertiary` | `#5C6370` | metadata, timestamps, hints |
| `accent` | `#7C8AFF` (soft iris) | focus rings, active states, links, semantic-mode indicator |
| `highlight` | `#F5D66B` at 18% opacity, full-strength text | keyword match marks |

One accent, one highlight color, and that's the entire chromatic budget. Match highlights are the only "loud" element on screen — deliberately, because they're the information the user is scanning for.

---

## 2. Screen-by-Screen Design

### 2.1 Homepage (pre-query state)

The homepage is a single centered column, vertically positioned at ~38% viewport height (optical center, slightly high — like Perplexity, unlike a login page). Nothing competes with the input.

```
                                                    [◐ theme]

                      Mindscape AMA
            Search 8 years of Sean Carroll's answers

   ┌──────────────────────────────────────────────────────┐
   │  ⌕  Search questions and answers…              ⌘K   │
   └──────────────────────────────────────────────────────┘
      Keyword ○ Hybrid ○ Semantic          ⏎ to search

        "many-worlds"   "free will"   "why is there
         something rather than nothing"

   ─────────────────────────────────────────────────────────
    142 episodes · 6,214 questions · updated June 2026
```

- **Wordmark**: text only, `text-primary`, no logo asset. Sub-line in `text-secondary`.
- **Search input**: 56px tall, `bg-raised`, 1px `border`, 10px radius, 18px input text. Focused by default on page load. The `⌘K` hint sits right-aligned in `text-tertiary` and disappears on focus.
- **Mode switch** (Keyword / Hybrid / Semantic) is a segmented text control directly under the input — small (13px), `text-tertiary`, active segment in `text-primary` with a 2px accent underline. Semantic segment shows a subtle `↓ 23 MB` suffix until the model is cached; after caching, the suffix disappears forever. This makes the spec's progressive-enhancement contract *legible* instead of surprising.
- **Sample queries**: three real, evocative questions rendered as plain quoted text links (`text-secondary`, accent on hover). These teach the corpus's voice better than any onboarding copy.
- **Corpus stats footer**: one line, `text-tertiary`, sourced from the manifest. It doubles as a trust signal ("updated June 2026") and a scale signal.

No hero image, no feature grid, no marketing. The homepage should feel like it's *already waiting for input*.

### 2.2 Search experience (active-query state)

On the first keystroke, the layout **morphs, doesn't navigate**: the input animates from center to a docked position at the top (translate + scale, ~200ms ease-out — the single largest animation in the product), and the results column fades in beneath it. The URL updates live (`?q=…`), back button restores the previous query per the spec's History API design.

Layout, desktop (≥1024px):

```
 ┌─ sticky header ────────────────────────────────────────────────┐
 │  Mindscape AMA   ┌ ⌕ entropy and the arrow of time ─── ✕ ┐     │
 │                  Keyword ○ Hybrid ○ Semantic                   │
 └────────────────────────────────────────────────────────────────┘

  FILTERS (240px)          RESULTS (max 680px)
  Type                     128 results · 41 ms
   ● All                   ┌────────────────────────────┐
   ○ Questions               …result cards…
   ○ Answers               └────────────────────────────┘
  Year
   2026 (12)
   2025 (48) …
  Episode
   ⌕ filter episodes…
   AMA June 2026 …
```

- **Sticky header** holds the input + mode switch; it's the only fixed element. 1px bottom hairline appears only after scroll (avoids a floating look at rest).
- **Filter rail** (left, 240px): plain text lists with counts from the manifest facets — no checkboxes-in-boxes, just rows with a small state dot and count in `text-tertiary`. Active filters get `text-primary` + accent dot. Below ~1024px the rail collapses into a **"Filters (2)" pill** in the header that opens a bottom sheet on mobile / a popover on tablet.
- **Results column** is width-capped at 680px for measure control and *left-aligned against the rail*, not centered — centered result lists drift as the rail toggles; this layout never reflows.
- **Result meta line** ("128 results · 41 ms") in `text-tertiary`. The millisecond count is an honest brag — this product's differentiator is speed, so surface it, Vercel-style.
- **Hybrid upgrade behavior**: keyword results render immediately; when semantic re-ranking lands (spec §8.2 step 3), cards reorder using **FLIP position transitions (~250ms)** rather than a repaint, and a one-line notice appears above the list: `Re-ranked with semantic matching` in `text-tertiary`, fading after 2s. Reordering without explanation reads as a glitch; this makes it read as intelligence.
- **Autocomplete** renders as a flat list *inside* the input's container (expanding it downward, Raycast-style), max 6 items, matched prefix in `text-primary` and completion in `text-tertiary`. `↹` accepts, `↑↓` navigates suggestions before results.
- **Infinite scroll**: no spinner rows; the next page fades in as skeleton cards ~800px before the sentinel, so scrolling never visibly bottoms out.

### 2.3 Search result card — anatomy

The card is the most important component in the product. One card = one Q&A segment.

```
  AMA · JUNE 2026 ─ #q14 ─────────────────────── 1:07:32

  Is entropy the reason we remember the past
  but not the future?

  …the thermodynamic ‸arrow of time‸ comes entirely from
  the low-‸entropy‸ boundary condition of the early
  universe, so memory formation is…    3 matches in answer

  ▶ Play at 1:07:32      Open transcript      ⧉ Copy link
```

Anatomy, top to bottom:

1. **Meta row** — episode badge (`AMA · JUNE 2026`, 11px mono, uppercase, letter-spaced, `text-tertiary`) + question number; timestamp right-aligned in the same mono style. Mono for all numerals/timestamps: it signals "precise, machine-anchored data" and vertically aligns across cards.
2. **Question** — the typographic hero: 17px, weight 550, `text-primary`, max 2 lines with ellipsis. In "answers-only" search mode the question demotes to 13px `text-secondary` and the snippet promotes — the hierarchy follows the user's declared intent.
3. **Answer snippet** — 14px/1.6, `text-secondary`, 3 lines max, window chosen around the best match per spec §9. Keyword matches use the `highlight` treatment; **semantic matches, which have no exact term, instead get a thin accent left-border on the snippet block** — two visually distinct answers to "why is this here?", one per retrieval mode. If passages were deduped, append `N matches in answer` in `text-tertiary`.
4. **Action row** — appears at rest as `text-tertiary` text buttons, brightening on card hover/focus. `▶ Play at H:MM:SS` (deep link to YouTube/audio), `Open transcript` (in-app), `⧉ Copy link` (canonical `?e=…&s=…` URL; on copy, the label swaps to `Copied` for 1.2s — no toast).

Card container: **no border, no shadow at rest.** 20px vertical padding, separated by 1px hairlines. On hover or keyboard focus: background steps to `bg-raised` with a 2px accent bar on the left edge (the keyboard cursor). Focus and hover share one visual state — keyboard users are first-class, per the brief.

### 2.4 Transcript view

Opening a result **does not navigate away from search**. On desktop it opens a right-side panel (55% width, slides in 240ms, results remain live and navigable behind it); on mobile it's a full-screen push. `Esc` or `←` returns to the exact scroll/focus position. This preserves the research loop — compare answers across episodes without losing the query.

```
 ┌ AMA · June 2026 · Episode 312 ──────────────── ✕ ┐
 │  ▶ YouTube    ♫ Audio    ⧉ Share episode         │
 │ ─────────────────────────────────────────────────│
 │  Q6  Why is the speed of light…          58:11   │
 │                                                   │
 │▐ Q7  Is entropy the reason we remember    1:07:32 │
 │▐     the past but not the future?                 │
 │▐                                                  │
 │▐     Sean: So this is one of my favorite…        │
 │▐     (full answer, comfortable reading            │
 │▐      measure, matches still highlighted)         │
 │                                                   │
 │  Q8  You've said many-worlds is…         1:15:04 │
 └───────────────────────────────────────────────────┘
```

- **The deep-linked segment is centered and emphasized** (accent left rule + `text-primary`); neighboring Q&As render at reduced emphasis (`text-secondary`) so context is available but the target is unmistakable. On arrival via a shared `?e=…&s=…` link, the target segment gets a one-time 800ms background pulse (accent at 8% → transparent) — "here's what they sent you."
- **Reading typography**: this is the one long-form surface — 16px/1.7, measure capped at ~65ch, paragraph structure preserved. Questions are set as headings (patron name, if present, in `text-tertiary` above).
- **Timestamps** sit right-aligned in mono per question and are themselves the play links. If `startSec` is interpolated (spec §16.2 confidence field), prefix with `~` and tooltip "approximate" — honest about fidelity.
- **Scroll spy**: a minimal episode-level question list is reachable via `⌘J` (jump-to-question palette scoped to the open episode) rather than a persistent sidebar — keeps the panel clean.

### 2.5 Empty state (focused input, no query)

Not a blank void — a **quiet launcher**, shown beneath the docked input when the query is cleared mid-session:

- "Recent searches" (last 5, from `localStorage`), each row showing query + mode, `Enter` to re-run, `⌫` on a focused row to remove.
- Below it, "Try asking about" with 3 rotating sample queries.
- A single footer hint line: `↑↓ navigate · ⏎ open · / focus · ? shortcuts` in `text-tertiary`.

First-ever visit has no recents, so it shows samples only — the homepage state and the empty state are the same component at two densities.

### 2.6 Loading states

Three distinct waits, three distinct treatments — never a generic spinner:

1. **Index loading (first ~1.5s, spec §10):** the input renders immediately but shows `Loading index…` as its placeholder with a 2px indeterminate accent shimmer along the input's bottom edge. Typing is buffered, not blocked — the query executes the instant the index restores. The user should never learn the app "wasn't ready."
2. **Results paging / query in flight:** skeleton cards — three gray bars matching the card's real type geometry (meta line, question, snippet), 1.2s shimmer, max 3 skeletons. Because keyword search is ~instant, these mostly appear only during infinite-scroll shard fetches.
3. **Semantic model download (one-time, ~23MB):** an inline, dismissible strip under the mode switch — `Downloading semantic model · 12.4 / 23 MB — cached after this` with a thin determinate accent progress bar. Keyword results keep flowing above it the whole time. When done: `Semantic search ready` for 2s, then gone. Never a modal, never an overlay — this is an *enhancement arriving*, not a gate.

### 2.7 No-results state

Distinct from empty. Centered in the results column:

```
        No matches for "quantum imortality"

        Did you mean "quantum immortality"?

        Try:  Hybrid search  ·  Remove filter: 2019  ·
              Search answers too
```

- The failed query is echoed back in quotes (`text-primary`) so the user sees exactly what was searched.
- **Recovery actions are computed, not generic**: fuzzy suggestion from the engine's typo tolerance (rendered as an accent link that re-runs the query); if filters are active, name them individually as removable chips; if mode is keyword, offer "Try hybrid search" — the one moment the product actively sells its semantic layer, precisely when keyword has failed.
- Tone: flat and factual. No illustration, no "Oops!". This audience is being told a fact about a corpus, not consoled.

---

## 3. Component Hierarchy

```
App
├── ThemeProvider (dark canonical, pre-paint script per spec)
├── KeyboardManager (global shortcut scope + focus routing)
├── Header (sticky)
│   ├── Wordmark
│   ├── SearchInput
│   │   ├── QueryField (+ ⌘K hint, clear ✕)
│   │   ├── AutocompleteList › AutocompleteItem
│   │   └── IndexLoadingShimmer
│   ├── ModeSwitch (Keyword / Hybrid / Semantic)
│   │   └── ModelDownloadStrip (progress, one-time)
│   └── FiltersPill (≤1024px only)
├── HomeHero (pre-query only)
│   ├── Tagline · SampleQueries · CorpusStats
├── SearchLayout
│   ├── FilterRail (desktop) / FilterSheet (mobile)
│   │   ├── FacetGroup (Type · Year · Episode)
│   │   │   └── FacetRow (label · count · state dot)
│   │   └── ActiveFilterChips
│   └── ResultsColumn
│       ├── ResultsMeta (count · latency · re-rank notice)
│       ├── VirtualizedList
│       │   ├── ResultCard
│       │   │   ├── MetaRow (EpisodeBadge · QNumber · Timestamp)
│       │   │   ├── QuestionText
│       │   │   ├── AnswerSnippet (HighlightMark[] | SemanticRule)
│       │   │   └── ActionRow (PlayLink · OpenTranscript · CopyLink)
│       │   ├── SkeletonCard
│       │   └── ScrollSentinel
│       ├── EmptyState (RecentSearches · SampleQueries · HintBar)
│       └── NoResultsState (EchoedQuery · FuzzySuggestion · RecoveryActions)
├── TranscriptPanel (desktop overlay / mobile route)
│   ├── PanelHeader (EpisodeTitle · MediaLinks · Share · ✕)
│   ├── SegmentList
│   │   └── Segment (QuestionHeading · TimestampLink · AnswerBody)
│   │       └── DeepLinkPulse (arrival only)
│   └── JumpToQuestionPalette (⌘J)
└── ShortcutsOverlay (?)
```

Notable structural decisions: `HomeHero` and `EmptyState` share the sample-queries component (one system, two densities); `ResultCard` and `Segment` share the timestamp/play primitives so deep-link behavior is defined once; all loading states are owned by the component they gate, not by a global loading layer.

---

## 4. Spacing & Typography Guidance

### Type stack
- **UI + reading:** Inter (or Geist) — variable weight, `font-feature-settings: "cv11", "ss01"` for the cleaner Linear-style glyphs.
- **Data:** Geist Mono / JetBrains Mono — timestamps, badges, counts, latency, shortcut keys. *Everything numeric-and-precise is mono; everything human is sans.* This single rule produces most of the product's visual identity.

### Type scale (rem base 16, tight and deliberate — 7 steps only)

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `display` | 32 / 1.2 | 600, −1% tracking | homepage wordmark |
| `title` | 20 / 1.3 | 600 | transcript question headings |
| `question` | 17 / 1.45 | 550 | result-card questions |
| `body-read` | 16 / 1.7 | 400 | transcript answers, 65ch max |
| `body` | 14 / 1.6 | 400 | snippets, filter labels |
| `caption` | 13 / 1.4 | 450 | mode switch, meta, actions |
| `micro` | 11 / 1.3 | 500 mono, +6% tracking, uppercase | badges, timestamps |

Input text is 18px — larger than anything it produces, reinforcing "the query is the hero."

### Spacing
- **4px base grid**; the working set is `4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64`.
- Card internals: 6px meta→question, 8px question→snippet, 12px snippet→actions; **20px card padding, cards separated by hairlines, not gaps** — density like Linear's issue list, not a card gallery.
- Results measure 680px; transcript measure 65ch; filter rail 240px; 24px gutters desktop, 16px mobile.
- Radii: 10px (input, sheets, palette), 6px (chips, buttons). Two radii only.
- Hairlines are always 1px `border` color — no 2px borders anywhere except the accent focus indicator.

### Breakpoints
`<640` single column, filter sheet, transcript full-screen · `640–1024` filters popover · `≥1024` full rail + transcript side panel · `≥1440` layout stops growing (whitespace absorbs).

---

## 5. Interaction Patterns

### Keyboard map (the primary interface)

| Key | Context | Action |
|---|---|---|
| `/` or `⌘K` | anywhere | focus search (select existing text) |
| `Esc` | input → results → panel | clear query → blur to list → close panel (one layer per press) |
| `↑ ↓` | results | move card cursor (accent left bar); scrolls virtually |
| `Enter` | focused card | open transcript panel |
| `⌘Enter` | focused card | play at timestamp (media deep link, new tab) |
| `c` | focused card | copy deep link |
| `g` then `k / h / s` | anywhere | mode: keyword / hybrid / semantic (spec's `g` prefix) |
| `f` | results | open/focus filters |
| `⌘J` | transcript panel | jump-to-question palette |
| `j / k` | transcript panel | next / previous segment |
| `?` | anywhere | shortcuts overlay |

Rules: focus is **always visible** (accent 2px ring on controls, accent left-bar on cards — never the browser default outline, never invisible). The card cursor persists through result re-ranking (it follows the segment, not the index). Every keyboard path has a pointer equivalent; nothing is keyboard-only.

### Motion (subtle only — total budget: ~6 animations)

| Event | Treatment |
|---|---|
| Home → search morph | input translate/scale, 200ms `ease-out` — the signature move |
| Result entrance | 80ms fade + 4px rise, **no stagger** beyond first paint |
| Hybrid re-rank | FLIP position transitions, 250ms |
| Transcript panel | 240ms slide, `cubic-bezier(0.32, 0.72, 0, 1)` |
| Deep-link arrival | one 800ms background pulse on target segment |
| Hover/focus states | 120ms color/background only — **never** transform on hover (no lift, no scale) |

Everything else is instant. All motion is opacity/transform/color (compositor-only), respects `prefers-reduced-motion` (reduces to opacity fades), and **nothing ever moves other content** — zero layout shift is a design rule here, not just a performance metric.

### State & feedback conventions
- **URL is the source of truth** (query, mode, filters, open segment) — every state is shareable and back/forward-safe, per spec §8.3.
- **Optimistic, quiet confirmation**: copy actions confirm inline via label swap; no toasts anywhere in the product.
- **Latency is displayed, not hidden** (`41 ms`) — speed is the brand.
- **Semantic arrival is always additive**: results upgrade in place with an explanatory notice; the interface never blanks, blocks, or modals for the model.
- **Honesty about approximation**: interpolated timestamps show `~`; failed states echo the exact query; filter chips show exactly what's constraining results.

---

## Open Design Decisions

1. Whether **Hybrid** should be the default mode once the model is cached — recommendation: yes, since the spec calls it "default power mode" and the cost is zero after first download.
2. Transcript panel vs. full-page route on desktop — specified here as a panel because it preserves the research loop, but it complicates the URL story slightly (panel state must still be a real `?e=…&s=…` URL for shareability).

Both are cheap to prototype in M2/M3 of the roadmap.
