import type { CatalystTask, Course } from './types'
import { extractSyllabus } from './extract'
import { DEMO_COURSES, courseColor } from '../data/demoSyllabi'
import { DEMO_SEMESTER, DEMO_NOW } from '../data/demoProfile'

export function buildDemoImport(): { courses: Course[]; tasks: CatalystTask[] } {
  const courses: Course[] = []
  const tasks: CatalystTask[] = []

  DEMO_COURSES.forEach((seed, i) => {
    const course: Course = { ...seed.meta, meetings: seed.meetings, color: courseColor(i) }
    courses.push(course)
    const { drafts } = extractSyllabus(seed.syllabusText, course.id, DEMO_SEMESTER.startDate, course.id)
    for (const d of drafts) tasks.push(d.task)
  })

  const draft1 = tasks.find((t) => t.courseId === 'engl105' && /draft/i.test(t.title))
  const final1 = tasks.find((t) => t.courseId === 'engl105' && /final/i.test(t.title) && t.type !== 'exam')
  if (draft1 && final1) final1.dependsOn = [draft1.id]

  seedHistory(tasks, DEMO_NOW)

  return { courses, tasks }
}

function hashSeed(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

function seedHistory(tasks: CatalystTask[], nowISO: string) {
  const now = new Date(nowISO)
  for (const t of tasks) {
    if (new Date(t.dueAt) < now) {
      const h = hashSeed(t.id)
      const varianceFactor = 0.75 + (h % 60) / 100 // 0.75 - 1.34
      t.status = 'completed'
      t.actualMinutes = Math.max(10, Math.round((t.p50Minutes * varianceFactor) / 5) * 5)
      if (t.wbs) for (const s of t.wbs) s.status = 'completed'
    }
  }
}
