import type { Commitment, ConnectorState, Semester, StudentProfile } from '../lib/types'

export const DEMO_SEMESTER: Semester = {
  startDate: '2026-08-24',
  endDate: '2026-12-12',
  timezone: 'America/New_York',
  institution: 'Ashbrook College',
}

export const DEMO_NOW = '2026-09-15T08:10:00'

export const DEMO_PROFILE: StudentProfile = {
  name: 'Maya',
  chronotype: 'morning',
  focusDurationMin: 50,
  preferredDaysOff: [0],
  commuteBufferMin: 10,
  quietHoursStart: 22 * 60 + 30,
  quietHoursEnd: 7 * 60,
  lowStimulationMode: false,
  energyByHour: {
    6: 2, 7: 3, 8: 4, 9: 5, 10: 5, 11: 4, 12: 3, 13: 3, 14: 3, 15: 3, 16: 3,
    17: 2, 18: 2, 19: 3, 20: 3, 21: 2, 22: 1,
  },
}

export const DEFAULT_COMMITMENTS: Commitment[] = [
  { id: 'sleep', title: 'Sleep', kind: 'protected', category: 'sleep', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startMin: 22 * 60 + 30, endMin: 7 * 60 },
  { id: 'lunch', title: 'Lunch', kind: 'protected', category: 'meal', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startMin: 12 * 60, endMin: 12 * 60 + 45 },
  { id: 'gym', title: 'Gym', kind: 'protected', category: 'gym', daysOfWeek: [2, 4], startMin: 16 * 60, endMin: 17 * 60 + 30 },
  { id: 'work', title: 'Work shift · Campus bookstore', kind: 'fixed', category: 'work', daysOfWeek: [2], startMin: 15 * 60 + 30, endMin: 18 * 60 + 30 },
  { id: 'family', title: 'Family call', kind: 'protected', category: 'family', daysOfWeek: [0], startMin: 18 * 60, endMin: 19 * 60 },
]

export const DEFAULT_CONNECTORS: ConnectorState[] = [
  { id: 'canvas', name: 'Canvas', kind: 'lms', status: 'available' },
  { id: 'blackboard', name: 'Blackboard', kind: 'lms', status: 'available' },
  { id: 'brightspace', name: 'Brightspace', kind: 'lms', status: 'available' },
  { id: 'moodle', name: 'Moodle', kind: 'lms', status: 'available' },
  { id: 'apple-cal', name: 'Apple Calendar', kind: 'calendar', status: 'available' },
  { id: 'google-cal', name: 'Google Calendar', kind: 'calendar', status: 'available' },
  { id: 'outlook-cal', name: 'Outlook', kind: 'calendar', status: 'available' },
]
