#!/usr/bin/env node
/**
 * harness/orchestrator.mjs
 *
 * Drives the Discover → Develop → Verify → Review loop.
 * Uses only Node.js built-in modules — no new dependencies required.
 *
 * Commands:
 *   node harness/orchestrator.mjs status              Print current state + next action prompt
 *   node harness/orchestrator.mjs advance             Move to next phase for active feature
 *   node harness/orchestrator.mjs complete            Mark active feature as reviewer-approved
 *   node harness/orchestrator.mjs discover            Reset to discover phase (re-scan)
 *   node harness/orchestrator.mjs reset-to-develop    Return to develop phase with reviewer feedback
 *   node harness/orchestrator.mjs select <featureId>  Switch active feature
 *   node harness/orchestrator.mjs summary             Print completion status of all features
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const GAPS_FILE = join(HERE, 'state', 'feature-gaps.json')
const STATE_FILE = join(HERE, 'state', 'loop-state.json')

const PHASES = ['discover', 'develop', 'verify', 'review']

const AGENT_PROMPTS = {
  discover: `
═══════════════════════════════════════════════════════════════
  PHASE: DISCOVER  →  Run the Discovery Agent
═══════════════════════════════════════════════════════════════
  Instructions: harness/agents/discovery.md
  Output target: harness/state/feature-gaps.json

  The Discovery Agent should:
  1. Read README.md, SPEC.md, RULES.md
  2. Identify missing files: src/pricing/, src/audit/, src/settlement/
  3. Find TODO/FIXME comments in existing source files
  4. Update harness/state/feature-gaps.json with structured findings

  After the agent run, advance the loop:
    node harness/orchestrator.mjs advance
═══════════════════════════════════════════════════════════════
`,
  develop: `
═══════════════════════════════════════════════════════════════
  PHASE: DEVELOP  →  Run the Developer Agent
═══════════════════════════════════════════════════════════════
  Instructions: harness/agents/developer.md
  Input:  harness/state/feature-gaps.json (active feature gap)
          harness/state/loop-state.json   (reviewerFeedback if iteration > 0)
  Output: src/pricing/engine.ts  |  src/audit/shelfAudit.ts  |  src/settlement/settle.ts
          harness/state/loop-state.json  (completionPlan summary)

  The Developer Agent should:
  1. Read the active feature entry from feature-gaps.json
  2. Re-read the relevant SPEC.md sections listed in specSections
  3. Check reviewerFeedback in loop-state.json for prior-iteration notes
  4. WRITE the implementation to the file listed in affectedFiles
  5. Record a summary in loop-state.json under completionPlan

  AUTHORISED to create/edit: src/pricing/, src/audit/, src/settlement/
  DO NOT modify any other existing source files.

  WARNING: Do NOT use pricingV1.ts logic or discountMatrix.ts.
           SPEC.md overrides everything in docs/NOTES.md.

  After the agent run, advance the loop:
    node harness/orchestrator.mjs advance
═══════════════════════════════════════════════════════════════
`,
  verify: `
═══════════════════════════════════════════════════════════════
  PHASE: VERIFY  →  Run the Verifier Agent
═══════════════════════════════════════════════════════════════
  Instructions: harness/agents/verifier.md
  Input:  harness/state/loop-state.json (completionPlan)
  Output: harness/state/loop-state.json (validationSteps)

  The Verifier Agent should:
  1. Read completionPlan from loop-state.json
  2. Define build/test/lint validation steps
  3. Define manual spot-check scenarios aligned with SPEC.md
  4. Write validation steps to loop-state.json under validationSteps
  5. Flag any blockers (missing exports, direct JSON imports, etc.)

  Available commands (do not install new tools):
    npm run build   — TypeScript compile + bundle
    npm run test    — Vitest test suite
    npm run lint    — oxlint

  After the agent run, advance the loop:
    node harness/orchestrator.mjs advance
═══════════════════════════════════════════════════════════════
`,
  review: `
═══════════════════════════════════════════════════════════════
  PHASE: REVIEW  →  Run the Reviewer Agent
═══════════════════════════════════════════════════════════════
  Instructions: harness/agents/reviewer.md
  Input:  harness/state/loop-state.json   (completionPlan + validationSteps)
          harness/state/feature-gaps.json (active feature gap + knownTraps)
          SPEC.md                         (ground truth)
  Output: harness/state/loop-state.json  (reviewerFeedback)

  The Reviewer Agent should:
  1. Read completionPlan and validationSteps from loop-state.json
  2. Check every item in the reviewer checklist (reviewer.md)
  3. Verify all known traps are avoided (see feature-gaps.json.knownTraps)
  4. Set decision: approve | revise | blocked
  5. Write structured feedback to loop-state.json under reviewerFeedback

  If decision = "approve":
    node harness/orchestrator.mjs complete

  If decision = "revise":
    node harness/orchestrator.mjs reset-to-develop

  If decision = "blocked":
    Resolve the blocking question manually, then re-run this phase.
═══════════════════════════════════════════════════════════════
`,
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function loadState() {
  return readJson(STATE_FILE)
}

function saveState(state) {
  state.lastUpdated = new Date().toISOString().slice(0, 10)
  writeJson(STATE_FILE, state)
}

function loadGaps() {
  return readJson(GAPS_FILE)
}

function getActiveGap(state, gaps) {
  return gaps.find(g => g.id === state.activeFeatureId) || null
}

function printStatus(state, gaps) {
  const gap = getActiveGap(state, gaps)
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  Field Route IQ — Multi-Agent Harness Status')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  Active feature   : ${state.activeFeatureId || '(none)'}`)
  console.log(`  Phase            : ${state.phase}`)
  console.log(`  Iteration        : ${state.iteration}`)
  console.log(`  Completed        : ${state.completedFeatures.join(', ') || '(none)'}`)
  console.log(`  Last updated     : ${state.lastUpdated}`)
  if (gap) {
    console.log(`\n  Gap status       : ${gap.status}`)
    console.log(`  Reviewer approved: ${gap.reviewerApproved}`)
    if (gap.blockingQuestions.length > 0) {
      console.log(`  Blocking questions:`)
      gap.blockingQuestions.forEach(q => console.log(`    • ${q}`))
    }
  }
  const scored = gaps.filter(g => g.scored)
  const done = scored.filter(g => g.reviewerApproved)
  console.log(`\n  Scored features  : ${done.length}/${scored.length} approved`)
  console.log('')
  console.log(AGENT_PROMPTS[state.phase] || `  Unknown phase: ${state.phase}`)
}

function cmd_status() {
  const state = loadState()
  const gaps = loadGaps()
  printStatus(state, gaps)
}

function cmd_advance() {
  const state = loadState()
  const gaps = loadGaps()
  const currentIndex = PHASES.indexOf(state.phase)
  if (currentIndex === -1) {
    console.error(`Unknown phase: ${state.phase}`)
    process.exit(1)
  }
  // Archive current phase in history
  state.history.push({
    featureId: state.activeFeatureId,
    phase: state.phase,
    iteration: state.iteration,
    timestamp: new Date().toISOString(),
  })
  if (currentIndex < PHASES.length - 1) {
    state.phase = PHASES[currentIndex + 1]
    state.iteration = currentIndex + 1 === 0 ? state.iteration + 1 : state.iteration
    console.log(`\n  ✓ Advanced to phase: ${state.phase}`)
  } else {
    console.log(`\n  Already at final phase (review). Use 'complete' or 'reset-to-develop'.`)
  }
  saveState(state)
  printStatus(state, gaps)
}

function cmd_complete() {
  const state = loadState()
  const gaps = loadGaps()
  const gap = getActiveGap(state, gaps)
  if (!gap) {
    console.error(`No active feature gap found: ${state.activeFeatureId}`)
    process.exit(1)
  }
  // Mark gap approved
  gap.reviewerApproved = true
  gap.status = 'complete'
  writeJson(GAPS_FILE, gaps)

  // Move to completed list
  if (!state.completedFeatures.includes(state.activeFeatureId)) {
    state.completedFeatures.push(state.activeFeatureId)
  }

  // Find next unfinished scored feature
  const nextGap = gaps.find(g => g.scored && !g.reviewerApproved)
  if (nextGap) {
    state.activeFeatureId = nextGap.id
    state.phase = 'develop'
    state.iteration += 1
    state.completionPlan = null
    state.validationSteps = null
    state.reviewerFeedback = null
    console.log(`\n  ✓ Feature '${gap.id}' marked complete.`)
    console.log(`  → Next feature: ${nextGap.id}`)
  } else {
    state.activeFeatureId = null
    state.phase = 'discover'
    console.log(`\n  ✓ Feature '${gap.id}' marked complete.`)
    console.log(`  ✓ All scored features are complete!`)
    console.log(`\n  Next step: run 'npm run build' and 'npm run test' for final verification,`)
    console.log(`  then commit and push: git add src COST.txt && git commit -m submission && git push`)
  }
  saveState(state)
}

function cmd_resetToDevelop() {
  const state = loadState()
  const gaps = loadGaps()
  state.phase = 'develop'
  state.iteration += 1
  state.completionPlan = null
  state.validationSteps = null
  // Keep reviewerFeedback so developer can read it
  console.log(`\n  ↩ Reset to develop phase (iteration ${state.iteration}).`)
  console.log(`    Developer should read reviewerFeedback in loop-state.json.`)
  saveState(state)
  printStatus(state, gaps)
}

function cmd_discover() {
  const state = loadState()
  const gaps = loadGaps()
  state.phase = 'discover'
  state.completionPlan = null
  state.validationSteps = null
  state.reviewerFeedback = null
  console.log(`\n  ↺ Reset to discover phase.`)
  saveState(state)
  printStatus(state, gaps)
}

function cmd_select(featureId) {
  const state = loadState()
  const gaps = loadGaps()
  const gap = gaps.find(g => g.id === featureId)
  if (!gap) {
    console.error(`Unknown feature id: ${featureId}`)
    console.error(`Known ids: ${gaps.map(g => g.id).join(', ')}`)
    process.exit(1)
  }
  state.activeFeatureId = featureId
  state.phase = gap.reviewerApproved ? 'review' : 'develop'
  state.iteration += 1
  state.completionPlan = null
  state.validationSteps = null
  state.reviewerFeedback = null
  console.log(`\n  → Switched active feature to: ${featureId} (phase: ${state.phase})`)
  saveState(state)
  printStatus(state, gaps)
}

function cmd_summary() {
  const gaps = loadGaps()
  const state = loadState()
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  Feature Completion Summary')
  console.log('═══════════════════════════════════════════════════════════════')
  gaps.forEach(g => {
    const scored = g.scored ? '[SCORED]' : '[opt]   '
    const approved = g.reviewerApproved ? '✓ approved' : `✗ ${g.status}`
    const active = state.activeFeatureId === g.id ? ' ← ACTIVE' : ''
    console.log(`  ${scored} ${g.id.padEnd(25)} ${approved}${active}`)
  })
  const scoredGaps = gaps.filter(g => g.scored)
  const approvedCount = scoredGaps.filter(g => g.reviewerApproved).length
  console.log(`\n  Scored: ${approvedCount}/${scoredGaps.length} complete`)
  console.log('')
}

// ── main ──────────────────────────────────────────────────────────────────────

const [,, command, ...args] = process.argv

switch (command) {
  case 'status':        cmd_status(); break
  case 'advance':       cmd_advance(); break
  case 'complete':      cmd_complete(); break
  case 'reset-to-develop': cmd_resetToDevelop(); break
  case 'discover':      cmd_discover(); break
  case 'select':        cmd_select(args[0]); break
  case 'summary':       cmd_summary(); break
  default:
    console.log(`
Usage: node harness/orchestrator.mjs <command>

Commands:
  status              Print current state and next agent action prompt
  advance             Move to next phase (discover→develop→verify→review)
  complete            Mark active feature as approved; switch to next
  reset-to-develop    Return to develop phase (after reviewer requests changes)
  discover            Reset to discover phase for a fresh gap scan
  select <featureId>  Switch active feature
  summary             Print completion status of all features

Feature IDs: pricing-engine, shelf-audit, route-settlement, order-page-promotions
`)
    process.exit(1)
}
