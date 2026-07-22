import { getAccounts, getVisits } from '../data/index.ts'

// ── Types (SPEC §10.1) ───────────────────────────────────────────────────────

export interface AccountAudit {
  accountId: string
  weightedScore: number | null
  trend: 'up' | 'down' | 'flat' | null
  daysSinceVisit: number | null
  overdue: boolean
  status: 'healthy' | 'watch' | 'critical' | 'unvisited'
}

// ── Rounding (SPEC §6) ───────────────────────────────────────────────────────

function round2(x: number): number {
  return Number(`${Math.round(Number(`${x}e2`))}e-2`)
}

// ── auditAccounts (SPEC §10) ─────────────────────────────────────────────────

export function auditAccounts(asOf: string): AccountAudit[] {
  // Validate asOf format (SPEC §10.1)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error(`Invalid date: ${asOf}`)
  }

  const accounts = getAccounts()
  const allVisits = getVisits()

  const result: AccountAudit[] = accounts.map((account) => {
    // Counted visits: date ≤ asOf, sorted most-recent-first (SPEC §10.2)
    const counted = allVisits
      .filter((v) => v.accountId === account.id && v.date <= asOf)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1 // date desc
        return a.id < b.id ? 1 : -1 // id desc
      })

    // Up to 3 most recent with weights 3, 2, 1 (SPEC §10.3)
    const top = counted.slice(0, 3)
    const weights = [3, 2, 1]

    // weightedScore (SPEC §10.3)
    let weightedScore: number | null = null
    if (top.length > 0) {
      let weightSum = 0
      let scoreSum = 0
      for (let i = 0; i < top.length; i++) {
        weightSum += weights[i]
        scoreSum += weights[i] * top[i].shelfScore
      }
      weightedScore = round2(scoreSum / weightSum)
    }

    // trend (SPEC §10.4)
    let trend: 'up' | 'down' | 'flat' | null = null
    if (top.length >= 2) {
      const s1 = top[0].shelfScore
      const s2 = top[1].shelfScore
      trend = s1 > s2 ? 'up' : s1 < s2 ? 'down' : 'flat'
    }

    // daysSinceVisit (SPEC §10.5)
    let daysSinceVisit: number | null = null
    if (top.length > 0) {
      const asOfMs = Date.parse(asOf)
      const visitMs = Date.parse(top[0].date)
      daysSinceVisit = Math.floor((asOfMs - visitMs) / 86_400_000)
    }

    // overdue: null OR strictly > 14 (SPEC §10.5)
    const overdue = daysSinceVisit === null || daysSinceVisit > 14

    // status (SPEC §10.6) — decided on the rounded weightedScore
    let status: 'healthy' | 'watch' | 'critical' | 'unvisited'
    if (weightedScore === null) {
      status = 'unvisited'
    } else if (weightedScore < 2.5) {
      status = 'critical'
    } else if (weightedScore < 3.5) {
      status = 'watch'
    } else {
      status = 'healthy'
    }

    return {
      accountId: account.id,
      weightedScore,
      trend,
      daysSinceVisit,
      overdue,
      status,
    }
  })

  // Sort by accountId ascending (SPEC §10.1)
  result.sort((a, b) => (a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0))

  return result
}
