import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCatalyst } from '../store/useCatalyst'
import { durationLabel, formatDayLabel, minToLabel } from '../lib/dates'
import TopBar from '../components/TopBar'

const SCENARIOS = [
  { id: 'skip', label: 'Skip' },
  { id: 'shorten', label: 'Shorten' },
  { id: 'move', label: 'Move' },
] as const

const VERDICT_STYLE: Record<string, string> = {
  recommended: 'bg-emerald-500 text-white',
  good: 'bg-sky-100 text-sky-700',
  risky: 'bg-rose-100 text-rose-700',
}

export default function WhatIf() {
  const { blockId } = useParams()
  const navigate = useNavigate()
  const block = useCatalyst((s) => s.blocks.find((b) => b.id === blockId))
  const previewWhatIf = useCatalyst((s) => s.previewWhatIf)
  const applyWhatIfAlternative = useCatalyst((s) => s.applyWhatIfAlternative)
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]['id']>('skip')

  const result = useMemo(() => (blockId ? previewWhatIf(blockId, scenario) : null), [blockId, scenario, previewWhatIf])

  if (!block || !result) {
    return (
      <div className="h-full flex flex-col">
        <TopBar title="What if…" back />
        <p className="px-6 text-slate-400 text-sm">This session is no longer on your plan.</p>
      </div>
    )
  }

  const apply = (altId: string) => {
    applyWhatIfAlternative(block.id, altId)
    navigate(-1)
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar title="What if…" subtitle="Explore a change before committing" back />
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold text-[#0b0a14]">{result.scenarioLabel}</p>
          </div>
          <p className="text-[12px] text-slate-400 mt-0.5">{durationLabel(block.endMin - block.startMin)} · currently scheduled at {minToLabel(block.startMin)}</p>
          <div className="flex gap-1.5 mt-3">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setScenario(s.id)}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium ${scenario === s.id ? 'bg-[#0b0a14] text-white' : 'bg-slate-100 text-slate-500'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-5 mb-2">Projected impact</p>
        <div className="flex flex-col gap-1.5">
          <ImpactRow label="Deadline risk" value={`+${result.deadlineRiskDeltaPct}%`} bad={result.deadlineRiskDeltaPct > 0} />
          <ImpactRow
            label={`${formatDayLabel(block.date)} load`}
            value={`${result.thursdayLoadDeltaMin >= 0 ? '+' : ''}${durationLabel(Math.abs(result.thursdayLoadDeltaMin))}`}
            bad={result.thursdayLoadDeltaMin > 0}
          />
          <ImpactRow label="Sleep impact" value={`${result.sleepImpactMin} min`} bad={result.sleepImpactMin < 0} />
          <ImpactRow label="Weekly cushion" value={`${result.cushionBeforePct}% → ${result.cushionAfterPct}%`} bad={result.cushionAfterPct < result.cushionBeforePct} />
        </div>

        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-5 mb-2">Safer alternatives</p>
        <div className="flex flex-col gap-1.5">
          {result.alternatives.map((alt) => (
            <button key={alt.id} onClick={() => apply(alt.id)} className="w-full flex items-center justify-between bg-white border border-slate-100 rounded-xl px-3.5 py-3 shadow-sm text-left">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#0b0a14]">{alt.label}</p>
                <p className="text-[11.5px] text-slate-400">{alt.detail}</p>
              </div>
              <span className={`text-[10.5px] font-semibold px-2 py-1 rounded-full shrink-0 capitalize ${VERDICT_STYLE[alt.verdict]}`}>{alt.verdict}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="shrink-0 px-6 pb-6 pt-2 border-t border-slate-100">
        <button onClick={() => apply(result.alternatives[0]?.id ?? 'accept')} className="w-full bg-[#6d5bf6] text-white font-semibold py-3.5 rounded-2xl text-[15px]">
          Apply recommended option
        </button>
      </div>
    </div>
  )
}

function ImpactRow({ label, value, bad }: { label: string; value: string; bad: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 ${bad ? 'bg-rose-50' : 'bg-emerald-50'}`}>
      <span className="text-[12.5px] text-slate-600">{label}</span>
      <span className={`text-[13px] font-semibold ${bad ? 'text-rose-600' : 'text-emerald-700'}`}>{value}</span>
    </div>
  )
}
