// Planning engine: feasibility/coverage, next-best-action scoring, greedy scheduler,
// replanning, and what-if simulation. Mirrors FDD Section 6.

import type {
  CatalystState,
  CatalystTask,
  Commitment,
  Course,
  CoverageWindow,
  DayForecast,
  PlanBlock,
  StudentProfile,
} from './types'
import { addDays, dayOfWeek, parseDateStr, toDateStr, minToLabel, durationLabel } from './dates'
import { COMMITMENT_COLORS, COVERAGE_THRESHOLDS, DAY_MIN } from './constants'

export interface Interval {
  startMin: number
  endMin: number
}

interface OccupiedBlock extends Interval {
  kind: 'meeting' | 'commitment' | 'block'
  title: string
  courseId?: string
  refId: string
  color: string
  locked: boolean
  status?: PlanBlock['status']
  category?: string
}

const HORIZON_DAYS = 21

function subtractInterval(free: Interval[], occ: Interval): Interval[] {
  const out: Interval[] = []
  for (const f of free) {
    if (occ.endMin <= f.startMin || occ.startMin >= f.endMin) {
      out.push(f)
      continue
    }
    if (occ.startMin > f.startMin) out.push({ startMin: f.startMin, endMin: Math.min(occ.startMin, f.endMin) })
    if (occ.endMin < f.endMin) out.push({ startMin: Math.max(occ.endMin, f.startMin), endMin: f.endMin })
  }
  return out.filter((i) => i.endMin - i.startMin > 0)
}

export function occupiedForDate(
  dateStr: string,
  courses: Course[],
  commitments: Commitment[],
  existingBlocks: PlanBlock[],
  profile: StudentProfile,
): OccupiedBlock[] {
  const dow = dayOfWeek(dateStr)
  const out: OccupiedBlock[] = []

  for (const c of courses) {
    if (c.archived) continue
    for (const m of c.meetings) {
      if (!m.daysOfWeek.includes(dow)) continue
      const buffer = profile.commuteBufferMin
      out.push({
        startMin: Math.max(0, m.startMin - buffer),
        endMin: Math.min(DAY_MIN, m.endMin + buffer),
        kind: 'meeting',
        title: `${c.code} ${m.label}`,
        courseId: c.id,
        refId: m.id,
        color: c.color,
        locked: true,
      })
    }
  }

  for (const cm of commitments) {
    if (cm.oneOffDate) {
      if (cm.oneOffDate !== dateStr) continue
    } else if (!cm.daysOfWeek.includes(dow)) continue
    if (cm.startMin < cm.endMin) {
      out.push({
        startMin: cm.startMin,
        endMin: cm.endMin,
        kind: 'commitment',
        title: cm.title,
        refId: cm.id,
        color: COMMITMENT_COLORS[cm.category] ?? '#94a3b8',
        locked: cm.kind !== 'flexible',
        category: cm.category,
      })
    } else {
      // wraps midnight (e.g. sleep 23:00-07:00): only the evening portion applies to "today"
      out.push({
        startMin: cm.startMin,
        endMin: DAY_MIN,
        kind: 'commitment',
        title: cm.title,
        refId: cm.id,
        color: COMMITMENT_COLORS[cm.category] ?? '#94a3b8',
        locked: cm.kind !== 'flexible',
        category: cm.category,
      })
    }
  }

  // morning portion of overnight sleep from the previous day
  const prevDow = (dow + 6) % 7
  for (const cm of commitments) {
    if (cm.category !== 'sleep') continue
    if (cm.startMin < cm.endMin) continue
    if (!cm.daysOfWeek.includes(prevDow)) continue
    out.push({
      startMin: 0,
      endMin: cm.endMin,
      kind: 'commitment',
      title: cm.title,
      refId: cm.id + '-am',
      color: COMMITMENT_COLORS.sleep,
      locked: true,
      category: 'sleep',
    })
  }

  for (const b of existingBlocks) {
    if (b.date !== dateStr) continue
    if (b.kind === 'meeting' || b.kind === 'commitment') continue
    if (b.status !== 'completed' && b.status !== 'in_progress' && !(b.locked && b.status === 'planned')) continue
    out.push({
      startMin: b.startMin,
      endMin: b.endMin,
      kind: 'block',
      title: b.title,
      refId: b.id,
      courseId: b.courseId,
      color: b.color,
      locked: true,
      status: b.status,
    })
  }

  return out.sort((a, b) => a.startMin - b.startMin)
}

