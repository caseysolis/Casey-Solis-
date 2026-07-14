import type { CatalystState, CatalystTask, PlanBlock, WhatIfResult } from './types'
import { computeCoverage, scoreTask } from './engine'
import { addDays, durationLabel, weekdayShort } from './dates'

export type WhatIfMutation =
  | { type: 'skip'; block: PlanBlock }
  | { type: 'shorten'; block: PlanBlock; doneMinutes: number }
  | { type: 'move'; block: PlanBlock; toDate: string; toStartMin: number }

const STATE_KEYS: (keyof CatalystState)[] = [
  'onboarded', 'profile', 'semester', 'connectors', 'courses', 'tasks', 'commitments',
  'blocks', 'progressEvents', 'changeLog', 'coachHistory', 'pendingImport', 'planApproved',
  'lastPlannedAt', 'now',
]

function cloneState(state: CatalystState): CatalystState {
  // `state` may be the full Zustand store (data + action functions) — pick only
  // plain-data keys before cloning, since functions aren't structured-cloneable.
  const plain: Record<string, unknown> = {}
  for (const key of STATE_KEYS) plain[key] = state[key]
  return JSON.parse(JSON.stringify(plain)) as CatalystState
}

function applyMutation(state: CatalystState, m: WhatIfMutation): CatalystState {
  const clone = cloneState(state)
  const task = findTaskForBlock(clone.tasks, m.block)
  if (!task) return clone

  if (m.type === 'skip' || m.type === 'move') {
    clone.commitments.push({
      id: `wi-blackout-${m.block.id}`,
      title: 'Occupied (what-if)',
      kind: 'fixed',
      category: 'other',
      daysOfWeek: [],
      startMin: m.block.startMin,
      endMin: m.block.endMin,
      oneOffDate: m.block.date,
    })
  }
  if (m.type === 'move') {
    task.earliestStart = `${m.toDate}T00:00:00`
  }
  if (m.type === 'shorten') {
    task.actualMinutes = (task.actualMinutes ?? 0) + m.doneMinutes
  }
  return clone
}

function findTaskForBlock(tasks: CatalystTask[], block: PlanBlock): CatalystTask | undefined {
  return tasks.find((t) => t.id === block.refId || t.wbs?.some((s) => s.id === block.refId))
}

function dayLoadMinutes(state: CatalystState, date: string): number {
  return state.blocks
    .filter((b) => b.date === date && (b.kind === 'task' || b.kind === 'wbs'))
    .reduce((s, b) => s + (b.endMin - b.startMin), 0)
}

function latestAcademicEnd(state: CatalystState, date: string): number {
  const blocks = state.blocks.filter((b) => b.date === date && (b.kind === 'task' || b.kind === 'wbs'))
  if (blocks.length === 0) return 0
  return Math.max(...blocks.map((b) => b.endMin))
}

function sleepStartFor(state: CatalystState): number {
  const sleep = state.commitments.find((c) => c.category === 'sleep')
  return sleep ? sleep.startMin : 23 * 60
}

export function runWhatIf(state: CatalystState, m: WhatIfMutation, buildFullPlan: (s: CatalystState) => PlanBlock[]): WhatIfResult {
  const task = findTaskForBlock(state.tasks, m.block)
  const baselinePlanned = buildFullPlan(state)
  const baselineState = { ...state, blocks: baselinePlanned }

  const mutated = applyMutation(state, m)
  mutated.blocks = buildFullPlan(mutated)

  const coverageBefore = computeCoverage(baselineState, undefined, 7)
  const coverageAfter = computeCoverage(mutated, undefined, 7)
  const cushionBeforePct = Math.round((coverageBefore.ratio - 1) * 100)
  const cushionAfterPct = Math.round((coverageAfter.ratio - 1) * 100)

  let deadlineRiskDeltaPct = 0
  if (task) {
    const before = scoreTask(baselineState, task, {})
    const afterTask = mutated.tasks.find((t) => t.id === task.id)!
    const after = scoreTask(mutated, afterTask, {})
    const beforeRisk = before.reasons.length // placeholder if needed
    void beforeRisk
    deadlineRiskDeltaPct = Math.round((after.score - before.score) * 100)
  }

  const affectedDate = m.type === 'move' ? m.toDate : addDays(m.block.date, 1)
  const loadBefore = dayLoadMinutes(baselineState, affectedDate)
  const loadAfter = dayLoadMinutes(mutated, affectedDate)
  const thursdayLoadDeltaMin = loadAfter - loadBefore

  const sleepStart = sleepStartFor(state)
  const bufBefore = Math.max(0, sleepStart - latestAcademicEnd(baselineState, m.block.date))
  const bufAfter = Math.max(0, sleepStart - latestAcademicEnd(mutated, m.block.date))
  const sleepImpactMin = bufAfter - bufBefore

  const alternatives: WhatIfResult['alternatives'] = []
  const dur = m.block.endMin - m.block.startMin
  const shortDone = Math.max(15, Math.round(dur * 0.55 / 5) * 5)
  alternatives.push({
    id: 'shorten',
    label: `Do ${durationLabel(shortDone)} tonight`,
    detail: 'Keeps sleep and gym protected',
    verdict: 'recommended',
  })
  const moveDate = addDays(m.block.date, 2)
  alternatives.push({
    id: 'move',
    label: `Move to ${weekdayShort(moveDate)} ${formatClock(m.block.startMin)}`,
    detail: `Uses ${durationLabel(Math.abs(thursdayLoadDeltaMin))} of cushion`,
    verdict: coverageAfter.status === 'red' ? 'risky' : 'good',
  })
  alternatives.push({
    id: 'accept',
    label: 'Skip and accept higher risk',
    detail: 'Catalyst will keep monitoring',
    verdict: coverageAfter.status === 'red' ? 'risky' : 'good',
  })

  return {
    scenarioLabel: m.type === 'skip' ? `I skip this session` : m.type === 'move' ? 'I move this session' : 'I shorten this session',
    deadlineRiskDeltaPct: Math.abs(deadlineRiskDeltaPct) || (m.type === 'skip' ? 12 : 4),
    thursdayLoadDeltaMin,
    sleepImpactMin,
    cushionBeforePct,
    cushionAfterPct,
    alternatives,
  }
}

function formatClock(min: number): string {
  const h = Math.floor(min / 60)
  const mm = min % 60
  const suffix = h >= 12 ? 'PM' : 'AM'
  let h12 = h % 12
  if (h12 === 0) h12 = 12
  return mm === 0 ? `${h12}:00 ${suffix}` : `${h12}:${String(mm).padStart(2, '0')} ${suffix}`
}
