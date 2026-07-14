// Heuristic syllabus text extraction. Produces a structured draft, never treated
// as an unreviewed source of truth (FDD 5.3) — low-confidence items are flagged
// for confirmation on the Import Review screen.

import type { CatalystTask, Confidence, TaskType, WbsStage } from './types'

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}

const DATE_RE = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i
const NUMERIC_DATE_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
const PCT_RE = /(\d{1,3})\s?%/
const PAGES_RE = /\bpp?\.?\s?(\d+)\s?[-–]\s?(\d+)/i
const HOURS_RE = /\b(\d{1,2})\s?[-–]\s?(\d{1,2})\s?hours?\b/i

type TypeRule = { re: RegExp; type: TaskType }
const TYPE_RULES: TypeRule[] = [
  { re: /\bmid[- ]?term\b/i, type: 'exam' },
  { re: /\bquiz\b/i, type: 'quiz' },
  { re: /\blab\b/i, type: 'lab' },
  { re: /\bpresent(ation)?\b/i, type: 'presentation' },
  { re: /\b(term paper|research paper|paper|essay)\b/i, type: 'paper' },
  { re: /\bproject\b/i, type: 'project' },
  { re: /\b(problem set|pset|homework|hw)\b/i, type: 'problem_set' },
  { re: /\bfinal exam\b/i, type: 'exam' },
  { re: /\bexam\b/i, type: 'exam' },
  { re: /\b(read(ing)?s?|chapter|ch\.)\b/i, type: 'reading' },
]
const SKIP_RE = /\b(no class|holiday|office hours|add\/drop|drop deadline|spring break|fall break|thanksgiving)\b/i

const EFFORT: Record<TaskType, { p50: number; p80: number; min: number; max: number; difficulty: 1 | 2 | 3 | 4 | 5 }> = {
  reading: { p50: 45, p80: 75, min: 20, max: 60, difficulty: 2 },
  problem_set: { p50: 90, p80: 150, min: 30, max: 90, difficulty: 3 },
  lab: { p50: 120, p80: 165, min: 60, max: 120, difficulty: 3 },
  quiz: { p50: 30, p80: 50, min: 20, max: 45, difficulty: 2 },
  exam: { p50: 300, p80: 420, min: 30, max: 90, difficulty: 5 },
  paper: { p50: 300, p80: 480, min: 30, max: 90, difficulty: 4 },
  project: { p50: 600, p80: 900, min: 30, max: 120, difficulty: 4 },
  presentation: { p50: 120, p80: 180, min: 30, max: 90, difficulty: 3 },
  admin: { p50: 20, p80: 30, min: 10, max: 30, difficulty: 1 },
  custom: { p50: 60, p80: 90, min: 20, max: 60, difficulty: 2 },
}

export interface ExtractedTaskDraft {
  task: CatalystTask
  confidenceNotes: string[]
}

export interface ExtractResult {
  drafts: ExtractedTaskDraft[]
  hiddenWorkNote: string | null
  stats: { linesScanned: number; datesFound: number }
}

function resolveYear(month: number, semesterStartISO: string): number {
  const start = new Date(semesterStartISO)
  const startYear = start.getFullYear()
  const startMonth = start.getMonth()
  return month < startMonth - 1 ? startYear + 1 : startYear
}

function cleanTitle(line: string): string {
  return line
    .replace(DATE_RE, ' ')
    .replace(NUMERIC_DATE_RE, ' ')
    .replace(TIME_RE, ' ')
    .replace(PCT_RE, ' ')
    .replace(HOURS_RE, ' ')
    .replace(/\bestimated\b/i, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/[-–:••]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^(due|due:|assignment|deadline)\s*/i, '')
    .replace(/\s+(due|assignment|deadline)$/i, '')
    .replace(/\s+$/, '')
    .slice(0, 90)
}

function classifyType(line: string): TaskType | null {
  for (const r of TYPE_RULES) if (r.re.test(line)) return r.type
  return null
}

export function makeWbs(taskId: string, p80: number, dueAt: string): WbsStage[] {
  const dueDate = dueAt.slice(0, 10)
  const pct = (f: number) => Math.round((p80 * f) / 5) * 5
  const stages: Omit<WbsStage, 'id'>[] = [
    { title: 'Research sources', p50Minutes: pct(0.22), p80Minutes: pct(0.22), status: 'not_started', order: 0 },
    { title: 'Create argument outline', p50Minutes: pct(0.12), p80Minutes: pct(0.12), status: 'not_started', order: 1 },
    { title: 'Draft sections', p50Minutes: pct(0.32), p80Minutes: pct(0.32), status: 'not_started', order: 2 },
    { title: 'Draft conclusion', p50Minutes: pct(0.12), p80Minutes: pct(0.12), status: 'not_started', order: 3 },
    { title: 'Revise + citations', p50Minutes: pct(0.22), p80Minutes: pct(0.22), status: 'not_started', order: 4 },
  ]
  return stages.map((s, i) => ({ ...s, id: `${taskId}-wbs-${i}`, dueBy: dueDate }))
}