export function freeWindowsForDate(
  dateStr: string,
  courses: Course[],
  commitments: Commitment[],
  existingBlocks: PlanBlock[],
  profile: StudentProfile,
): Interval[] {
  let free: Interval[] = [{ startMin: 0, endMin: DAY_MIN }]
  const occ = occupiedForDate(dateStr, courses, commitments, existingBlocks, profile)
  for (const o of occ) free = subtractInterval(free, o)
  free = subtractInterval(free, { startMin: profile.quietHoursStart, endMin: DAY_MIN })
  if (profile.quietHoursEnd > 0) free = subtractInterval(free, { startMin: 0, endMin: profile.quietHoursEnd })
  return free.filter((f) => f.endMin - f.startMin >= 10)
}

function freeMinutesInWindow(dateStr: string, from: string, to: string, courses: Course[], commitments: Commitment[], blocks: PlanBlock[], profile: StudentProfile): number {
  let total = 0
  let d = dateStr
  while (d <= to) {
    if (d >= from) {
      const windows = freeWindowsForDate(d, courses, commitments, blocks, profile)
      total += windows.reduce((s, w) => s + (w.endMin - w.startMin), 0)
    }
    d = addDays(d, 1)
  }
  return total
}

export function remainingP80(t: CatalystTask): number {
  if (t.status === 'completed' || t.status === 'waived') return 0
  const done = t.actualMinutes ?? 0
  return Math.max(0, t.p80Minutes - done)
}
export function remainingP50(t: CatalystTask): number {
  if (t.status === 'completed' || t.status === 'waived') return 0
  const done = t.actualMinutes ?? 0
  return Math.max(0, t.p50Minutes - done)
}

export function computeCoverage(state: CatalystState, fromDate?: string, horizonDays = 14): CoverageWindow {
  const from = fromDate ?? toDateStr(new Date(state.now))
  const to = addDays(from, horizonDays)
  const demand = state.tasks
    .filter((t) => t.status !== 'completed' && t.status !== 'waived' && t.dueAt.slice(0, 10) <= to)
    .reduce((s, t) => s + remainingP80(t), 0)
  const available = freeMinutesInWindow(from, from, to, state.courses, state.commitments, state.blocks, state.profile)
  const ratio = demand === 0 ? 99 : available / demand
  const status: CoverageWindow['status'] = ratio >= COVERAGE_THRESHOLDS.green ? 'green' : ratio >= COVERAGE_THRESHOLDS.amber ? 'amber' : 'red'
  return { status, ratio, availableMinutes: available, demandMinutes: demand }
}

interface WorkItem {
  id: string
  taskId: string
  wbsId?: string
  courseId: string
  title: string
  dueAt: string
  earliestStart?: string
  remainingMin: number
  minSession: number
  maxSession: number
  difficulty: number
  gradeWeightPct: number
  dependsOn: string[]
  confidence: string
  type: string
}

