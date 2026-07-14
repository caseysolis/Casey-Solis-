// Core domain model, following FDD Section 7.3 (conceptual data model)
// and Section 5 (functional capability design).

export type TaskType =
  | 'reading'
  | 'problem_set'
  | 'lab'
  | 'paper'
  | 'project'
  | 'presentation'
  | 'quiz'
  | 'exam'
  | 'admin'
  | 'custom'

export type TaskStatus =
  | 'not_started'
  | 'scheduled'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'waived'
  | 'overdue'

export type Confidence = 'high' | 'medium' | 'low'
export type SourceType = 'lms' | 'syllabus' | 'inferred' | 'user'

export interface Course {
  id: string
  code: string
  name: string
  instructor?: string
  color: string // tailwind-ish hex used for chips/blocks
  gradeWeightTotal?: number
  meetings: Meeting[]
  archived?: boolean
}

export interface Meeting {
  id: string
  label: string // "Lecture", "Lab", "Discussion"
  daysOfWeek: number[] // 0=Sun..6=Sat
  startMin: number // minutes from midnight
  endMin: number
  location?: string
  type: 'class' | 'lab' | 'discussion' | 'exam'
}

export interface WbsStage {
  id: string
  title: string
  p50Minutes: number
  p80Minutes: number
  status: TaskStatus
  order: number
  dueBy?: string // ISO date, soft internal milestone
}

export interface CatalystTask {
  id: string
  courseId: string
  title: string
  type: TaskType
  dueAt: string // ISO datetime
  earliestStart?: string
  p50Minutes: number
  p80Minutes: number
  minSessionMin: number
  maxSessionMin: number
  gradeWeightPct?: number // contribution to course grade
  difficulty: 1 | 2 | 3 | 4 | 5
  dependsOn: string[] // task ids that must complete first
  status: TaskStatus
  confidence: Confidence
  source: SourceType
  notes?: string
  wbs?: WbsStage[]
  actualMinutes?: number
  deferralCount: number
  hiddenWork?: string // e.g. "Final project needs research, outline, draft, revision"
  createdAt: string
}

export type CommitmentKind = 'fixed' | 'protected' | 'flexible'

export interface Commitment {
  id: string
  title: string
  kind: CommitmentKind
  category: 'sleep' | 'work' | 'gym' | 'meal' | 'club' | 'family' | 'social' | 'travel' | 'other'
  daysOfWeek: number[]
  startMin: number
  endMin: number
  icon?: string
  /** If set, this commitment applies only on this single date (used for what-if simulation), ignoring daysOfWeek. */
  oneOffDate?: string
}

export type BlockStatus = 'planned' | 'in_progress' | 'completed' | 'skipped' | 'moved'
export type BlockSourceKind = 'task' | 'wbs' | 'commitment' | 'meeting'

export interface PlanBlock {
  id: string
  date: string // ISO date (local, yyyy-mm-dd)
  startMin: number
  endMin: number
  kind: BlockSourceKind
  refId: string // taskId / wbsId / commitmentId / meetingId
  courseId?: string
  title: string
  status: BlockStatus
  explanation: string
  reasons: string[]
  locked: boolean // fixed/protected -> true
  color: string
}

export interface ProgressEvent {
  id: string
  blockId: string
  taskId?: string
  actualMinutes: number
  result: 'completed' | 'partial' | 'blocked'
  energy?: 1 | 2 | 3 | 4 | 5
  notedAt: string
}

export type Chronotype = 'morning' | 'evening' | 'flexible'

export interface StudentProfile {
  name: string
  chronotype: Chronotype
  focusDurationMin: number
  preferredDaysOff: number[]
  commuteBufferMin: number
  quietHoursStart: number
  quietHoursEnd: number
  lowStimulationMode: boolean
  energyByHour: Record<number, number> // hour(0-23) -> 1..5
}

export interface Semester {
  startDate: string
  endDate: string
  timezone: string
  institution?: string
}

export interface ConnectorState {
  id: string
  name: string
  kind: 'lms' | 'calendar'
  status: 'connected' | 'available' | 'syllabus_only'
  lastSync?: string
}

export interface CoverageWindow {
  status: 'green' | 'amber' | 'red'
  ratio: number
  availableMinutes: number
  demandMinutes: number
}

export interface DayForecast {
  date: string
  academicMin: number
  workMin: number
  recoveryMin: number
  unallocatedMin: number
}

export interface ChangeLogEntry {
  id: string
  at: string
  summary: string
  detail: string
  requiresConsent: boolean
  accepted: boolean
}

export interface WhatIfResult {
  scenarioLabel: string
  deadlineRiskDeltaPct: number
  thursdayLoadDeltaMin: number
  sleepImpactMin: number
  cushionBeforePct: number
  cushionAfterPct: number
  alternatives: {
    id: string
    label: string
    detail: string
    verdict: 'recommended' | 'good' | 'risky'
  }[]
}

export interface CoachMessage {
  id: string
  role: 'user' | 'catalyst'
  text: string
  citations?: string[]
  createdAt: string
  preview?: {
    summary: string
    changes: string[]
  }
}

export interface CatalystState {
  onboarded: boolean
  profile: StudentProfile
  semester: Semester
  connectors: ConnectorState[]
  courses: Course[]
  tasks: CatalystTask[]
  commitments: Commitment[]
  blocks: PlanBlock[]
  progressEvents: ProgressEvent[]
  changeLog: ChangeLogEntry[]
  coachHistory: CoachMessage[]
  pendingImport: { courses: Course[]; tasks: CatalystTask[] } | null
  planApproved: boolean
  lastPlannedAt: string | null
  now: string // simulated "now" so the demo can be moved through the week
}
