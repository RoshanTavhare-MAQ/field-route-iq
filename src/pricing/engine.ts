import {
  getAccount,
  getProduct,
  getPromotions,
} from '../data/index.ts'
import type {
  PercentOffPromotion,
  BogoPromotion,
  ThresholdPromotion,
  Promotion,
  Product,
} from '../data/index.ts'

// ── Types (SPEC §2) ─────────────────────────────────────────────────────────

export interface CartLine {
  productId: string
  qty: number
}

export interface PriceOrderInput {
  lines: CartLine[]
  accountId: string
  date: string // ISO date, e.g. "2026-07-20"
}

export interface PricedLine {
  productId: string
  qty: number
  unitPrice: number
  gross: number
  appliedPromoId: string | null
  discount: number
  net: number
}

export interface PricedOrder {
  lines: PricedLine[]
  orderLevel: { appliedPromoId: string | null; discount: number }
  subtotal: number
  total: number
}

// ── Rounding (SPEC §6) ───────────────────────────────────────────────────────
// Half-up to 2dp. Uses the e-notation trick to avoid IEEE 754 artifacts
// (e.g. 2.175 stored as 2.17499… rounds correctly to 2.18).

function round2(x: number): number {
  return Number(`${Math.round(Number(`${x}e2`))}e-2`)
}

// ── Promotion helpers ────────────────────────────────────────────────────────

function isEligible(promo: Promotion, date: string, segment: string): boolean {
  // Date window: both endpoints inclusive (SPEC §4)
  if (date < promo.validFrom || date > promo.validTo) return false
  // Segment gating (SPEC §4)
  if (promo.eligibleSegments && !promo.eligibleSegments.includes(segment)) return false
  return true
}

function percentOffApplies(promo: PercentOffPromotion, product: Product): boolean {
  if (promo.scope.category !== undefined) return product.category === promo.scope.category
  if (promo.scope.productIds !== undefined) return promo.scope.productIds.includes(product.id)
  return false
}

// Returns the winner when two candidates have equal discount:
// earlier validFrom wins; lex smaller id wins on further tie.
function tieBreakWins(challenger: Promotion, current: Promotion): boolean {
  if (challenger.validFrom < current.validFrom) return true
  if (challenger.validFrom > current.validFrom) return false
  return challenger.id < current.id
}

// ── Core: priceOrder (SPEC §2–§7) ───────────────────────────────────────────

export function priceOrder(input: PriceOrderInput): PricedOrder {
  const { lines, accountId, date } = input

  // Validate account (SPEC §7)
  const account = getAccount(accountId)
  if (!account) throw new Error(`Unknown account: ${accountId}`)

  // Validate all lines upfront (SPEC §7)
  for (const line of lines) {
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      throw new Error(`Invalid qty for ${line.productId}`)
    }
    if (!getProduct(line.productId)) {
      throw new Error(`Unknown product: ${line.productId}`)
    }
  }

  // Partition active + eligible promotions by type
  const allPromos = getPromotions().filter((p) => isEligible(p, date, account.segment))
  const lineLevelPromos = allPromos.filter(
    (p): p is PercentOffPromotion | BogoPromotion =>
      p.type === 'percent_off' || p.type === 'bogo',
  )
  const thresholdPromos = allPromos.filter(
    (p): p is ThresholdPromotion => p.type === 'threshold',
  )

  // ── Price each line ────────────────────────────────────────────────────────

  const pricedLines: PricedLine[] = lines.map((line) => {
    const product = getProduct(line.productId)! // validated above
    const gross = round2(product.unitPrice * line.qty)

    // Collect applicable line-level promos and their computed discounts
    let bestPromo: Promotion | null = null
    let bestDiscount = 0

    for (const promo of lineLevelPromos) {
      let candidate = 0

      if (promo.type === 'percent_off') {
        if (!percentOffApplies(promo, product)) continue
        candidate = round2((gross * promo.percent) / 100)
      } else {
        // bogo
        if ((promo as BogoPromotion).productId !== line.productId) continue
        const { buyQty, getQty } = promo as BogoPromotion
        const freeUnits = Math.floor(line.qty / (buyQty + getQty)) * getQty
        candidate = round2(freeUnits * product.unitPrice)
      }

      // discount 0 → not applicable (SPEC §5 rule 3)
      if (candidate === 0) continue

      // Select best-for-customer; tie-break by validFrom asc then id lex asc (SPEC §5)
      if (
        bestPromo === null ||
        candidate > bestDiscount ||
        (candidate === bestDiscount && tieBreakWins(promo, bestPromo))
      ) {
        bestPromo = promo
        bestDiscount = candidate
      }
    }

    const discount = bestDiscount
    const net = round2(Math.max(0, gross - discount))

    return {
      productId: line.productId,
      qty: line.qty,
      unitPrice: product.unitPrice,
      gross,
      appliedPromoId: bestPromo ? bestPromo.id : null,
      discount,
      net,
    }
  })

  // ── Select best threshold promo (SPEC §3.3, §5 rule 4) ────────────────────
  // Qualify on sum of line nets for products in promo's category (SPEC §3.3)

  let bestThreshold: ThresholdPromotion | null = null
  let bestAmountOff = 0

  for (const promo of thresholdPromos) {
    const categoryNetSum = pricedLines
      .filter((pl) => getProduct(pl.productId)!.category === promo.category)
      .reduce((sum, pl) => sum + pl.net, 0)

    if (categoryNetSum >= promo.minSubtotal) {
      if (
        bestThreshold === null ||
        promo.amountOff > bestAmountOff ||
        (promo.amountOff === bestAmountOff && tieBreakWins(promo, bestThreshold))
      ) {
        bestThreshold = promo
        bestAmountOff = promo.amountOff
      }
    }
  }

  const orderLevel = {
    appliedPromoId: bestThreshold ? bestThreshold.id : null,
    discount: bestThreshold ? round2(bestThreshold.amountOff) : 0,
  }

  const subtotal = round2(pricedLines.reduce((sum, pl) => sum + pl.net, 0))
  const total = round2(Math.max(0, subtotal - orderLevel.discount))

  return { lines: pricedLines, orderLevel, subtotal, total }
}