function buildWorkItems(tasks: CatalystTask[]): WorkItem[] {
  const items: WorkItem[] = []
  for (const t of tasks) {
    if (t.status === 'completed' || t.status === 'waived') continue
    if (t.wbs && t.wbs.length > 0) {
      const stages = [...t.wbs].sort((a, b) => a.order - b.order)
      let priorIncomplete = false
      for (const s of stages) {
        if (s.status === 'completed') continue
        items.push({
          id: `${t.id}::${s.id}`,
          taskId: t.id,
          wbsId: s.id,
          courseId: t.courseId,
          title: `${t.title} — ${s.title}`,
          dueAt: s.dueBy ? `${s.dueBy}T23:59:00` : t.dueAt,
          earliestStart: t.earliestStart,
          remainingMin: s.p80Minutes,
          minSession: Math.min(t.minSessionMin, s.p80Minutes),
          maxSession: t.maxSessionMin,
          difficulty: t.difficulty,
          gradeWeightPct: t.gradeWeightPct ?? 0,
          dependsOn: priorIncomplete ? [t.id + '::__prior_stage__'] : t.dependsOn,
          confidence: t.confidence,
          type: t.type,
        })
        priorIncomplete = true
      }
    } else {
      const remaining = remainingP80(t)
      if (remaining <= 0) continue
      items.push({
        id: t.id,
        taskId: t.id,
        courseId: t.courseId,
        title: t.title,
        dueAt: t.dueAt,
        earliestStart: t.earliestStart,
        remainingMin: remaining,
        minSession: t.minSessionMin,
        maxSession: t.maxSessionMin,
        difficulty: t.difficulty,
        gradeWeightPct: t.gradeWeightPct ?? 0,
        dependsOn: t.dependsOn,
        confidence: t.confidence,
        type: t.type,
      })
    }
  }
  return items
}

function priorityOf(item: WorkItem, from: string): number {
  const daysUntil = Math.max(0.25, (parseDateStr(item.dueAt.slice(0, 10)).getTime() - parseDateStr(from).getTime()) / 86400000)
  const urgency = item.remainingMin / (daysUntil * 480) // vs ~8 productive hrs/day
  const impact = item.gradeWeightPct / 30
  return urgency * 0.65 + impact * 0.35
}

function energyAt(profile: StudentProfile, hour: number): number {
  return profile.energyByHour[hour] ?? 3
}

function bestSlotForDifficulty(windows: Interval[], profile: StudentProfile, difficulty: number, need: number): Interval | null {
  let best: Interval | null = null
  let bestFit = -Infinity
  for (const w of windows) {
    const len = w.endMin - w.startMin
    if (len < Math.min(need, 15)) continue
    const midHour = Math.floor((w.startMin + Math.min(need, len) / 2) / 60)
    const energy = energyAt(profile, midHour)
    const fit = -Math.abs(difficulty - energy) - Math.abs(len - need) / 240
    if (fit > bestFit) {
      bestFit = fit
      best = w
    }
  }
  return best
}

