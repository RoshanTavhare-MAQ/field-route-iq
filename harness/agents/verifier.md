# Verifier Agent — Instructions

## Role
Given a Developer Agent's completion plan for the active feature, determine concrete
validation steps using only the tools already present in the repository. Record the
validation steps in `harness/state/loop-state.json` under `validationSteps`.

**Do not install new dependencies. Do not write or run tests.**

---

## Available verification tools (existing in the repo)

| Command | Purpose | When to use |
|---|---|---|
| `npm run build` | TypeScript compile + Vite bundle | Always — confirms types, imports, exports |
| `npm run test` | Vitest test suite (`src/App.test.tsx`) | Always — confirms existing UI tests still pass |
| `npm run lint` | oxlint static analysis | Always — catches obvious code quality issues |

---

## Verification strategy per feature

### Part A — `src/pricing/engine.ts`

The file must:
1. **Compile**: `npm run build` passes with no TypeScript errors.
2. **Export correct signature**: `priceOrder` exported, accepting `PriceOrderInput`, returning `PricedOrder`.
3. **No direct JSON imports**: grep for `import.*\.json` inside `src/pricing/` — must find none.
4. **Uses loaders**: `getProducts`, `getAccounts`, `getPromotions` imported from `../data`.
5. **Existing tests pass**: `npm run test` — the dashboard render test must still pass.

Manual spot-check scenarios to describe (not execute):
- Empty cart → subtotal 0, total 0, no promos
- Unknown productId → throws `Error("Unknown product: <id>")`
- Unknown accountId → throws `Error("Unknown account: <id>")`
- qty ≤ 0 → throws `Error("Invalid qty for <productId>")`
- Non-integer qty → throws `Error("Invalid qty for <productId>")`
- BOGO with qty exactly equal to buyQty+getQty → 1 free unit
- BOGO with qty < buyQty+getQty → discount 0, promo not selected
- Two line promos on same line → highest discount wins
- Threshold promo: line nets sum ≥ minSubtotal → amountOff applied
- Threshold promo: line nets sum < minSubtotal → not applied

### Part B — `src/audit/shelfAudit.ts`

The file must:
1. **Compile**: `npm run build` passes.
2. **Export correct signature**: `auditAccounts(asOf: string): AccountAudit[]`.
3. **No direct JSON imports**: grep for `import.*\.json` inside `src/audit/` — must find none.
4. **Uses loaders**: `getAccounts`, `getVisits` imported from `../data`.
5. **Existing tests pass**: `npm run test`.

Manual spot-check scenarios:
- Account with no visits before asOf → `weightedScore: null`, `trend: null`, `overdue: true`, `status: "unvisited"`
- Account with exactly 1 visit → `weightedScore = score`, `trend: null`, weight divisor = 3
- Account with 2 visits → weights 3, 2; divisor 5; trend computed
- Account with >3 visits → only 3 most recent counted (weight 3/2/1)
- `daysSinceVisit = 14` → `overdue: false` (exactly 14 is not overdue)
- `daysSinceVisit = 15` → `overdue: true`
- `asOf` invalid format → throws `Error("Invalid date: <asOf>")`
- Result sorted by `accountId` ascending

### Part C — `src/settlement/settle.ts`

The file must:
1. **Compile**: `npm run build` passes.
2. **Export correct signature**: `settleRoute(input: SettleRouteInput): RouteSettlement`.
3. **Imports `priceOrder` from `../pricing/engine`** — static import, not dynamic.
4. **No direct JSON imports**.
5. **Existing tests pass**: `npm run test`.

Manual spot-check scenarios:
- Unknown routeId → throws `Error("Unknown route: <routeId>")`
- Order for accountId not on route → throws `Error("Account not on route: <accountId>")`
- Empty orders array → valid result, zeros, stopsVisited=[], stopsMissed=all stops
- Multiple orders for same stop → stop appears once in stopsVisited (first occurrence position)
- Commission marginal tiers: netTotal=316.86 → 200×2%+116.86×5%=9.843 → rounded 9.84
- `perCategory` keys sorted ascending, zero-net categories absent
- `promoUsage` keys sorted ascending, counts both line-level and order-level

---

## Output format

Add to `harness/state/loop-state.json` under `validationSteps`:

```json
{
  "buildPasses": null,
  "testsPasses": null,
  "lintPasses": null,
  "manualSpotChecks": [
    {
      "scenario": "description",
      "expectedOutcome": "what SPEC says",
      "verified": null
    }
  ],
  "blockers": []
}
```

Set `"verified": null` until the step has been run. After running, set `true` or `false`.

---

## What to flag as a blocker

- The implementation plan skips a required export or type.
- The plan imports from JSON directly (violates spec constraint).
- Part C does not import `priceOrder` from the developer's own engine.
- Any step that would require installing a new dependency.
