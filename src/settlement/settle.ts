import { getRoutes, getProduct } from '../data/index.ts'
import { priceOrder } from '../pricing/engine.ts'
import type { CartLine, PricedOrder } from '../pricing/engine.ts'

// ── Types (SPEC §11.1) ───────────────────────────────────────────────────────

export interface SettleRouteInput {
  routeId: string
  date: string
  orders: Array<{ accountId: string; lines: CartLine[] }>
}

export interface RouteSettlement {
  routeId: string
  date: string
  grossTotal: number
  lineDiscountTotal: number
  orderDiscountTotal: number
  discountTotal: number
  netTotal: number
  perCategory: Record<string, number>
  promoUsage: Record<string, number>
  commission: number
  stopsVisited: string[]
  stopsMissed: string[]
}

// ── Rounding (SPEC §6) ───────────────────────────────────────────────────────

function round2(x: number): number {
  return Number(`${Math.round(Number(`${x}e2`))}e-2`)
}

// ── Commission — marginal tiers (SPEC §11.6) ─────────────────────────────────

function calcCommission(netTotal: number): number {
  let raw = 0
  if (netTotal <= 0) {
    raw = 0
  } else if (netTotal <= 200) {
    raw = netTotal * 0.02
  } else if (netTotal <= 500) {
    raw = 200 * 0.02 + (netTotal - 200) * 0.05
  } else {
    raw = 200 * 0.02 + 300 * 0.05 + (netTotal - 500) * 0.08
  }
  return round2(raw)
}

// ── settleRoute (SPEC §11) ───────────────────────────────────────────────────

export function settleRoute(input: SettleRouteInput): RouteSettlement {
  const { routeId, date, orders } = input

  // Validate routeId (SPEC §11.2)
  const routes = getRoutes()
  const route = routes.find((r) => r.id === routeId)
  if (!route) throw new Error(`Unknown route: ${routeId}`)

  // Build set of valid stop accountIds for this route
  const routeStopIds = new Set(route.stops.map((s) => s.accountId))

  // Validate each order's accountId is on the route (SPEC §11.2)
  for (const order of orders) {
    if (!routeStopIds.has(order.accountId)) {
      throw new Error(`Account not on route: ${order.accountId}`)
    }
  }

  // Price every order — errors from priceOrder propagate unchanged (SPEC §11.2)
  const pricedOrders: PricedOrder[] = orders.map((order) =>
    priceOrder({ lines: order.lines, accountId: order.accountId, date }),
  )

  // ── Money totals (SPEC §11.3) ──────────────────────────────────────────────

  let rawGross = 0
  let rawLineDiscount = 0
  let rawOrderDiscount = 0
  let rawNet = 0

  for (const po of pricedOrders) {
    for (const pl of po.lines) {
      rawGross += pl.gross
      rawLineDiscount += pl.discount
    }
    rawOrderDiscount += po.orderLevel.discount
    rawNet += po.total
  }

  const grossTotal = round2(rawGross)
  const lineDiscountTotal = round2(rawLineDiscount)
  const orderDiscountTotal = round2(rawOrderDiscount)
  const discountTotal = round2(lineDiscountTotal + orderDiscountTotal)
  const netTotal = round2(rawNet)

  // ── Per-category nets (SPEC §11.4) ────────────────────────────────────────
  // Sum line nets by product category; order-level discounts NOT allocated.

  const categoryRaw: Record<string, number> = {}
  for (const po of pricedOrders) {
    for (const pl of po.lines) {
      const product = getProduct(pl.productId)!
      const cat = product.category
      categoryRaw[cat] = (categoryRaw[cat] ?? 0) + pl.net
    }
  }

  const perCategory: Record<string, number> = {}
  for (const cat of Object.keys(categoryRaw).sort()) {
    perCategory[cat] = round2(categoryRaw[cat])
  }

  // ── Promotion usage (SPEC §11.5) ──────────────────────────────────────────

  const usageRaw: Record<string, number> = {}
  for (const po of pricedOrders) {
    for (const pl of po.lines) {
      if (pl.appliedPromoId) {
        usageRaw[pl.appliedPromoId] = (usageRaw[pl.appliedPromoId] ?? 0) + 1
      }
    }
    if (po.orderLevel.appliedPromoId) {
      const pid = po.orderLevel.appliedPromoId
      usageRaw[pid] = (usageRaw[pid] ?? 0) + 1
    }
  }

  const promoUsage: Record<string, number> = {}
  for (const pid of Object.keys(usageRaw).sort()) {
    promoUsage[pid] = usageRaw[pid]
  }

  // ── Commission (SPEC §11.6) ────────────────────────────────────────────────

  const commission = calcCommission(netTotal)

  // ── Stops (SPEC §11.7) ────────────────────────────────────────────────────
  // Iterate route stops in order; deduplicate by first occurrence.

  const orderedAccountIds = new Set(orders.map((o) => o.accountId))
  const seen = new Set<string>()
  const stopsVisited: string[] = []
  const stopsMissed: string[] = []

  for (const stop of route.stops) {
    if (seen.has(stop.accountId)) continue
    seen.add(stop.accountId)
    if (orderedAccountIds.has(stop.accountId)) {
      stopsVisited.push(stop.accountId)
    } else {
      stopsMissed.push(stop.accountId)
    }
  }

  return {
    routeId,
    date,
    grossTotal,
    lineDiscountTotal,
    orderDiscountTotal,
    discountTotal,
    netTotal,
    perCategory,
    promoUsage,
    commission,
    stopsVisited,
    stopsMissed,
  }
}