export function scheduleAll(state: CatalystState): { blocks: PlanBlock[]; unscheduledMin: Record<string, number> } {
  const from = toDateStr(new Date(state.now))
  const to = addDays(from, HORIZON_DAYS)

  const preserved = state.blocks.filter((b) => {
    if (b.kind === 'meeting' || b.kind === 'commitment') return false
    if (b.date < from) return true
    if (b.locked && b.status === 'planned') return true
    if (b.date === from) return b.status === 'completed' || b.status === 'in_progress' || b.startMin < minutesNow(state)
    return b.status === 'completed' || b.status === 'in_progress'
  })

  const freeByDate = new Map<string, Interval[]>()
  let d = from
  while (d <= to) {
    freeByDate.set(d, freeWindowsForDate(d, state.courses, state.commitments, preserved, state.profile))
    d = addDays(d, 1)
  }
  // remove "now" -> midnight sliver from today if in the past relative to now, already handled by preserved blocks removal of overlap
  const nowMin = minutesNow(state)
  if (freeByDate.has(from)) {
    freeByDate.set(from, subtractInterval(freeByDate.get(from)!, { startMin: 0, endMin: nowMin }))
  }

  const items = buildWorkItems(state.tasks).filter((i) => (i.earliestStart ? i.earliestStart.slice(0, 10) <= to : true))
  const completedTaskIds = new Set(state.tasks.filter((t) => t.status === 'completed').map((t) => t.id))
  const doneStageIds = new Set<string>()
  for (const t of state.tasks) for (const s of t.wbs ?? []) if (s.status === 'completed') doneStageIds.add(`${t.id}::${s.id}`)

  const newBlocks: PlanBlock[] = []
  const unscheduledMin: Record<string, number> = {}
  const placedOrder = new Set<string>()

  const remainingItems = [...items]
  let guard = 0
  while (remainingItems.length > 0 && guard < items.length + 5) {
    guard++
    remainingItems.sort((a, b) => priorityOf(b, from) - priorityOf(a, from))
    const item = remainingItems.find((i) => {
      const blockedByStage = i.dependsOn.includes(i.taskId + '::__prior_stage__') && !placedItemStageDone(i, placedOrder, items)
      const blockedByTask = i.dependsOn.some((depId) => depId !== i.taskId + '::__prior_stage__' && !completedTaskIds.has(depId) && !placedOrder.has(depId))
      return !blockedByStage && !blockedByTask
    })
    if (!item) break
    remainingItems.splice(remainingItems.indexOf(item), 1)

    let remaining = item.remainingMin
    const startBound = item.earliestStart ? item.earliestStart.slice(0, 10) : from
    const dueDate = item.dueAt.slice(0, 10)
    let day = startBound > from ? startBound : from
    let placedAny = false
    while (remaining > 0 && day <= dueDate && day <= to) {
      const windows = freeByDate.get(day) ?? []
      const sessionTarget = Math.min(item.maxSession, remaining)
      const slot = bestSlotForDifficulty(windows, state.profile, item.difficulty, sessionTarget)
      if (slot) {
        const len = Math.min(sessionTarget, slot.endMin - slot.startMin)
        if (len >= Math.min(item.minSession, remaining)) {
          const block: PlanBlock = {
            id: `pb-${item.id}-${day}-${slot.startMin}`,
            date: day,
            startMin: slot.startMin,
            endMin: slot.startMin + len,
            kind: item.wbsId ? 'wbs' : 'task',
            refId: item.wbsId ?? item.taskId,
            courseId: item.courseId,
            title: item.title,
            status: 'planned',
            explanation: '',
            reasons: [],
            locked: false,
            color: state.courses.find((c) => c.id === item.courseId)?.color ?? '#6d5bf6',
          }
          newBlocks.push(block)
          remaining -= len
          placedAny = true
          const updated = subtractInterval(windows, { startMin: slot.startMin, endMin: slot.startMin + len })
          freeByDate.set(day, updated)
        }
      }
      day = addDays(day, 1)
    }
    if (placedAny) placedOrder.add(item.id)
    if (remaining > 0) unscheduledMin[item.taskId] = (unscheduledMin[item.taskId] ?? 0) + remaining
  }

  return { blocks: [...preserved, ...newBlocks], unscheduledMin }
}

function placedItemStageDone(item: WorkItem, placedOrder: Set<string>, allItems: WorkItem[]): boolean {
  const idx = allItems.findIndex((i) => i.id === item.id)
  const priorItems = allItems.filter((i) => i.taskId === item.taskId && i.wbsId && allItems.indexOf(i) < idx)
  return priorItems.every((p) => placedOrder.has(p.id))
}

export function minutesNow(state: CatalystState): number {
  const n = new Date(state.now)
  return n.getHours() * 60 + n.getMinutes()
}

export function attachMeetingAndCommitmentBlocks(state: CatalystState, dates: string[]): PlanBlock[] {
  const out: PlanBlock[] = []
  for (const date of dates) {
    const occ = occupiedForDate(date, state.courses, state.commitments, [], state.profile)
    for (const o of occ) {
      if (o.kind === 'block') continue
      out.push({
        id: `fx-${o.refId}-${date}`,
        date,
        startMin: o.startMin,
        endMin: o.endMin,
        kind: o.kind === 'meeting' ? 'meeting' : 'commitment',
        refId: o.refId,
        courseId: o.courseId,
        title: o.title,
        status: 'planned',
        explanation: o.kind === 'meeting' ? 'Fixed class meeting.' : 'Protected personal time.',
        reasons: [],
        locked: o.locked,
        color: o.color,
      })
    }
  }
  return out
}

