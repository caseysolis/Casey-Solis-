import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalyst } from '../store/useCatalyst'
import { useUi } from '../store/useUi'
import { computeCoverage, weekForecast } from '../lib/engine'
import { addDays, dayNum, durationLabel, formatDayLabel, minToLabel, startOfWeek, toDateStr, weekdayShort } from '../lib/dates'
import TopBar from '../components/TopBar'

export default function Plan() {
  const navigate = useNavigate()
  const state = useCatalyst()
  const toggleBlockLock = useCatalyst((s) => s.toggleBlockLock)
  const openFocus = useUi((s) => s.openFocus)
  const today = toDateStr(new Date(state.now))
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today))
  const [selectedDate, setSelectedDate] = useState(today)

  const forecast = useMemo(() => weekForecast(state, weekStart), [state, weekStart])
  const coverage = useMemo(() => computeCoverage(state, weekStart, 7), [state, weekStart])
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const copy = coverage.status === 'green' ? { label: 'Feasible', color: 'text-emerald-700 bg-emerald-50' } : coverage.status === 'amber' ? { label: 'Feasible · tight', color: 'text-amber-700 bg-amber-50' } : { label: 'Not feasible', color: 'text-rose-700 bg-rose-50' }
  const cushionPct = Math.round((coverage.ratio - 1) * 100)

  const dayBlocks = state.blocks.filter((b) => b.date === selectedDate).sort((a, b) => a.startMin - b.startMin)
  const maxDayLoad = Math.max(...forecast.map((d) => d.academicMin + d.workMin + d.recoveryMin), 1)

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Week plan" subtitle={`${formatDayLabel(weekStart)} – ${formatDayLabel(addDays(weekStart, 6))}`} />
      <div className="px-6 flex items-center justify-between">
        <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full ${copy.color}`}>{copy.label} · {cushionPct}% cushion</span>
        <div className="flex gap-1">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-500 text-[13px]">‹</button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-500 text-[13px]">›</button>
        </div>
      </div>

      <div className="flex px-4 mt-3 gap-1">
        {weekDates.map((d) => {
          const isSelected = d === selectedDate
          const isToday = d === today
          const load = forecast.find((f) => f.date === d)?.academicMin ?? 0
          return (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={`flex-1 flex flex-col items-center py-2 rounded-xl gap-1 ${isSelected ? 'bg-[#0b0a14] text-white' : 'text-slate-500'}`}
            >
              <span className="text-[9.5px] font-semibold uppercase">{weekdayShort(d)}</span>
              <span className={`text-[13px] font-semibold ${isToday && !isSelected ? 'text-[#6d5bf6]' : ''}`}>{dayNum(d)}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${load > 0 ? (isSelected ? 'bg-white' : 'bg-[#6d5bf6]') : 'bg-transparent'}`} />
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-6 mt-4 pb-4">
        <p className="text-[12.5px] font-semibold text-slate-500 mb-2">{formatDayLabel(selectedDate)}</p>
        <div className="flex flex-col gap-1.5">
          {dayBlocks.length === 0 && <p className="text-[12.5px] text-slate-400">No plan for this day yet.</p>}
          {dayBlocks.map((b) => (
            <div key={b.id} className="flex items-center gap-2.5 bg-white border border-slate-100 rounded-xl px-3 py-2.5 shadow-sm">
              <span className="w-1.5 h-9 rounded-full shrink-0" style={{ background: b.color }} />
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] truncate ${b.status === 'skipped' ? 'line-through text-slate-300' : b.status === 'completed' ? 'text-slate-400' : 'text-[#0b0a14] font-medium'}`}>
                  {b.locked && (b.kind === 'task' || b.kind === 'wbs') && <span className="mr-1">🔒</span>}
                  {b.title}
                </p>
                <p className="text-[11px] text-slate-400">{minToLabel(b.startMin)} · {durationLabel(b.endMin - b.startMin)}</p>
              </div>
              {(b.kind === 'task' || b.kind === 'wbs') && b.status === 'planned' && (
                <div className="flex gap-1 shrink-0">
                  <IconBtn label="▶" onClick={() => openFocus(b.id)} />
                  <IconBtn label={b.locked ? '🔓' : '🔒'} onClick={() => toggleBlockLock(b.id)} />
                  <IconBtn label="⋯" onClick={() => navigate(`/whatif/${b.id}`)} />
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-6 mb-2">Workload forecast</p>
        <div className="bg-white border border-slate-100 rounded-2xl p-3.5">
          <div className="flex flex-col gap-2">
            {forecast.map((d) => (
              <div key={d.date} className="flex items-center gap-2">
                <span className="text-[10.5px] text-slate-400 w-7 shrink-0">{weekdayShort(d.date)}</span>
                <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
                  <div className="h-full bg-[#6d5bf6]" style={{ width: `${(d.academicMin / maxDayLoad) * 100}%` }} />
                  <div className="h-full bg-amber-400" style={{ width: `${(d.workMin / maxDayLoad) * 100}%` }} />
                  <div className="h-full bg-emerald-400" style={{ width: `${(d.recoveryMin / maxDayLoad) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-3 justify-center">
            <Legend color="#6d5bf6" label="Academic" />
            <Legend color="#fbbf24" label="Work" />
            <Legend color="#34d399" label="Recovery" />
          </div>
        </div>
      </div>
    </div>
  )
}

function IconBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-7 h-7 rounded-full bg-slate-50 text-[11px] flex items-center justify-center text-slate-500">
      {label}
    </button>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}