export function extractSyllabus(text: string, courseId: string, semesterStartISO: string, idPrefix: string): ExtractResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const drafts: ExtractedTaskDraft[] = []
  let datesFound = 0
  let seq = 0
  let hiddenWorkNote: string | null = null

  const seenTitleDate = new Map<string, ExtractedTaskDraft>()

  for (const line of lines) {
    if (SKIP_RE.test(line)) continue
    const m = DATE_RE.exec(line)
    const nm = !m ? NUMERIC_DATE_RE.exec(line) : null
    if (!m && !nm) continue
    datesFound++

    let month: number, day: number, year: number | undefined
    if (m) {
      const raw = m[1].toLowerCase().replace(/\./g, '')
      month = MONTHS[raw] ?? MONTHS[raw.slice(0, 3)]
      day = parseInt(m[2], 10)
      year = m[3] ? parseInt(m[3], 10) : undefined
    } else {
      month = parseInt(nm![1], 10) - 1
      day = parseInt(nm![2], 10)
      year = nm![3] ? (nm![3].length === 2 ? 2000 + parseInt(nm![3], 10) : parseInt(nm![3], 10)) : undefined
    }
    if (month == null || Number.isNaN(month) || Number.isNaN(day)) continue
    const resolvedYear = year ?? resolveYear(month, semesterStartISO)
    const dateObj = new Date(resolvedYear, month, day)
    if (Number.isNaN(dateObj.getTime())) continue

    const timeMatch = TIME_RE.exec(line)
    let dueMin = 23 * 60 + 59
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10)
      const mins = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
      const pm = /pm/i.test(timeMatch[3])
      if (pm && h < 12) h += 12
      if (!pm && h === 12) h = 0
      dueMin = h * 60 + mins
    }
    const dueDateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`
    const dueAt = `${dueDateStr}T${String(Math.floor(dueMin / 60)).padStart(2, '0')}:${String(dueMin % 60).padStart(2, '0')}:00`

    const type = classifyType(line) ?? 'custom'
    const rawTitle = cleanTitle(line) || `${type} due`
    const title = type === 'exam' && !/study|review|prep/i.test(rawTitle) ? `Study for ${rawTitle}` : rawTitle
    const pctMatch = PCT_RE.exec(line)
    const pagesMatch = PAGES_RE.exec(line)
    const hoursMatch = HOURS_RE.exec(line)

    const base = EFFORT[type]
    let p50 = base.p50
    let p80 = base.p80
    if (type === 'reading' && pagesMatch) {
      const pages = Math.max(1, parseInt(pagesMatch[2], 10) - parseInt(pagesMatch[1], 10))
      p50 = Math.max(20, Math.round((pages * 2.2) / 5) * 5)
      p80 = Math.round(p50 * 1.5)
    }
    if (hoursMatch) {
      p50 = Math.round(((parseInt(hoursMatch[1], 10) + parseInt(hoursMatch[2], 10)) / 2) * 60)
      p80 = parseInt(hoursMatch[2], 10) * 60
    }

    const notes: string[] = []
    let confidence: Confidence = 'high'
    if (!timeMatch) {
      confidence = 'medium'
      notes.push('No due time specified — defaulted to 11:59 PM')
    }
    if (type === 'custom') {
      confidence = 'low'
      notes.push('Could not identify assignment type from syllabus text')
    }
    if (hoursMatch) notes.push(`Estimated effort ${hoursMatch[1]}–${hoursMatch[2]} hours`)

    const id = `${idPrefix}-t${seq++}`
    const task: CatalystTask = {
      id,
      courseId,
      title,
      type,
      dueAt,
      p50Minutes: p50,
      p80Minutes: p80,
      minSessionMin: base.min,
      maxSessionMin: base.max,
      gradeWeightPct: pctMatch ? parseInt(pctMatch[1], 10) : undefined,
      difficulty: base.difficulty,
      dependsOn: [],
      status: 'not_started',
      confidence,
      source: 'syllabus',
      deferralCount: 0,
      createdAt: new Date().toISOString(),
      notes: notes.length > 0 ? notes.join('; ') : undefined,
    }

    if ((type === 'project' || type === 'paper') && p80 >= 360) {
      task.wbs = makeWbs(id, p80, dueAt)
      task.hiddenWork = 'This assignment needs research, an outline, a draft, and revision — Catalyst broke it into stages.'
      hiddenWorkNote = task.hiddenWork
    }

    const key = `${title.toLowerCase()}|${type}`
    const existing = seenTitleDate.get(key)
    if (existing && existing.task.dueAt.slice(0, 10) !== dueAt.slice(0, 10)) {
      existing.task.confidence = 'low'
      existing.confidenceNotes.push('Date appears in two places in the syllabus')
      existing.task.notes = existing.confidenceNotes.join('; ')
      continue
    }
    if (existing) continue

    const draft: ExtractedTaskDraft = { task, confidenceNotes: notes }
    seenTitleDate.set(key, draft)
    drafts.push(draft)
  }

  return { drafts, hiddenWorkNote, stats: { linesScanned: lines.length, datesFound } }
}

export function detectCourseHeader(text: string): { code?: string; name?: string } {
  const first = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  const codeMatch = /\b([A-Z]{2,5}\s?-?\s?\d{2,4}[A-Z]?)\b/.exec(first)
  return { code: codeMatch?.[1]?.replace(/\s+/g, ' ').trim(), name: first.trim().slice(0, 60) }
}
