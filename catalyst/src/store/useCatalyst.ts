import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  CatalystState,
  CatalystTask,
  ChangeLogEntry,
  Commitment,
  CoachMessage,
  Course,
  PlanBlock,
  StudentProfile,
} from '../lib/types'
import { buildFullPlan, diffSummary } from '../lib/replan'
import { computeCoverage, nextBestAction, scoreTask } from '../lib/engine'
import { coachRespond, type PendingCoachAction } from '../lib/coach'
import { extractSyllabus, makeWbs, detectCourseHeader } from '../lib/extract'
import { buildDemoImport } from '../lib/seed'
import { runWhatIf, type WhatIfMutation } from '../lib/whatif'
import type { WhatIfResult } from '../lib/types'
import { DEFAULT_COMMITMENTS, DEFAULT_CONNECTORS, DEMO_NOW, DEMO_PROFILE, DEMO_SEMESTER } from '../data/demoProfile'
import { addDays, formatDayLabel, toDateStr } from '../lib/dates'

function blankState(): CatalystState {
  return {
    onboarded: false,
    profile: DEMO_PROFILE,
    semester: DEMO_SEMESTER,
    connectors: DEFAULT_CONNECTORS.map((c) => ({ ...c })),
    courses: [],
    tasks: [],
    commitments: DEFAULT_COMMITMENTS.map((c) => ({ ...c })),
    blocks: [],
    progressEvents: [],
    changeLog: [],
    coachHistory: [],
    pendingImport: null,
    planApproved: false,
    lastPlannedAt: null,
    now: DEMO_NOW,
  }
}

interface UIState {
  todayOverrideTaskId: string | null
  coachPending: PendingCoachAction | null
}

interface Actions {
  loadDemoImport: () => void
  startManualImport: () => void
  addSyllabusCourse: (input: { code: string; name: string; instructor?: string; text: string }) => { added: number }
  updateDraftTask: (taskId: string, patch: Partial<CatalystTask>) => void
  removeDraftTask: (taskId: string) => void
  confirmImport: () => void
  connectConnector: (id: string) => void
  setProfile: (patch: Partial<StudentProfile>) => void
  setCommitments: (list: Commitment[]) => void
  updateCommitment: (id: string, patch: Partial<Commitment>) => void
  buildPreviewPlan: () => void
  approvePlan: () => void
  startBlock: (blockId: string) => void
  startAdHoc: (taskId: string, durationMin: number, wbsId?: string) => string
  attachWbs: (taskId: string) => void
  toggleStageComplete: (taskId: string, stageId: string) => void
  completeBlock: (blockId: string, result: 'completed' | 'partial' | 'blocked', actualMinutes: number, energy?: 1 | 2 | 3 | 4 | 5) => void
  deferBlock: (blockId: string) => void
  cannotDo: (blockId: string, reason: string) => void
  replaceToday: () => void
  toggleBlockLock: (blockId: string) => void
  clearOverride: () => void
  replan: (reason: string) => void
  previewWhatIf: (blockId: string, mutation: 'skip' | 'shorten' | 'move', params?: { doneMinutes?: number; toDate?: string; toStartMin?: number }) => WhatIfResult | null
  applyWhatIfAlternative: (blockId: string, alternativeId: string) => void
  sendCoachMessage: (text: string) => void
  confirmCoachPending: () => void
  dismissCoachPending: () => void
  advanceTime: (minutes: number) => void
  jumpToNextMorning: () => void
  resetSimClock: () => void
  toggleConnector: (id: string) => void
  exportData: () => string
  resetAll: () => void
}

export type CatalystStore = CatalystState & UIState & Actions

function pushChangeLog(state: CatalystState, summary: string, detail: string, requiresConsent = false): ChangeLogEntry[] {
  const entry: ChangeLogEntry = {
    id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: state.now,
    summary,
    detail,
    requiresConsent,
    accepted: true,
  }
  return [entry, ...state.changeLog].slice(0, 50)
}