// ---------- Next-best-action scoring (FDD 6.4) ----------

export interface ScoredAction {
  taskId: string
  wbsId?: string
  title: string
  courseId: string
  score: number
  reasons: string[]
  durationMin: number
  dueAt: string
  confidence: string
  block?: PlanBlock
}

export function scoreTask(
  state: CatalystState,
  task: CatalystTask,
  opts: { block?: PlanBlock; lastCourseId?: string } = {},
): ScoredAction {
  const now = new Date(state.now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const today = toDateStr(now)
  const rem = remainingP80(task)
  const dueDate = task.dueAt.slice(0, 10)
  const daysUntil = Math.max(0.1, (parseDateStr(dueDate).getTime() - parseDateStr(today).getTime()) / 86400000 + (task.dueAt.slice(11, 16) ? (1440 - nowMin) / 1440 : 0))
  const earliestFrom = task.earliestStart && task.earliestStart.slice(0, 10) > today ? task.earliestStart.slice(0, 10) : today
  const availableUntilDue = freeMinutesInWindow(earliestFrom, earliestFrom, dueDate, state.courses, state.commitments, state.blocks, state.profile)
  const slack = rem > 0 ? availableUntilDue / rem : 3
  const deadlineRisk = clamp(1.6 - slack, 0, 1)

  const course = state.courses.find((c) => c.id === task.courseId)
  const maxWeight = Math.max(...state.tasks.filter((t) => t.courseId === task.courseId).map((t) => t.gradeWeightPct ?? 0), 1)
  const gradeImpact = clamp((task.gradeWeightPct ?? 0) / Math.max(maxWeight, 20), 0, 1)

  const dependents = state.tasks.filter((t) => t.dependsOn.includes(task.id)).length
  const dependencyUnlock = clamp(dependents / 2, 0, 1)

  const energy = energyAt(state.profile, now.getHours())
  const energyFit = 1 - Math.abs(task.difficulty - energy) / 4

  let contextFit = 0.4
  if (opts.block) {
    const inWindow = opts.block.date === today && opts.block.startMin <= nowMin + 20 && opts.block.endMin > nowMin
    contextFit = inWindow ? 1 : opts.block.date === today ? 0.7 : 0.5
  }

  const preference = task.confidence === 'high' ? 0.7 : 0.55
  const momentum = task.status === 'in_progress' ? 1 : 0

  let penalty = 0
  if (opts.lastCourseId && opts.lastCourseId !== task.courseId) penalty += 0.05
  if (task.confidence === 'low') penalty += 0.05
  penalty += Math.min(task.deferralCount * 0.04, 0.15)

  const weighted = {
    deadlineRisk: deadlineRisk * 0.25,
    gradeImpact: gradeImpact * 0.2,
    dependencyUnlock: dependencyUnlock * 0.15,
    energyFit: energyFit * 0.15,
    contextFit: contextFit * 0.1,
    preference: preference * 0.1,
    momentum: momentum * 0.05,
  }
  const score = clamp(Object.values(weighted).reduce((a, b) => a + b, 0) - penalty, 0, 1)

  const reasonEntries: { key: string; val: number; text: string }[] = [
    {
      key: 'deadline',
      val: weighted.deadlineRisk,
      text: `Due ${daysUntil < 1 ? 'today' : `in ${Math.round(daysUntil)} day${Math.round(daysUntil) === 1 ? '' : 's'}`} with only ${durationLabel(Math.max(0, Math.round(availableUntilDue - rem)))} of cushion`,
    },
    { key: 'grade', val: weighted.gradeImpact, text: `Worth ${task.gradeWeightPct ?? 0}% of ${course?.code ?? 'the course'} grade` },
    { key: 'dependency', val: weighted.dependencyUnlock, text: `Unlocks ${dependents} downstream task${dependents === 1 ? '' : 's'}` },
    { key: 'energy', val: weighted.energyFit, text: energyFit > 0.7 ? 'Matches your strongest focus window' : 'Fits your current energy level' },
    { key: 'momentum', val: weighted.momentum, text: 'Continuing work already in progress' },
  ]
  const reasons = reasonEntries
    .filter((r) => r.val > 0.03)
    .sort((a, b) => b.val - a.val)
    .slice(0, 3)
    .map((r) => r.text)
  if (reasons.length === 0) reasons.push('Best use of your current open time.')

  const durationMin = opts.block ? opts.block.endMin - opts.block.startMin : Math.min(task.maxSessionMin, Math.max(task.minSessionMin, remainingP50(task)))
  const stage = opts.block?.kind === 'wbs' ? task.wbs?.find((s) => s.id === opts.block!.refId) : undefined
  const title = stage ? `${task.title} — ${stage.title}` : task.title

  return {
    taskId: task.id,
    title,
    courseId: task.courseId,
    score,
    reasons,
    durationMin,
    dueAt: task.dueAt,
    confidence: task.confidence,
    block: opts.block,
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function nextBestAction(state: CatalystState): ScoredAction | null {
  const today = toDateStr(new Date(state.now))
  const actionable = state.tasks.filter((t) => {
    if (t.status === 'completed' || t.status === 'waived') return false
    const depsMet = t.dependsOn.every((id) => state.tasks.find((x) => x.id === id)?.status === 'completed')
    return depsMet
  })
  if (actionable.length === 0) return null

  const scored = actionable.map((t) => {
    const block = state.blocks.find(
      (b) => b.kind === 'task' && b.refId === t.id && b.date === today && b.status === 'planned',
    ) ?? state.blocks.find((b) => b.kind === 'wbs' && t.wbs?.some((s) => s.id === b.refId) && b.date === today && b.status === 'planned')
    return scoreTask(state, t, { block })
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0] ?? null
}

// ---------- Explanations for placed blocks ----------

export function explainBlock(state: CatalystState, block: PlanBlock): { explanation: string; reasons: string[] } {
  const task = state.tasks.find((t) => t.id === block.refId || t.wbs?.some((s) => s.id === block.refId))
  if (!task) return { explanation: 'Protected personal time.', reasons: [] }
  const scored = scoreTask(state, task, { block })
  const reasonText = scored.reasons.slice(0, 2).join('. ')
  return { explanation: `${reasonText}.`, reasons: scored.reasons }
}

// ---------- Insights: forecast, calibration ----------

export function weekForecast(state: CatalystState, weekStart: string): DayForecast[] {
  const out: DayForecast[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i)
    const dayBlocks = state.blocks.filter((b) => b.date === date)
    let academicMin = 0
    let workMin = 0
    let recoveryMin = 0
    for (const b of dayBlocks) {
      const dur = b.endMin - b.startMin
      if (b.kind === 'task' || b.kind === 'wbs' || b.kind === 'meeting') academicMin += dur
      else {
        const cm = state.commitments.find((c) => c.id === b.refId)
        if (cm?.category === 'work') workMin += dur
        else recoveryMin += dur
      }
    }
    const free = freeWindowsForDate(date, state.courses, state.commitments, state.blocks, state.profile).reduce((s, w) => s + (w.endMin - w.startMin), 0)
    out.push({ date, academicMin, workMin, recoveryMin, unallocatedMin: Math.max(0, free) })
  }
  return out
}

export function calibrationError(state: CatalystState): number {
  const done = state.tasks.filter((t) => t.status === 'completed' && t.actualMinutes != null)
  if (done.length === 0) return 0
  const errs = done.map((t) => Math.abs((t.actualMinutes! - t.p50Minutes) / Math.max(t.p50Minutes, 1)))
  return errs.reduce((a, b) => a + b, 0) / errs.length
}

export { minToLabel }
