# Field Route IQ — Multi-Agent Harness

This harness coordinates a **Discover → Develop → Verify → Review** feedback loop
to guide AI agents in completing the three missing modules of the Field Operations
Suite (`priceOrder`, `auditAccounts`, `settleRoute`).

---

## Repository quick facts

| Item | Value |
|---|---|
| Language | TypeScript |
| Framework | React 19 + Vite 8 |
| Test runner | Vitest (`npm run test`) |
| Linter | oxlint (`npm run lint`) |
| Build check | `npm run build` |
| Node runtime | Node 20+ (ESM, `.mjs` scripts run with `node`) |
| State data | `src/data/*.json` — read via `src/data/index.ts` loaders only |

---

## Harness structure

```
harness/
  README.md               ← you are here
  agents/
    discovery.md          ← Discovery Agent instructions
    developer.md          ← Developer Agent instructions
    verifier.md           ← Verifier Agent instructions
    reviewer.md           ← Reviewer Agent instructions
  state/
    feature-gaps.json     ← structured gap report (updated after each discovery pass)
    loop-state.json       ← current loop position and completion status
  orchestrator.mjs        ← Node.js script that drives the loop (no new dependencies)
```

---

## Running the loop

```bash
# See current loop state and the next recommended action:
node harness/orchestrator.mjs status

# Advance the loop to the next phase for the active feature:
node harness/orchestrator.mjs advance

# Mark the active feature as complete (reviewer approved):
node harness/orchestrator.mjs complete

# Re-run discovery to refresh the gap report:
node harness/orchestrator.mjs discover

# Reset the active feature to the develop phase (after reviewer feedback):
node harness/orchestrator.mjs reset-to-develop
```

---

## Loop phases (per feature)

```
discover → develop → verify → review → [iterate or complete]
```

1. **discover** — Discovery Agent scans repo and populates `state/feature-gaps.json`.
2. **develop** — Developer Agent reads the gap entry and **writes the implementation** directly under `src/pricing/`, `src/audit/`, or `src/settlement/`. Records a summary of what was implemented in `state/loop-state.json`.
3. **verify** — Verifier Agent runs `npm run build`, `npm run test`, and `npm run lint`; reports results.
4. **review** — Reviewer Agent checks the implementation against SPEC.md and flags gaps, risks, edge cases.
5. If the Reviewer flags issues, loop returns to **develop** with the feedback recorded.
6. If the Reviewer approves, the feature is marked **complete**.

---

## Agent roles — quick reference

| Agent | Instructions file | Input | Output |
|---|---|---|---|
| Discovery | `agents/discovery.md` | repo files | `state/feature-gaps.json` |
| Developer | `agents/developer.md` | feature gap entry | **implemented source file(s)** + summary in `state/loop-state.json` |
| Verifier | `agents/verifier.md` | implementation plan | validation steps in `state/loop-state.json` |
| Reviewer | `agents/reviewer.md` | plan + validation | feedback in `state/loop-state.json` |
| Orchestrator | `orchestrator.mjs` | `state/*.json` | next-action prompt on stdout |

---

## Critical warnings (read before any agent run)

1. **`SPEC.md` is the single source of truth.** Everything else is secondary.
2. **`src/legacy/pricingV1.ts` is a trap.** Its semantics differ from SPEC.md on:
   - rounding (banker's vs half-up)
   - promotion stacking (cumulative vs best-for-customer)
   - BOGO groups (capped at 1 vs repeating)
   - `validTo` (exclusive in v1 vs inclusive in SPEC.md)
3. **`docs/NOTES.md` is a trap.** Several meeting notes contradict SPEC.md:
   - Notes say threshold qualifies on gross; SPEC says on line nets (post-discount).
   - Notes mention `validTo` as exclusive (ERP convention); SPEC says inclusive.
   - Notes say BOGO capped at one group; SPEC says repeating groups.
4. **`src/legacy/discountMatrix.ts`** (volume tiers) is not part of the SPEC.md model.
5. **Do not re-read JSON files directly.** Use `src/data/index.ts` loaders.
6. **Part C must import `priceOrder` from `../pricing/engine`** — the scorer runs Part C through your engine.
