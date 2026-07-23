# Field Route IQ Copilot Instructions

Use the repository harness in `harness/` as the primary workflow surface for this challenge.

Before making any code changes:

1. Read `SPEC.md` as the source of truth.
2. Read `harness/README.md` for workflow rules and known traps.
3. Read `harness/state/loop-state.json` to determine the current phase, active feature, validation state, and reviewer feedback.
4. Read `harness/state/feature-gaps.json` for the structured gap inventory and feature-specific warnings.

Execution rules:

1. Follow the Discover -> Develop -> Verify -> Review loop described in `harness/README.md`.
2. Use the agent prompt file in `harness/agents/` that matches the current phase in `harness/state/loop-state.json`.
3. `SPEC.md` overrides `docs/NOTES.md`, `src/legacy/pricingV1.ts`, and any conflicting comments elsewhere.
4. Do not import `src/data/*.json` directly. Use the typed loaders in `src/data/index.ts`.
5. For Part C, reuse `priceOrder` from `src/pricing/engine.ts`; do not re-implement pricing logic inside settlement.

Scope rules:

1. Default implementation edits belong only in `src/pricing/`, `src/audit/`, and `src/settlement/` unless the current harness state explicitly calls for another file.
2. Do not modify `src/data/*.json`.
3. Do not write or run new tests.

Current-state rule:

1. If `harness/state/loop-state.json` shows the scored features already approved, treat the code as complete and avoid rewriting those modules unless the user explicitly asks for further changes or the harness state is updated to reopen a feature.

If there is any conflict between this file and `harness/README.md`, follow `harness/README.md` and `SPEC.md`.