// Rule-based, grounded Coach. Per FDD 5.14 the Coach is an interface to the
// student's structured plan data, not an unrestricted chatbot: intents are
// classified with keyword rules, answers are generated from real state, and
// every plan-changing intent produces a structured preview requiring confirm.

import type { CatalystState } from './types'
import { nextBestAction, scoreTask, computeCoverage } from './engine'
import { weekForecast } from './engine'
import { addDays, durationLabel, formatDayLabel, startOfWeek, toDateStr, weekdayShort } from './dates'
import { TASK_TYPE_LABEL } from './constants'

export type PendingCoachAction =
  | { kind: 'day_off'; date: string; label: string }
  | { kind: 'rebalance'; blockId: string; fromDate: string; toDate: string; label: string }
  | { kind: 'breakdown'; taskId: string; label: string }

export interface CoachResponse {
  text: string
  citations?: string[]
  pending?: PendingCoachAction
}

const UNSUPPORTED_RE = /\b(write|answer|solve|do my|complete my|finish my|take (the|my) (quiz|exam|test)|submit)\b.*\b(essay|paper|quiz|exam|test|assignment|homework|questions?)\b|\b(write|solve|answer)\s+(this|the)\b/i

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1)
}

function classify(text: string): string {
  const t = text.toLowerCase()
  if (UNSUPPORTED_RE.test(t)) return 'unsupported'
  if (/\bwhy\b/.test(t)) return 'why_this_task'
  if (/\b(at risk|risk|behind|falling behind)\b/.test(t)) return 'whats_at_risk'
  if (/\b(day off|take.*off|free.*evening|keep.*free)\b/.test(t)) return 'day_off'
  if (/\b(rebalance|too much|overloaded|lighten|spread out)\b/.test(t)) return 'rebalance_week'
  if (/\b(break.*down|break.*into|smaller (steps|pieces)|wbs)\b/.test(t)) return 'breakdown'
  if (/\b(quiet hours|sleep|notification|protect)\b/.test(t)) return 'adjust_preferences'
  if (/\b(where|source|from canvas|from syllabus|confidence)\b/.test(t)) return 'locate_source'
  return 'unknown'
}

export function coachRespond(state: CatalystState, userText: string): CoachResponse {
  const intent = classify(userText)
  const today = toDateStr(new Date(state.now))

  switch (intent) {
    case 'unsupported':
      return {
        text: "I can help you plan, break down, or reschedule that work — but I won't write, answer, or submit graded content for you. Want help outlining or scheduling time for it instead?",
      }

    case 'why_this_task': {
      const action = nextBestAction(state)
      if (!action) return { text: "You don't have anything actionable scheduled right now — nice work staying ahead." }
      return {
        text: `${action.title} is recommended now because ${lowerFirst(action.reasons.join('; '))}.`,
        citations: action.reasons,
      }
    }

    case 'whats_at_risk': {
      const coverage = computeCoverage(state, today, 14)
      const forecast = weekForecast(state, startOfWeek(today))
      const riskyTasks = state.tasks
        .filter((t) => t.status !== 'completed' && t.status !== 'waived')
        .map((t) => ({ t, s: scoreTask(state, t, {}) }))
        .filter((x) => x.s.reasons.some((r) => r.toLowerCase().includes('cushion')))
        .sort((a, b) => b.s.score - a.s.score)
        .slice(0, 2)
      const peak = forecast.reduce((max, d) => (d.academicMin > max.academicMin ? d : max), forecast[0])
      const parts = [
        `Your 14-day coverage is ${coverage.status} (${Math.max(0, Math.round((coverage.ratio - 1) * 100))}% cushion).`,
        peak ? `${formatDayLabel(peak.date)} is your heaviest day with ${durationLabel(peak.academicMin)} of academic work.` : '',
      ]
      if (riskyTasks.length > 0) {
        parts.push(`Watch: ${riskyTasks.map((x) => x.t.title).join(', ')}.`)
      }
      return { text: parts.filter(Boolean).join(' ') }
    }

    case 'day_off': {
      const dayName = /\b(mon|tue|wed|thu|fri|sat|sun)\w*/i.exec(userText)?.[0]?.toLowerCase()
      const dowMap: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 }
      let targetDate = addDays(today, 1)
      if (dayName) {
        const dow = dowMap[dayName.slice(0, 3)]
        if (dow != null) {
          let d = today
          for (let i = 0; i < 8; i++) {
            if (new Date(d).getDay() === dow && d >= today) {
              targetDate = d
              break
            }
            d = addDays(d, 1)
          }
        }
      }
      return {
        text: `I found two ways to keep ${weekdayShort(targetDate)} free without touching your protected gym or sleep time. Want to see the options?`,
        pending: { kind: 'day_off', date: targetDate, label: `Keep ${formatDayLabel(targetDate)} free` },
      }
    }

    case 'rebalance_week': {
      const forecast = weekForecast(state, startOfWeek(today))
      const busiest = [...forecast].sort((a, b) => b.academicMin - a.academicMin)[0]
      const lightest = [...forecast].sort((a, b) => a.academicMin - b.academicMin)[0]
      const movable = state.blocks.find((b) => b.date === busiest.date && b.kind === 'task' && b.status === 'planned')
      if (!movable) return { text: "Your week already looks fairly balanced — I don't see a block I can safely move." }
      return {
        text: `${formatDayLabel(busiest.date)} carries the most academic work this week. I can move "${movable.title}" to ${formatDayLabel(lightest.date)} to even things out. Want me to?`,
        pending: { kind: 'rebalance', blockId: movable.id, fromDate: busiest.date, toDate: lightest.date, label: `Move to ${formatDayLabel(lightest.date)}` },
      }
    }

    case 'breakdown': {
      const candidate = state.tasks.find(
        (t) => t.status !== 'completed' && !t.wbs && (t.type === 'project' || t.type === 'paper') && userText.toLowerCase().includes(t.title.toLowerCase().split(' ')[0]),
      ) ?? state.tasks.find((t) => t.status !== 'completed' && !t.wbs && (t.type === 'project' || t.type === 'paper'))
      if (!candidate) return { text: "I don't see a large assignment that needs breaking down right now." }
      return {
        text: `${candidate.title} doesn't have stages yet. I can split it into research, outline, drafting, and revision steps so it's easier to start. Preview the breakdown?`,
        pending: { kind: 'breakdown', taskId: candidate.id, label: 'Break into stages' },
      }
    }

    case 'adjust_preferences':
      return { text: 'You can update quiet hours, protected time, and notification settings from the Settings tab — I keep every plan inside those boundaries automatically.' }

    case 'locate_source': {
      const action = nextBestAction(state)
      const task = action ? state.tasks.find((t) => t.id === action.taskId) : undefined
      if (!task) return { text: 'Ask me about a specific task and I can tell you where it came from.' }
      const sourceLabel = task.source === 'lms' ? 'your LMS' : task.source === 'syllabus' ? 'the syllabus you uploaded' : task.source === 'inferred' ? 'a pattern Catalyst inferred' : 'something you entered'
      return { text: `${task.title} (${TASK_TYPE_LABEL[task.type]}) came from ${sourceLabel}, with ${task.confidence} confidence.` }
    }

    default:
      return {
        text: "I can explain why something's recommended, tell you what's at risk this week, help you take time off, rebalance your week, or break a big assignment into steps. What would help?",
      }
  }
}
