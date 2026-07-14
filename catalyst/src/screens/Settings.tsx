import { useNavigate } from 'react-router-dom'
import { useCatalyst } from '../store/useCatalyst'
import TopBar from '../components/TopBar'

export default function Settings() {
  const navigate = useNavigate()
  const state = useCatalyst()
  const toggleConnector = useCatalyst((s) => s.toggleConnector)
  const updateCommitment = useCatalyst((s) => s.updateCommitment)
  const setProfile = useCatalyst((s) => s.setProfile)
  const advanceTime = useCatalyst((s) => s.advanceTime)
  const jumpToNextMorning = useCatalyst((s) => s.jumpToNextMorning)
  const resetSimClock = useCatalyst((s) => s.resetSimClock)
  const exportData = useCatalyst((s) => s.exportData)
  const resetAll = useCatalyst((s) => s.resetAll)

  const handleExport = () => {
    const json = exportData()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'catalyst-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDelete = () => {
    if (confirm('Delete all Catalyst data on this device? This cannot be undone.')) {
      resetAll()
      navigate('/')
    }
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Settings" subtitle="Control your data and behavior" back />
      <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-5">
        <Section label="Connections">
          <div className="flex flex-col gap-1.5">
            {state.connectors.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5 text-[13px]">
                <div>
                  <p className="text-[#0b0a14] font-medium">{c.name}</p>
                  <p className="text-[11px] text-slate-400">{c.status === 'connected' ? `Synced ${c.lastSync ? new Date(c.lastSync).toLocaleDateString() : ''}` : 'Not connected'}</p>
                </div>
                <button
                  onClick={() => toggleConnector(c.id)}
                  className={`text-[11.5px] font-semibold px-3 py-1.5 rounded-full ${c.status === 'connected' ? 'bg-slate-200 text-slate-600' : 'bg-[#eef0ff] text-[#6d5bf6]'}`}
                >
                  {c.status === 'connected' ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            ))}
          </div>
        </Section>

        <Section label="Protected time">
          <div className="flex flex-col gap-1.5">
            {state.commitments.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5 text-[13px]">
                <span className="text-[#0b0a14]">{c.title}</span>
                <div className="flex items-center gap-1.5">
                  <input type="time" value={mmToHHMM(c.startMin)} onChange={(e) => updateCommitment(c.id, { startMin: hhmmToMin(e.target.value) })} className="text-[11.5px] border border-slate-200 rounded px-1.5 py-1" />
                  <span className="text-slate-300">–</span>
                  <input type="time" value={mmToHHMM(c.endMin)} onChange={(e) => updateCommitment(c.id, { endMin: hhmmToMin(e.target.value) })} className="text-[11.5px] border border-slate-200 rounded px-1.5 py-1" />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section label="Quiet hours">
          <div className="flex items-center gap-2">
            <input type="time" value={mmToHHMM(state.profile.quietHoursStart)} onChange={(e) => setProfile({ quietHoursStart: hhmmToMin(e.target.value) })} className="text-[13px] border border-slate-200 rounded-lg px-2.5 py-1.5" />
            <span className="text-slate-400 text-[12px]">to</span>
            <input type="time" value={mmToHHMM(state.profile.quietHoursEnd)} onChange={(e) => setProfile({ quietHoursEnd: hhmmToMin(e.target.value) })} className="text-[13px] border border-slate-200 rounded-lg px-2.5 py-1.5" />
          </div>
        </Section>

        <Section label="Accessibility">
          <label className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5 text-[13px]">
            <span className="text-[#0b0a14]">Low-stimulation mode</span>
            <input type="checkbox" checked={state.profile.lowStimulationMode} onChange={(e) => setProfile({ lowStimulationMode: e.target.checked })} className="accent-[#6d5bf6] w-4 h-4" />
          </label>
          <p className="text-[11.5px] text-slate-400 mt-1.5">Simplifies Today, reduces animation, and shortens copy.</p>
        </Section>

        <Section label="Your data">
          <button onClick={handleExport} className="w-full text-left bg-slate-50 rounded-lg px-3 py-2.5 text-[13px] text-[#0b0a14] font-medium">
            Export my data (JSON)
          </button>
          <button onClick={handleDelete} className="w-full text-left bg-rose-50 rounded-lg px-3 py-2.5 text-[13px] text-rose-600 font-medium mt-1.5">
            Delete account and all data
          </button>
        </Section>

        <Section label="Simulated clock (prototype only)">
          <p className="text-[12px] text-slate-500 mb-2">
            {new Date(state.now).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <ClockBtn label="+30 min" onClick={() => advanceTime(30)} />
            <ClockBtn label="+2 hr" onClick={() => advanceTime(120)} />
            <ClockBtn label="Next morning" onClick={() => jumpToNextMorning()} />
            <ClockBtn label="Reset" onClick={() => resetSimClock()} />
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">Moves the demo clock forward so you can see Catalyst replan.</p>
        </Section>
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

function ClockBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-[11.5px] font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">
      {label}
    </button>
  )
}

function mmToHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}
function hhmmToMin(v: string) {
  const [h, m] = v.split(':').map(Number)
  return h * 60 + m
}
