# Catalyst — prototype

A working web prototype of Catalyst, the AI academic operating system described in
`Catalyst_Functional_Design_Document_v1.01.pdf`. Built as a mobile-styled React/TypeScript
web app (no backend) so the core decision loop can be clicked through in a browser today.

## What's real vs. simulated

- **Real:** the planning engine — feasibility/coverage scoring, next-best-action ranking,
  a greedy constraint-based scheduler, replanning, and what-if simulation (`src/lib/engine.ts`,
  `src/lib/whatif.ts`, `src/lib/replan.ts`) — and the syllabus extractor, which uses genuine
  regex/heuristic parsing of pasted syllabus text (`src/lib/extract.ts`), not canned output.
- **Simulated:** LMS/calendar connections (no real OAuth backend — "Connect" just flips a
  status flag), and the Coach, which is a rule-based intent classifier grounded in real plan
  data rather than an LLM (matches the spec's requirement for a deterministic fallback).
- **Demo data:** "Build my semester (demo)" runs 5 canned syllabus excerpts through the real
  extractor to seed a semester quickly; "Connect my own courses" lets you paste your own text
  through the same code path.

## Run it

```bash
npm install
npm run dev
```

Open the printed localhost URL. A "Simulated clock" panel in Settings lets you fast-forward
time to see replanning and Today's next-best-action update.

## Structure

- `src/lib/` — domain types and the planning engine (framework-agnostic, unit-testable)
- `src/store/useCatalyst.ts` — Zustand store wiring engine + UI, persisted to localStorage
- `src/screens/` — one file per app screen (onboarding + Today/Plan/Tasks/Insights/Coach/Settings)
- `src/data/` — demo semester seed content
