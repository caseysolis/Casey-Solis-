import type { CatalystState, PlanBlock } from './types'
import { scheduleAll, attachMeetingAndCommitmentBlocks, explainBlock } from './engine'
import { addDays, toDateStr } from './dates'

const HORIZON_DAYS = 21

export function buildFullPlan(state: CatalystState): PlanBlock[] {
  const { blocks } = scheduleAll(state)
  const from = toDateStr(new Date(state.now))
  const dates: string[] = []
  for (let i = 0; i <= HORIZON_DAYS; i++) dates.push(addDays(from, i))
  const fixed = attachMeetingAndCommitmentBlocks(state, dates)

  const explained = blocks.map((b) => {
    if (b.kind !== 'task' && b.kind !== 'wbs') return b
    if (b.explanation) return b
    const withBlocks = { ...state, blocks }
    const { explanation, reasons } = explainBlock(withBlocks, b)
    return { ...b, explanation, reasons }
  })

  return [...fixed, ...explained].sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1))
}

export function diffSummary(before: PlanBlock[], after: PlanBlock[]): { movedOrAdded: number; removed: number } {
  const beforeKeys = new Set(before.filter((b) => b.kind === 'task' || b.kind === 'wbs').map((b) => `${b.refId}|${b.date}|${b.startMin}`))
  const afterKeys = new Set(after.filter((b) => b.kind === 'task' || b.kind === 'wbs').map((b) => `${b.refId}|${b.date}|${b.startMin}`))
  let movedOrAdded = 0
  for (const k of afterKeys) if (!beforeKeys.has(k)) movedOrAdded++
  let removed = 0
  for (const k of beforeKeys) if (!afterKeys.has(k)) removed++
  return { movedOrAdded, removed }
}
