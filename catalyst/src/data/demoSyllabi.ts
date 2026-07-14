// Canned syllabus excerpts for the "Use demo semester" fast path. These are run
// through the *real* extractor (lib/extract.ts) — nothing here is a pre-built
// task list — so the demo exercises the same code path a real upload would.

import type { Course } from '../lib/types'
import { COURSE_PALETTE } from '../lib/constants'

export interface DemoCourseSeed {
  meta: Omit<Course, 'meetings' | 'color'> & { color?: string }
  meetings: Course['meetings']
  syllabusText: string
}

export const DEMO_COURSES: DemoCourseSeed[] = [
  {
    meta: { id: 'chem101', code: 'CHEM 101', name: 'General Chemistry', instructor: 'Prof. Alvarez' },
    meetings: [
      { id: 'chem-lec', label: 'Lecture', daysOfWeek: [1, 3, 5], startMin: 9 * 60, endMin: 9 * 60 + 50, location: 'Science Center 210', type: 'class' },
      { id: 'chem-lab', label: 'Lab', daysOfWeek: [2], startMin: 14 * 60, endMin: 16 * 60 + 50, location: 'Science Center Lab 3', type: 'lab' },
    ],
    syllabusText: `CHEM 101 - General Chemistry
Late policy: 10% per day, no submissions after 3 days.
Aug 26 Reading pp. 1-24 Intro and measurement
Sep 2 Problem Set 1 due 11:59 PM (8%)
Sep 9 Reading pp. 25-58 Atomic structure
Sep 16 Lab Report 2 due 11:59 PM CHEM 101 Lab (10%)
Lab Report 2 due Sept 16
Oct 7 Midterm Exam during class (20%)
Oct 21 Problem Set 4 due 11:59 PM (8%)
Nov 4 Reading pp. 140-172 Thermochemistry
Dec 8 Final Project due 5:00 PM estimated 12-16 hours (24%)
Dec 15 Final Exam 8:00 AM (30%)`,
  },
  {
    meta: { id: 'math221', code: 'MATH 221', name: 'Calculus II', instructor: 'Prof. Nakamura' },
    meetings: [
      { id: 'math-lec', label: 'Lecture', daysOfWeek: [1, 3, 5], startMin: 10 * 60, endMin: 10 * 60 + 50, location: 'Hayes Hall 118', type: 'class' },
    ],
    syllabusText: `MATH 221 - Calculus II
Weekly quizzes each Friday during class (2% each)
Sep 4 Quiz 1
Sep 11 Quiz 2
Sep 18 Quiz 3
Sep 25 Problem Set 3 due 11:59 PM (6%)
Oct 9 Midterm Exam in class (25%)
Oct 30 Problem Set 6 due 11:59 PM (6%)
Nov 20 Quiz 8
Dec 11 Final Exam 2:00 PM (35%)`,
  },
  {
    meta: { id: 'psyc210', code: 'PSYC 210', name: 'Cognitive Psychology', instructor: 'Prof. Whitfield' },
    meetings: [
      { id: 'psyc-lec', label: 'Lecture', daysOfWeek: [2, 4], startMin: 13 * 60, endMin: 14 * 60 + 15, location: 'Winslow Hall 220', type: 'class' },
    ],
    syllabusText: `PSYC 210 - Cognitive Psychology
Sep 10 Reading Chapter 2 pp. 30-52
Sep 22 Response Paper 1 due 11:59 PM (10%)
Oct 15 Midterm Exam during class (20%)
Final research paper on a topic of your choice.
The paper requires research, an argument outline, drafted sections, a conclusion, and a full revision pass with citations.
Dec 8 Final Research Paper due 11:59 PM estimated 10-14 hours (25%)
Dec 3 Presentation of research topic in class (10%)`,
  },
  {
    meta: { id: 'engl105', code: 'ENGL 105', name: 'College Writing', instructor: 'Prof. Reyes' },
    meetings: [
      { id: 'engl-lec', label: 'Seminar', daysOfWeek: [2, 4], startMin: 11 * 60, endMin: 12 * 60 + 15, location: 'Lyman Hall 4', type: 'class' },
    ],
    syllabusText: `ENGL 105 - College Writing
Sep 8 Reading pp. 12-30 Style and argument
Sep 17 Essay 1 draft due 11:59 PM (12%)
Oct 1 Essay 1 final due 11:59 PM (15%)
Oct 22 Reading pp. 88-110
Nov 12 Essay 2 due 11:59 PM (18%)`,
  },
  {
    meta: { id: 'hist110', code: 'HIST 110', name: 'World History Since 1500', instructor: 'Prof. Okafor' },
    meetings: [
      { id: 'hist-lec', label: 'Lecture', daysOfWeek: [2, 4], startMin: 15 * 60 + 30, endMin: 16 * 60 + 45, location: 'Founders 102', type: 'class' },
    ],
    syllabusText: `HIST 110 - World History Since 1500
Sep 3 Reading pp. 1-22
Sep 24 Quiz 1
Oct 13 Problem Set: primary source analysis due 11:59 PM (10%)
Nov 5 Midterm Exam during class (20%)
Nov 19 Reading pp. 210-240`,
  },
]

export function courseColor(index: number): string {
  return COURSE_PALETTE[index % COURSE_PALETTE.length]
}