export const useCatalyst = create<CatalystStore>()(
  persist(
    (set, get) => ({
      ...blankState(),
      todayOverrideTaskId: null,
      coachPending: null,

      loadDemoImport: () => {
        const { courses, tasks } = buildDemoImport()
        set((s) => ({
          pendingImport: { courses, tasks },
          connectors: s.connectors.map((c) => (c.id === 'canvas' ? { ...c, status: 'connected', lastSync: s.now } : c)),
        }))
      },

      startManualImport: () => {
        set({ pendingImport: { courses: [], tasks: [] } })
      },

      addSyllabusCourse: ({ code, name, instructor, text }) => {
        const state = get()
        const id = `c-${(code || name || 'course').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`
        const palette = ['#6d5bf6', '#2563eb', '#0891b2', '#d946ef', '#dc2626', '#16a34a', '#ea580c']
        const idx = (state.pendingImport?.courses.length ?? 0) + state.courses.length
        const course: Course = {
          id,
          code: code || detectCourseHeader(text).code || 'COURSE',
          name: name || detectCourseHeader(text).name || 'Untitled course',
          instructor,
          color: palette[idx % palette.length],
          meetings: [],
        }
        const { drafts } = extractSyllabus(text, id, state.semester.startDate, id)
        const tasks = drafts.map((d) => d.task)
        set((s) => ({
          pendingImport: {
            courses: [...(s.pendingImport?.courses ?? []), course],
            tasks: [...(s.pendingImport?.tasks ?? []), ...tasks],
          },
        }))
        return { added: tasks.length }
      },

      updateDraftTask: (taskId, patch) => {
        set((s) => ({
          pendingImport: s.pendingImport
            ? { ...s.pendingImport, tasks: s.pendingImport.tasks.map((t) => (t.id === taskId ? { ...t, ...patch, confidence: 'high' } : t)) }
            : s.pendingImport,
        }))
      },

      removeDraftTask: (taskId) => {
        set((s) => ({
          pendingImport: s.pendingImport ? { ...s.pendingImport, tasks: s.pendingImport.tasks.filter((t) => t.id !== taskId) } : s.pendingImport,
        }))
      },

      confirmImport: () => {
        set((s) => {
          if (!s.pendingImport) return s
          return {
            courses: [...s.courses, ...s.pendingImport.courses],
            tasks: [...s.tasks, ...s.pendingImport.tasks],
            pendingImport: null,
          }
        })
      },

      connectConnector: (id) => {
        set((s) => ({ connectors: s.connectors.map((c) => (c.id === id ? { ...c, status: 'connected', lastSync: s.now } : c)) }))
      },

      toggleConnector: (id) => {
        set((s) => ({
          connectors: s.connectors.map((c) => (c.id === id ? { ...c, status: c.status === 'connected' ? 'available' : 'connected', lastSync: s.now } : c)),
        }))
      },

      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),

      setCommitments: (list) => set({ commitments: list }),

      updateCommitment: (id, patch) => set((s) => ({ commitments: s.commitments.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),

      buildPreviewPlan: () => {
        set((s) => ({ blocks: buildFullPlan(s) }))
      },

      approvePlan: () => {
        set((s) => ({
          onboarded: true,
          planApproved: true,
          lastPlannedAt: s.now,
          blocks: buildFullPlan(s),
          changeLog: pushChangeLog(s, 'Initial plan created', `${s.courses.length} courses, ${s.tasks.length} tasks imported.`),
        }))
      },

      startBlock: (blockId) => {
        set((s) => ({
          blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, status: 'in_progress' } : b)),
          tasks: s.tasks.map((t) => (matchesBlockRef(s.blocks.find((b) => b.id === blockId), t) ? { ...t, status: 'in_progress' } : t)),
        }))
      },

      startAdHoc: (taskId, durationMin, wbsId) => {
        const s = get()
        const task = s.tasks.find((t) => t.id === taskId)
        if (!task) return ''
        const stage = wbsId ? task.wbs?.find((st) => st.id === wbsId) : undefined
        const now = new Date(s.now)
        const startMin = now.getHours() * 60 + now.getMinutes()
        const course = s.courses.find((c) => c.id === task.courseId)
        const block: PlanBlock = {
          id: `pb-adhoc-${Date.now()}`,
          date: toDateStr(now),
          startMin,
          endMin: startMin + durationMin,
          kind: stage ? 'wbs' : 'task',
          refId: stage ? stage.id : task.id,
          courseId: task.courseId,
          title: stage ? `${task.title} — ${stage.title}` : task.title,
          status: 'planned',
          explanation: 'Started now.',
          reasons: [],
          locked: false,
          color: course?.color ?? '#6d5bf6',
        }
        set({ blocks: [...s.blocks, block] })
        return block.id
      },

      attachWbs: (taskId) => {
        const s = get()
        const task = s.tasks.find((t) => t.id === taskId)
        if (!task || task.wbs) return
        const wbs = makeWbs(task.id, task.p80Minutes, task.dueAt)
        set({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, wbs } : t)) })
        get().replan(`Broke down: ${task.title}`)
      },

      toggleStageComplete: (taskId, stageId) => {
        const s = get()
        const task = s.tasks.find((t) => t.id === taskId)
        if (!task?.wbs) return
        const wbs = task.wbs.map((st) =>
          st.id === stageId ? { ...st, status: (st.status === 'completed' ? 'not_started' : 'completed') as CatalystTask['status'] } : st,
        )
        const allDone = wbs.every((st) => st.status === 'completed')
        set({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, wbs, status: allDone ? 'completed' : t.status === 'completed' ? 'in_progress' : t.status } : t)) })
        get().replan(`Updated stages: ${task.title}`)
      },

      completeBlock: (blockId, result, actualMinutes, energy) => {
        const s = get()
        const block = s.blocks.find((b) => b.id === blockId)
        if (!block) return
        const task = s.tasks.find((t) => t.id === block.refId || t.wbs?.some((st) => st.id === block.refId))
        let tasks = s.tasks
        if (task) {
          tasks = s.tasks.map((t) => {
            if (t.id !== task.id) return t
            const nextActual = (t.actualMinutes ?? 0) + actualMinutes
            let wbs = t.wbs
            if (wbs && task.wbs?.some((st) => st.id === block.refId)) {
              wbs = wbs.map((st) => (st.id === block.refId ? { ...st, status: result === 'completed' ? 'completed' : st.status } : st))
            }
            const allStagesDone = wbs ? wbs.every((st) => st.status === 'completed') : true
            const enoughEffort = nextActual >= t.p50Minutes * 0.6
            const status: CatalystTask['status'] =
              result === 'blocked'
                ? 'blocked'
                : result === 'completed' && allStagesDone && enoughEffort
                  ? 'completed'
                  : t.status === 'not_started'
                    ? 'in_progress'
                    : t.status
            return { ...t, actualMinutes: nextActual, wbs, status }
          })
        }
        const blocks = s.blocks.map((b) => (b.id === blockId ? { ...b, status: (result === 'blocked' ? 'skipped' : 'completed') as PlanBlock['status'] } : b))
        const progressEvents = [
          ...s.progressEvents,
          { id: `pe-${Date.now()}`, blockId, taskId: task?.id, actualMinutes, result, energy, notedAt: s.now },
        ]
        set({ tasks, blocks })
        get().replan(result === 'completed' ? `Completed: ${block.title}` : result === 'partial' ? `Partial progress: ${block.title}` : `Blocked: ${block.title}`)
        set({ progressEvents })
      },

      deferBlock: (blockId) => {
        const s = get()
        const block = s.blocks.find((b) => b.id === blockId)
        if (!block) return
        const tasks = s.tasks.map((t) => (t.id === block.refId ? { ...t, deferralCount: t.deferralCount + 1 } : t))
        const blocks = s.blocks.map((b) => (b.id === blockId ? { ...b, status: 'skipped' as const } : b))
        set({ tasks, blocks })
        get().replan(`Deferred: ${block.title}`)
      },

      cannotDo: (blockId, reason) => {
        const s = get()
        const block = s.blocks.find((b) => b.id === blockId)
        if (!block) return
        const tasks = s.tasks.map((t) => (t.id === block.refId ? { ...t, status: 'blocked' as const, notes: reason } : t))
        const blocks = s.blocks.map((b) => (b.id === blockId ? { ...b, status: 'skipped' as const } : b))
        set({ tasks, blocks })
        get().replan(`Marked blocked: ${block.title}`)
      },

      replaceToday: () => {
        const s = get()
        const current = nextBestAction(s)
        const alt = s.tasks
          .filter((t) => t.status !== 'completed' && t.status !== 'waived' && t.id !== current?.taskId)
          .filter((t) => t.dependsOn.every((id) => s.tasks.find((x) => x.id === id)?.status === 'completed'))
          .map((t) => scoreTask(s, t, {}))
          .sort((a, b) => b.score - a.score)[0]
        set({ todayOverrideTaskId: alt ? alt.taskId : null })
      },

      clearOverride: () => set({ todayOverrideTaskId: null }),

      toggleBlockLock: (blockId) => {
        set((s) => ({ blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, locked: !b.locked } : b)) }))
      },

      replan: (reason) => {
        const s = get()
        const before = s.blocks
        const after = buildFullPlan(s)
        const diff = diffSummary(before, after)
        set({
          blocks: after,
          lastPlannedAt: s.now,
          changeLog: diff.movedOrAdded + diff.removed > 0 ? pushChangeLog(s, reason, `${diff.movedOrAdded} block(s) updated, ${diff.removed} removed.`) : s.changeLog,
          todayOverrideTaskId: null,
        })
      },

      previewWhatIf: (blockId, mutation, params = {}) => {
        const s = get()
        const block = s.blocks.find((b) => b.id === blockId)
        if (!block) return null
        let m: WhatIfMutation
        if (mutation === 'skip') m = { type: 'skip', block }
        else if (mutation === 'shorten') m = { type: 'shorten', block, doneMinutes: params.doneMinutes ?? Math.round((block.endMin - block.startMin) * 0.5) }
        else m = { type: 'move', block, toDate: params.toDate ?? addDays(block.date, 2), toStartMin: params.toStartMin ?? block.startMin }
        return runWhatIf(s, m, buildFullPlan)
      },

      applyWhatIfAlternative: (blockId, alternativeId) => {
        const s = get()
        const block = s.blocks.find((b) => b.id === blockId)
        if (!block) return
        if (alternativeId === 'accept') {
          get().deferBlock(blockId)
          return
        }
        if (alternativeId === 'move') {
          const task = s.tasks.find((t) => t.id === block.refId || t.wbs?.some((st) => st.id === block.refId))
          if (!task) return
          const toDate = addDays(block.date, 2)
          const tasks = s.tasks.map((t) => (t.id === task.id ? { ...t, earliestStart: `${toDate}T00:00:00` } : t))
          const blocks = s.blocks.map((b) => (b.id === blockId ? { ...b, status: 'skipped' as const } : b))
          set({ tasks, blocks })
          get().replan(`Moved: ${block.title}`)
          return
        }
        if (alternativeId === 'shorten') {
          get().startBlock(blockId)
        }
      },

      sendCoachMessage: (text) => {
        const s = get()
        const userMsg: CoachMessage = { id: `cm-${Date.now()}`, role: 'user', text, createdAt: s.now }
        const resp = coachRespond(s, text)
        const catalystMsg: CoachMessage = {
          id: `cm-${Date.now() + 1}`,
          role: 'catalyst',
          text: resp.text,
          citations: resp.citations,
          createdAt: s.now,
          preview: resp.pending ? { summary: resp.pending.label, changes: [] } : undefined,
        }
        set({ coachHistory: [...s.coachHistory, userMsg, catalystMsg], coachPending: resp.pending ?? null })
      },

      confirmCoachPending: () => {
        const s = get()
        const pending = s.coachPending
        if (!pending) return
        let detail = ''
        if (pending.kind === 'day_off') {
          const commitments = [
            ...s.commitments,
            {
              id: `wi-dayoff-${pending.date}`,
              title: 'Day off (Coach)',
              kind: 'fixed' as const,
              category: 'other' as const,
              daysOfWeek: [],
              startMin: 8 * 60,
              endMin: 22 * 60,
              oneOffDate: pending.date,
            },
          ]
          set({ commitments })
          detail = `Kept ${formatDayLabel(pending.date)} free and rebuilt the plan around it.`
        } else if (pending.kind === 'rebalance') {
          const block = s.blocks.find((b) => b.id === pending.blockId)
          const task = block && s.tasks.find((t) => t.id === block.refId)
          if (task) {
            const tasks = s.tasks.map((t) => (t.id === task.id ? { ...t, earliestStart: `${pending.toDate}T00:00:00` } : t))
            const blocks = s.blocks.map((b) => (b.id === pending.blockId ? { ...b, status: 'skipped' as const } : b))
            set({ tasks, blocks })
          }
          detail = `Moved that block to ${formatDayLabel(pending.toDate)}.`
        } else if (pending.kind === 'breakdown') {
          const task = s.tasks.find((t) => t.id === pending.taskId)
          if (task) {
            const wbs = makeWbs(task.id, task.p80Minutes, task.dueAt)
            const tasks = s.tasks.map((t) => (t.id === task.id ? { ...t, wbs } : t))
            set({ tasks })
          }
          detail = 'Broke the assignment into stages.'
        }
        const confirmMsg: CoachMessage = { id: `cm-${Date.now()}`, role: 'catalyst', text: `Done. ${detail}`, createdAt: s.now }
        set({ coachHistory: [...get().coachHistory, confirmMsg], coachPending: null })
        get().replan(`Coach: ${pending.label}`)
      },

      dismissCoachPending: () => set({ coachPending: null }),

      advanceTime: (minutes) => {
        const s = get()
        const prevDate = toDateStr(new Date(s.now))
        const next = new Date(new Date(s.now).getTime() + minutes * 60000).toISOString()
        const nextDate = toDateStr(new Date(next))
        let blocks = s.blocks
        let tasks = s.tasks
        if (nextDate !== prevDate) {
          const missed = s.blocks.filter((b) => b.date < nextDate && b.status === 'planned' && (b.kind === 'task' || b.kind === 'wbs'))
          if (missed.length > 0) {
            const missedTaskIds = new Set(missed.map((b) => b.refId))
            blocks = s.blocks.map((b) => (missed.includes(b) ? { ...b, status: 'skipped' as const } : b))
            tasks = s.tasks.map((t) => (missedTaskIds.has(t.id) ? { ...t, deferralCount: t.deferralCount + 1 } : t))
          }
        }
        set({ now: next, blocks, tasks, todayOverrideTaskId: null })
        get().replan('Time advanced')
      },

      jumpToNextMorning: () => {
        const s = get()
        const cur = new Date(s.now)
        const next = new Date(cur)
        next.setDate(next.getDate() + 1)
        next.setHours(7, 30, 0, 0)
        get().advanceTime(Math.round((next.getTime() - cur.getTime()) / 60000))
      },

      resetSimClock: () => set({ now: DEMO_NOW }),

      exportData: () => {
        const s = get()
        const { todayOverrideTaskId, coachPending, ...data } = s
        void todayOverrideTaskId
        void coachPending
        return JSON.stringify(data, null, 2)
      },

      resetAll: () => {
        set({ ...blankState(), todayOverrideTaskId: null, coachPending: null })
      },
    }),
    {
      name: 'catalyst-state-v1',
      partialize: (s) => {
        const { todayOverrideTaskId, coachPending, ...rest } = s
        void todayOverrideTaskId
        void coachPending
        return rest
      },
    },
  ),
)

function matchesBlockRef(block: PlanBlock | undefined, task: CatalystTask): boolean {
  if (!block) return false
  return task.id === block.refId || !!task.wbs?.some((s) => s.id === block.refId)
}

export function useCoverage(horizonDays = 14) {
  return useCatalyst((s) => computeCoverage(s, undefined, horizonDays))
}
