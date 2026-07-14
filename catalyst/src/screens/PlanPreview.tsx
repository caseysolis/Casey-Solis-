import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalyst } from '../store/useCatalyst'
import { computeCoverage } from '../lib/engine'
import { addDays, durationLabel, formatDayLabel, minToLabel, toDateStr } from '../lib/dates'
import TopBar from '../components/TopBar'

const STATUS_COPY: Record<string, { label: string; color: string; bg: string }> = {
  green: { label: 'Feasible', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100' },
  amber: { label: 'Feasible but tight', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-100' },
  red: { label: 'Not yet feasible', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-100' },
}

export default function PlanPreview() {
  const navigate = useNavigate()
  const state = useCatalyst()
  const approvePlan = useCatalyst((s) => s.approvePlan)

  const coverage = useMemo(() => computeCoverage(state, undefined, 14), [state])
  const today = toDateStr(new Date(state.now))
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today])
  const copy = STATUS_COPY[coverage.status]

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Your semester plan" subtitle="Review before Catalyst starts tracking anything" />
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className={`rounded-2xl border p-4 ${copy.bg}`}>
          <p className={`text-[15px] font-semibold ${copy.color}`}>{copy.label} · {Math.round((coverage.ratio - 1) * 100)}% cushion</p>
          <p className="text-[12.5px] text-slate-500 mt-1">
            {durationLabel(coverage.availableMinutes)} available vs {durationLabel(coverage.demandMinutes)} of work due in the next two weeks.
          </p>
        </div>

        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-5 mb-2">First week</p>
        <div className="flex flex-col gap-3">
          {week.map((date) => {
            const dayBlocks = state.blocks
              .filter((b) => b.date === date && (b.kind === 'task' || b.kind === 'wbs'))
              .sort((a, b) => a.startMin - b.startMin)
            if (dayBlocks.length === 0) return null
            return (
              <div key={date}>
                <p className="text-[12px] font-semibold text-slate-500 mb-1.5">{formatDayLabel(date)}</p>
                <div className="flex flex-col gap-1.5">
                  {dayBlocks.map((b) => (
                    <div key={b.id} className="flex items-center gap-2.5 bg-white border border-slate-100 rounded-xl px-3 py-2.5 shadow-sm">
                      <span className="w-1.5 h-8 rounded-full shrink-0" style={{ background: b.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[#0b0a14] truncate">{b.title}</p>
                        <p className="text-[11px] text-slate-400">{minToLabel(b.startMin)} · {durationLabel(b.endMin - b.startMin)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="shrink-0 px-6 pb-6 pt-2 border-t border-slate-100">
        <button
          onClick={() => {
            approvePlan()
            navigate('/today')
          }}
          className="w-full bg-[#6d5bf6] text-white font-semibold py-3.5 rounded-2xl text-[15px]"
        >
          Approve and start
        </button>
        <p className="text-center text-[11px] text-slate-400 mt-2">Nothing is scheduled until you approve.</p>
      </div>
    </div>
  )
}
