# Developer Agent — Instructions

## Role
Read the active feature gap from `harness/state/feature-gaps.json` and
`harness/state/loop-state.json`, then **write the implementation directly** into the
correct source file(s) under `src/pricing/`, `src/audit/`, or `src/settlement/`.
Record a brief summary of what was implemented in `loop-state.json` under `completionPlan`.

**You are authorised to create and edit files under `src/pricing/`, `src/audit/`,
and `src/settlement/`. Do not modify any other existing source files.**

---

## Inputs to read (in this order)

1. `harness/state/feature-gaps.json` — find the entry whose `id` matches `activeFeatureId` in `loop-state.json`
2. `SPEC.md` — re-read every section listed in the gap's `specSections`
3. `src/data/index.ts` — all available loaders and TypeScript types
4. `harness/state/loop-state.json` — check `reviewerFeedback` for any prior iteration notes

## Inputs to treat as reference only (do not copy logic from)

- `src/legacy/pricingV1.ts` — semantics deliberately conflict with SPEC.md
- `docs/NOTES.md` — meeting notes, not authoritative

---

## Critical spec facts — memorize before writing any plan

### Rounding (SPEC §6)
- **Half-up to 2 decimal places.** NOT banker's rounding.
- `1.005 → 1.01`; `2.175` is stored as `2.17499…` so naive `Math.round` gives `2.17` — wrong.
- Safe implementation: `Math.round((x + Number.EPSILON) * 100) / 100` or equivalent.
- Round `gross` and `discount` independently per line; then `net = round2(gross − discount)` clamped at 0.
- `subtotal = round2(sum of line nets)`. `total = round2(subtotal − orderLevel.discount)` clamped at 0.

### Promotion date window (SPEC §4)
- `validFrom ≤ date ≤ validTo` — **both endpoints inclusive**.
- String comparison of ISO dates (`"2026-07-20" <= date && date <= "2026-07-31"`) is correct.
- NOTES.md says validTo is exclusive — that is wrong for this project; SPEC wins.

### Stacking (SPEC §5)
- **At most one line-level promo per line** — pick the one with the largest discount (best for customer).
- Tie-break: earlier `validFrom`, then lexicographically smaller `id`.
- A promo producing discount 0 is not applicable (BOGO with qty < buyQty+getQty).
- **At most one order-level (threshold) promo** — pick the largest `amountOff`.
- Line-level and order-level promos DO stack with each other.
- pricingV1 applies ALL matching promos cumulatively — that is wrong; SPEC wins.

### BOGO groups (SPEC §3.2)
- Groups **repeat**: `freeUnits = floor(qty / (buyQty + getQty)) * getQty`.
- NOTES.md says capped at one group — that is wrong; SPEC wins.

### Threshold qualification (SPEC §3.3)
- Qualifies when sum of **line nets** (post-discount) for products in `category` ≥ `minSubtotal`.
- NOTES.md says "qualify on gross" — that is wrong; SPEC wins.

### Data access
- Use `getProducts()`, `getAccounts()`, `getPromotions()`, `getRoutes()`, `getVisits()`,
  `getProduct(id)`, `getAccount(id)` from `src/data/index.ts`.
- Do NOT import JSON files directly.

### Part C dependency
- `settle.ts` must `import { priceOrder } from '../pricing/engine'`.
- It is scored through the developer's own `priceOrder`, so both parts must agree.

---

## Planning checklist — Part A (priceOrder)

- [ ] Define `CartLine`, `PriceOrderInput`, `PricedLine`, `PricedOrder` (match SPEC §2 exactly)
- [ ] Validate inputs (empty lines OK; unknown productId/accountId throw; qty ≤ 0 or non-integer throw)
- [ ] Implement `round2` with half-up semantics
- [ ] For each line: compute `gross = round2(unitPrice * qty)`
- [ ] Filter active, eligible promotions (date window + segmentEligibility)
- [ ] For each line: select best line-level promo (percent_off and bogo only)
  - percent_off: scope matching (category or productIds)
  - bogo: productId match, repeating groups, discount=0 → not applicable
- [ ] For each line: compute `discount`, `net`
- [ ] Select best threshold promo: sum line nets by category, check minSubtotal
- [ ] Build `orderLevel` and compute `subtotal`, `total`

## Planning checklist — Part B (auditAccounts)

- [ ] Validate `asOf` matches `YYYY-MM-DD`; throw if invalid
- [ ] For each account in `getAccounts()`, filter visits `date ≤ asOf`
- [ ] Sort counted visits: date desc, ties by id desc
- [ ] Take up to 3 most recent; apply weights 3, 2, 1
- [ ] Compute `weightedScore = round2(Σ(weight×score) / Σweight)`; null if 0 visits
- [ ] Trend: compare s₁ vs s₂ (latest two); null if < 2 visits
- [ ] `daysSinceVisit`: whole calendar days from latest visit to asOf; null if 0 visits
- [ ] `overdue`: null daysSinceVisit OR daysSinceVisit > 14 (14 is NOT overdue)
- [ ] `status`: unvisited | critical (<2.5) | watch (2.5–3.5) | healthy (≥3.5)
- [ ] Sort result by `accountId` ascending

## Planning checklist — Part C (settleRoute)

- [ ] Validate routeId via `getRoutes()`; throw `"Unknown route: <id>"`
- [ ] Validate each order's accountId is in the route's stops; throw `"Account not on route: <id>"`
- [ ] Price each order with `priceOrder({ lines, accountId, date })`
- [ ] Aggregate money totals with round2
- [ ] Build `perCategory`: sum line nets by product category; absent if zero; keys sorted asc
- [ ] Build `promoUsage`: count line appliedPromoId + order-level appliedPromoId; keys sorted asc
- [ ] Compute `commission` with marginal tiers: 2% on first 200, 5% on 200–500, 8% over 500; round2 at end
- [ ] `stopsVisited`: stop accountIds with ≥1 order, in route stop order, no duplicates (first occurrence)
- [ ] `stopsMissed`: remaining stop accountIds in route stop order

---

## Output

1. **Write the implementation** to the file path listed in the active gap's `affectedFiles`
   (e.g. `src/pricing/engine.ts`). Create the directory if it does not exist.

2. **Record a summary** in `harness/state/loop-state.json` under `completionPlan`:
   ```json
   {
     "filesCreated": ["src/pricing/engine.ts"],
     "checklistCompleted": ["...items addressed"],
     "knownRisks": ["...edge cases or uncertainties"],
     "blockingQuestions": []
   }
   ```
   Leave `blockingQuestions` empty unless something in the spec is genuinely ambiguous —
   do not guess; record the unresolved question instead.
