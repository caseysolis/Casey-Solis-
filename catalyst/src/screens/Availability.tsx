import { useNavigate } from 'react-router-dom'
import { useCatalyst } from '../store/useCatalyst'
import TopBar from '../components/TopBar'
import { minToLabel } from '../lib/dates'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Availability() {
  const navigate = useNavigate()
  const profile = useCatalyst((s) => s.profile)
  const setProfile = useCatalyst((s) => s.setProfile)
  const commitments = useCatalyst((s) => s.commitments)
  const updateCommitment = useCatalyst((s) => s.updateCommitment)
  const buildPreviewPlan = useCatalyst((s) => s.buildPreviewPlan)

  const sleep = commitments.find((c) => c.category === 'sleep')

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Your rhythm" subtitle="Defaults are ready. Adjust anything that's off." back />
      <div className="flex-1 overflow-y-auto px-6 pb-4 flex flex-col gap-5">
        <Section label="Sleep window">
          <div className="flex items-center gap-2">
            <TimeInput value={sleep?.startMin ?? 1380} onChange={(v) => sleep && updateCommitment(sleep.id, { startMin: v })} />
            <span className="text-slate-400 text-[12px]">to</span>
            <TimeInput value={sleep?.endMin ?? 420} onChange={(v) => sleep && updateCommitment(sleep.id, { endMin: v })} />
          </div>
          <p className="text-[11.5px] text-slate-400 mt-1.5">Catalyst never schedules study time here.</p>
        </Section>

        <Section label="Focus style">
          <div className="flex gap-2">
            {(['morning', 'flexible', 'evening'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setProfile({ chronotype: c })}
                className={`flex-1 py-2.5 rounded-xl text-[12.5px] font-medium capitalize border ${
                  profile.chronotype === c ? 'bg-[#0b0a14] text-white border-[#0b0a14]' : 'bg-white text-slate-500 border-slate-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </Section>

        <Section label={`Typical focus session — ${profile.focusDurationMin} min`}>
          <input
            type="range"
            min={25}
            max={90}
            step={5}
            value={profile.focusDurationMin}
            onChange={(e) => setProfile({ focusDurationMin: Number(e.target.value) })}
            className="w-full accent-[#6d5bf6]"
          />
        </Section>

        <Section label="Preferred day off">
          <div className="flex gap-1.5">
            {DAYS.map((d, i) => (
              <button
                key={d}
                onClick={() => setProfile({ preferredDaysOff: [i] })}
                className={`flex-1 py-2 rounded-lg text-[11.5px] font-semibold ${
                  profile.preferredDaysOff.includes(i) ? 'bg-[#6d5bf6] text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </Section>

        <Section label="Quiet hours">
          <div className="flex items-center gap-2">
            <TimeInput value={profile.quietHoursStart} onChange={(v) => setProfile({ quietHoursStart: v })} />
            <span className="text-slate-400 text-[12px]">to</span>
            <TimeInput value={profile.quietHoursEnd} onChange={(v) => setProfile({ quietHoursEnd: v })} />
          </div>
          <p className="text-[11.5px] text-slate-400 mt-1.5">No routine notifications or scheduled work in this window.</p>
        </Section>

        <Section label="Already protected">
          <div className="flex flex-col gap-1.5">
            {commitments
              .filter((c) => c.category !== 'sleep')
              .map((c) => (
                <div key={c.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-[12.5px]">
                  <span className="text-[#0b0a14]">{c.title}</span>
                  <span className="text-slate-400">{minToLabel(c.startMin)}–{minToLabel(c.endMin)}</span>
                </div>
              ))}
          </div>
          <p className="text-[11.5px] text-slate-400 mt-1.5">Edit or add more anytime in Settings.</p>
        </Section>
      </div>
      <div className="shrink-0 px-6 pb-6 pt-2">
        <button
          onClick={() => {
            buildPreviewPlan()
            navigate('/plan-preview')
          }}
          className="w-full bg-[#6d5bf6] text-white font-semibold py-3.5 rounded-2xl text-[15px]"
        >
          Build my plan
        </button>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{label}</p>
      {children}
    </div>
  )
}

function TimeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const h = Math.floor(value / 60)
  const m = value % 60
  return (
    <input
      type="time"
      value={`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`}
      onChange={(e) => {
        const [hh, mm] = e.target.value.split(':').map(Number)
        onChange(hh * 60 + mm)
      }}
      className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px]"
    />
  )
}
