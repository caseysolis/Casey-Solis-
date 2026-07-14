import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalyst } from '../store/useCatalyst'
import { calibrationError, computeCoverage, weekForecast } from '../lib/engine'
import { addDays, durationLabel, formatDayLabel, startOfWeek, toDateStr } from '../lib/dates'
import TopBar from '../components/TopBar'

export default function Insights() {
  const navigate = useNavigate()
  const state = useCatalyst()
  const today = toDateStr(new Date(state.now))

  const coverage = useMemo(() => computeCoverage(state, undefined, 14), [state])
  const calibration = useMemo(() => calibrationError(state), [state])
  const forecast14 = useMemo(() => {
    const out = []
    for (let i = 0; i < 14; i++) out.push(...weekForecast(state, startOfWeek(addDays(today, i))).filter((d) => d.date === addDays(today, i)))
    return out
  }, [state, today])

  const pastBlocks = state.blocks.filter((b) => b.date < today && (b.kind === 'task' || b.kind === 'wbs'))
  const adherence = pastBlocks.length > 0 ? Math.round((pastBlocks.filter((b) => b.status === 'completed').length / pastBlocks.length) * 100) : null

  const completedWithActuals = state.tasks.filter((t) => t.status === 'completed' && t.actualMinutes != null).slice(-5)
  const riskDays = [...forecast14].sort((a, b) => b.academicMin - a.academicMin).slice(0, 2)
  const attention = state.tasks.filter((t) => t.status === 'blocked' || (t.status !== 'completed' && t.confidence === 'low'))

  const week = weekForecast(state, startOfWeek(today))
  const balance = week.reduce(
    (acc, d) => ({ academic: acc.academic + d.academicMin, work: acc.work + d.workMin, recovery: acc.recovery + d.recoveryMin }),
    { academic: 0, work: 0, recovery: 0 },
  )
  const balanceTotal = Math.max(balance.academic + balance.work + balance.recovery, 1)

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Insights" subtitle="Learn and prepare" />
      <div className="flex-1 overflow-y-auto px-6 pb-4 flex flex-col gap-4">
        <Card label="Plan confidence">
          <p className="text-[22px] font-semibold text-[#0b0a14] capitalize">
            {coverage.status === 'green' ? 'Comfortable' : coverage.status === 'amber' ? 'Tight' : 'At risk'}
            <span className="text-slate-400 font-normal text-[14px]"> · {Math.min(999, Math.round((coverage.ratio - 1) * 100))}% cushion</span>
          </p>
          <p className="text-[12px] text-slate-500 mt-0.5">
            {coverage.status === 'green' ? 'Comfortably covers the next two weeks of work.' : coverage.status === 'amber' ? 'Feasible, but has little room for surprises.' : 'Not enough usable time before deadlines — expect a replan.'}
          </p>
        </Card>

        <Card label="Estimate calibration">
          <p className="text-[22px] font-semibold text-[#0b0a14]">{Math.round(calibration * 100)}% off</p>
          <p className="text-[12px] text-slate-500 mt-0.5">Average difference between estimated and actual focus time.</p>
          {completedWithActuals.length > 0 && (
            <div className="mt-2.5 flex flex-col gap-1">
              {completedWithActuals.map((t) => (
                <div key={t.id} className="flex justify-between text-[11.5px] text-slate-500">
                  <span className="truncate pr-2">{t.title}</span>
                  <span>{durationLabel(t.p50Minutes)} → {durationLabel(t.actualMinutes!)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card label="Adherence">
          {adherence == null ? (
            <p className="text-[12.5px] text-slate-400">Not enough history yet.</p>
          ) : (
            <>
              <p className="text-[22px] font-semibold text-[#0b0a14]">{adherence}%</p>
              <p className="text-[12px] text-slate-500 mt-0.5">Planned blocks started or completed, not deferred or skipped.</p>
            </>
          )}
        </Card>

        <Card label="Workload balance — this week">
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex mt-1">
            <div className="h-full bg-[#6d5bf6]" style={{ width: `${(balance.academic / balanceTotal) * 100}%` }} />
            <div className="h-full bg-amber-400" style={{ width: `${(balance.work / balanceTotal) * 100}%` }} />
            <div className="h-full bg-emerald-400" style={{ width: `${(balance.recovery / balanceTotal) * 100}%` }} />
          </div>
          <div className="flex gap-3 mt-2.5">
            <Legend color="#6d5bf6" label={`Academic ${durationLabel(balance.academic)}`} />
            <Legend color="#fbbf24" label={`Work ${durationLabel(balance.work)}`} />
            <Legend color="#34d399" label={`Recovery ${durationLabel(balance.recovery)}`} />
          </div>
        </Card>

        <Card label="Risk peaks">
          <div className="flex flex-col gap-1.5">
            {riskDays.map((d) => (
              <div key={d.date} className="flex justify-between text-[12.5px]">
                <span className="text-slate-600">{formatDayLabel(d.date)}</span>
                <span className="text-slate-400">{durationLabel(d.academicMin)} scheduled</span>
              </div>
            ))}
          </div>
        </Card>

        {attention.length > 0 && (
          <Card label="Needs your decision">
            <div className="flex flex-col gap-1.5">
              {attention.map((t) => (
                <button key={t.id} onClick={() => navigate(`/tasks/${t.id}`)} className="flex justify-between text-[12.5px] text-left">
                  <span className="text-[#0b0a14]">{t.title}</span>
                  <span className={t.status === 'blocked' ? 'text-rose-500' : 'text-amber-600'}>{t.status === 'blocked' ? 'Blocked' : 'Low confidence'}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      {label}
    </span>
  )
}
