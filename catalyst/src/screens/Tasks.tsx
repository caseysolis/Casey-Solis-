import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalyst } from '../store/useCatalyst'
import { TASK_TYPE_LABEL } from '../lib/constants'
import { formatShortDate } from '../lib/dates'
import TopBar from '../components/TopBar'

const FILTERS = ['Upcoming', 'Completed', 'All'] as const

export default function Tasks() {
  const navigate = useNavigate()
  const tasks = useCatalyst((s) => s.tasks)
  const courses = useCatalyst((s) => s.courses)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Upcoming')

  const filtered = useMemo(() => {
    let list = tasks
    if (filter === 'Upcoming') list = list.filter((t) => t.status !== 'completed' && t.status !== 'waived')
    if (filter === 'Completed') list = list.filter((t) => t.status === 'completed')
    return [...list].sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  }, [tasks, filter])

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Tasks" subtitle={`${tasks.filter((t) => t.status !== 'completed').length} open`} />
      <div className="flex gap-1.5 px-6 mt-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium ${filter === f ? 'bg-[#0b0a14] text-white' : 'bg-slate-100 text-slate-500'}`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-6 mt-3 pb-4">
        <div className="flex flex-col gap-2">
          {filtered.map((t) => {
            const course = courses.find((c) => c.id === t.courseId)
            const overdue = t.status !== 'completed' && new Date(t.dueAt) < new Date()
            return (
              <button
                key={t.id}
                onClick={() => navigate(`/tasks/${t.id}`)}
                className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-3.5 py-3 shadow-sm text-left"
              >
                <StatusDot status={t.status} />
                <span className="w-1 h-8 rounded-full shrink-0" style={{ background: course?.color ?? '#94a3b8' }} />
                <div className="min-w-0 flex-1">
                  <p className={`text-[13.5px] font-medium truncate ${t.status === 'completed' ? 'text-slate-400 line-through' : 'text-[#0b0a14]'}`}>{t.title}</p>
                  <p className="text-[11.5px] text-slate-400">{course?.code} · {TASK_TYPE_LABEL[t.type]}</p>
                </div>
                <span className={`text-[11.5px] shrink-0 ${overdue ? 'text-rose-500 font-semibold' : 'text-slate-400'}`}>{formatShortDate(t.dueAt.slice(0, 10))}</span>
              </button>
            )
          })}
          {filtered.length === 0 && <p className="text-[12.5px] text-slate-400 text-center mt-8">Nothing here.</p>}
        </div>
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'completed' ? 'bg-emerald-500' : status === 'blocked' ? 'bg-rose-500' : status === 'in_progress' ? 'bg-amber-400' : 'bg-slate-200'
  return <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
}
