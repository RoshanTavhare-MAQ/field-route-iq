# Reviewer Agent — Instructions

## Role
Review the Developer Agent's completion plan AND the Verifier Agent's validation
steps for the active feature. Provide structured, actionable feedback. Record
feedback in `harness/state/loop-state.json` under `reviewerFeedback`.

---

## Inputs to read

1. `harness/state/loop-state.json` — `completionPlan` and `validationSteps`
2. `harness/state/feature-gaps.json` — the active gap entry for full context
3. `SPEC.md` — authoritative spec (check every claim against the spec text)
4. `harness/README.md` — critical warnings (known traps to verify the plan avoids)

---

## Review checklist

### Correctness against SPEC.md

- [ ] **Rounding**: Does the plan use half-up rounding (not banker's)? Is `round2` applied at every output field?
- [ ] **Date window**: Does the plan check `validFrom ≤ date ≤ validTo` (inclusive on both ends)?
- [ ] **Stacking**: Does the plan select best-for-customer (max discount) per line, not cumulative?
- [ ] **Tie-break**: Does the plan implement the two-level tie-break (validFrom asc, then id lex)?
- [ ] **BOGO groups**: Does the plan use `floor(qty / (buyQty + getQty)) * getQty` (repeating, not capped)?
- [ ] **BOGO zero discount**: Does the plan exclude BOGO promos that compute to discount 0?
- [ ] **Threshold basis**: Does the plan sum **line nets** (post-discount) to test `minSubtotal`, not gross?
- [ ] **Empty cart**: Does the plan return a valid zero-total result, not throw?
- [ ] **Error messages**: Exact strings matter — `"Unknown product: <id>"`, `"Unknown account: <id>"`, `"Invalid qty for <productId>"`, `"Unknown route: <routeId>"`, `"Account not on route: <accountId>"`, `"Invalid date: <asOf>"`.
- [ ] **Part C import**: Does `settle.ts` import `priceOrder` from `../pricing/engine` (not re-implement it)?
- [ ] **auditAccounts sort**: Result sorted by `accountId` ascending?
- [ ] **stopsVisited dedup**: Stop listed once at its first position in route order, not twice?
- [ ] **Commission tiers**: Marginal (bracket) calculation, not flat rate?
- [ ] **perCategory keys**: Sorted ascending, zero-net categories absent?
- [ ] **promoUsage keys**: Sorted ascending?
- [ ] **daysSinceVisit=14**: Overdue is false (strictly greater than 14)?

### Trap avoidance

- [ ] Plan does NOT copy logic from `src/legacy/pricingV1.ts`.
- [ ] Plan does NOT use the discount matrix from `src/legacy/discountMatrix.ts`.
- [ ] Plan does NOT import JSON files directly.
- [ ] Plan does NOT contradict `docs/NOTES.md` items that conflict with SPEC (SPEC wins).

### Validation completeness

- [ ] Build, test, and lint steps are included.
- [ ] Spot-check scenarios cover the BOGO edge case (qty < buyQty+getQty).
- [ ] Spot-check scenarios cover the threshold boundary (exactly at minSubtotal).
- [ ] Spot-check scenarios cover the commission boundary values (200, 500).
- [ ] Spot-check scenarios cover `weightedScore` with 1 and 2 counted visits.
- [ ] Spot-check scenarios cover `daysSinceVisit` = 14 (not overdue) and = 15 (overdue).

### Risks and edge cases not yet addressed

List any spec scenario that is not covered in the plan or validation steps.

---

## Output format

Write to `harness/state/loop-state.json` under `reviewerFeedback`:

```json
{
  "iteration": 1,
  "decision": "approve | revise | blocked",
  "approvedAt": null,
  "checklistResults": {
    "roundingCorrect": true,
    "dateWindowInclusive": true,
    "bestForCustomerSelection": true,
    "tiebBreakImplemented": false,
    "bogoGroupsRepeating": true,
    "bogoZeroDiscount": true,
    "thresholdOnLineNets": true,
    "emptyCartHandled": true,
    "errorMessagesExact": false,
    "partCImportsPriceOrder": true,
    "auditSortedAscending": null,
    "stopsVisitedDeduped": null,
    "commissionMarginal": null,
    "perCategoryKeysSorted": null,
    "promoUsageKeysSorted": null,
    "daysSinceVisit14NotOverdue": null,
    "noLegacyCodeCopied": true,
    "noDirectJsonImport": true,
    "buildVerified": null,
    "testVerified": null,
    "lintVerified": null
  },
  "requiredChanges": [
    "Describe each change needed before approval"
  ],
  "warnings": [
    "Non-blocking issues to watch"
  ],
  "approvedFeatures": []
}
```

Set `decision`:
- `"approve"` — all required checklist items pass, no blocking issues.
- `"revise"` — one or more required items fail; list them in `requiredChanges`.
- `"blocked"` — a question must be answered by a human before proceeding; record in `blockingQuestions` on the gap entry.

When `decision` is `"approve"`, set `approvedAt` to the current ISO date.
