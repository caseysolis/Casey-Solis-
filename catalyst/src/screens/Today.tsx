import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalyst } from '../store/useCatalyst'
import { useUi } from '../store/useUi'
import { nextBestAction, scoreTask, computeCoverage } from '../lib/engine'
import { durationLabel, formatDayLabel, minToLabel, toDateStr } from '../lib/dates'

export default function Today() {
  const navigate = useNavigate()
  const state = useCatalyst()
  const openFocus = useUi((s) => s.openFocus)
  const clearOverride = useCatalyst((s) => s.clearOverride)
  const replaceToday = useCatalyst((s) => s.replaceToday)
  const deferBlock = useCatalyst((s) => s.deferBlock)
  const cannotDo = useCatalyst((s) => s.cannotDo)
  const startAdHoc = useCatalyst((s) => s.startAdHoc)
  const [showWhy, setShowWhy] = useState(false)

  const today = toDateStr(new Date(state.now))
  const coverage = useMemo(() => computeCoverage(state, undefined, 14), [state])

  const action = useMemo(() => {
    if (state.todayOverrideTaskId) {
      const t = state.tasks.find((x) => x.id === state.todayOverrideTaskId)
      if (t) {
        const block = state.blocks.find((b) => (b.kind === 'task' || b.kind === 'wbs') && b.refId === t.id && b.date === today && b.status === 'planned')
        return scoreTask(state, t, { block })
      }
    }
    return nextBestAction(state)
  }, [state, today])

  const dayBlocks = state.blocks.filter((b) => b.date === today).sort((a, b) => a.startMin - b.startMin)
  const nowMin = new Date(state.now).getHours() * 60 + new Date(state.now).getMinutes()
  const hour = new Date(state.now).getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const statusCopy = coverage.status === 'green' ? 'On track' : coverage.status === 'amber' ? 'Tight week' : 'At risk'
  const statusColor = coverage.status === 'green' ? 'bg-emerald-50 text-emerald-700' : coverage.status === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'

  const handleStart = () => {
    if (!action) return
    if (action.block) openFocus(action.block.id)
    else {
      const id = startAdHoc(action.taskId, action.durationMin)
      if (id) openFocus(id, action.durationMin)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start justify-between px-6 pt-4 pb-2">
        <div>
          <h1 className="text-[21px] font-semibold text-[#0b0a14]">{greeting}, {state.profile.name}</h1>
          <p className="text-[12.5px] text-slate-400">{formatDayLabel(today)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>{statusCopy}</span>
          <button onClick={() => navigate('/coach')} className="w-8 h-8 rounded-full bg-white shadow border border-black/5 flex items-center justify-center text-slate-500">💬</button>
          <button onClick={() => navigate('/settings')} className="w-8 h-8 rounded-full bg-white shadow border border-black/5 flex items-center justify-center text-slate-500">⚙️</button>
        </div>
      </div>

      <div className="px-6">
        {action ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10.5px] font-bold text-[#6d5bf6] tracking-wide uppercase">Next best action</p>
            <p className="text-[17px] font-semibold text-[#0b0a14] mt-1">{action.title}</p>
            <div className="h-1.5 bg-slate-100 rounded-full mt-2.5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-[#6d5bf6]" style={{ width: `${Math.round(action.score * 100)}%` }} />
            </div>
            <p className="text-[12px] text-slate-500 mt-2">
              {durationLabel(action.durationMin)} · due {formatDayLabel(action.dueAt.slice(0, 10))}
              {action.confidence !== 'high' && <span className="text-amber-600"> · {action.confidence} confidence</span>}
            </p>

            <div className="flex gap-2 mt-3.5">
              <button onClick={handleStart} className="flex-1 bg-[#6d5bf6] text-white font-semibold py-2.5 rounded-xl text-[13.5px]">
                Start focus session
              </button>
              <button onClick={() => setShowWhy((v) => !v)} className="px-4 py-2.5 rounded-xl text-[13.5px] font-medium border border-slate-200 text-slate-600">
                Why this?
              </button>
            </div>

            {showWhy && (
              <ul className="mt-3 bg-slate-50 rounded-xl p-3 flex flex-col gap-1.5">
                {action.reasons.map((r, i) => (
                  <li key={i} className="text-[12px] text-slate-600 flex gap-1.5">
                    <span className="text-[#6d5bf6]">•</span>
                    {r}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-4 mt-3 justify-center">
              <TextBtn label="Defer" onClick={() => action.block && deferBlock(action.block.id)} disabled={!action.block} />
              <TextBtn
                label="Replace"
                onClick={() => {
                  clearOverride()
                  replaceToday()
                }}
              />
              <TextBtn label="Cannot do" onClick={() => action.block && cannotDo(action.block.id, 'Marked cannot do from Today')} disabled={!action.block} />
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 text-center">
            <p className="text-[14px] font-medium text-[#0b0a14]">Nothing actionable right now</p>
            <p className="text-[12px] text-slate-400 mt-1">Enjoy the break — Catalyst will flag the next thing that matters.</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 mt-5 pb-4">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Your day</p>
        <div className="flex flex-col gap-1.5">
          {dayBlocks.length === 0 && <p className="text-[12.5px] text-slate-400">Nothing scheduled today yet.</p>}
          {dayBlocks.map((b) => {
            const isNow = today === toDateStr(new Date(state.now)) && nowMin >= b.startMin && nowMin < b.endMin
            return (
              <div key={b.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isNow ? 'bg-[#f2effe] border border-[#ded8fb]' : 'bg-white border border-slate-100'}`}>
                <span className="w-1 h-9 rounded-full shrink-0" style={{ background: b.color }} />
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] truncate ${b.status === 'skipped' ? 'line-through text-slate-300' : b.status === 'completed' ? 'text-slate-400' : 'text-[#0b0a14] font-medium'}`}>{b.title}</p>
                  <p className="text-[11px] text-slate-400">{minToLabel(b.startMin)}</p>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">{durationLabel(b.endMin - b.startMin)}</span>
              </div>
            )
          })}
        </div>
        {dayBlocks.length > 0 && (
          <p className="text-[11.5px] text-slate-400 mt-4 text-center">
            {(() => {
              const protectedBlocks = dayBlocks.filter((b) => b.kind === 'commitment' && b.locked)
              return protectedBlocks.length > 0 ? `${protectedBlocks.map((b) => b.title).join(', ')} remain${protectedBlocks.length === 1 ? 's' : ''} protected.` : ''
            })()}
          </p>
        )}
      </div>
    </div>
  )
}

function TextBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="text-[12px] font-medium text-slate-400 disabled:opacity-30">
      {label}
    </button>
  )
}
