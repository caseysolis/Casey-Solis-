import { useNavigate } from 'react-router-dom'
import { useCatalyst } from '../store/useCatalyst'

export default function Connect() {
  const navigate = useNavigate()
  const connectors = useCatalyst((s) => s.connectors)
  const connect = useCatalyst((s) => s.connectConnector)

  const lms = connectors.filter((c) => c.kind === 'lms')
  const cal = connectors.filter((c) => c.kind === 'calendar')
  const anyLmsConnected = lms.some((c) => c.status === 'connected')

  return (
    <div className="h-full flex flex-col px-6 pt-6 pb-6">
      <h1 className="text-[22px] font-semibold text-[#0b0a14]">Connect your college</h1>
      <p className="text-[13px] text-slate-500 mt-1">Import once. Catalyst keeps it current.</p>

      <div className="mt-4 bg-[#eef0ff] border border-[#d9dcff] rounded-2xl p-3.5 flex items-start gap-3">
        <span className="text-[#6d5bf6] mt-0.5">🛡️</span>
        <div>
          <p className="text-[13px] font-semibold text-[#0b0a14]">Read-only by default</p>
          <p className="text-[12px] text-slate-500 mt-0.5">Catalyst requests only the access needed to build your plan. You can disconnect anytime.</p>
        </div>
      </div>

      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-5 mb-2">Learning platform</p>
      <div className="flex flex-col gap-2">
        {lms.map((c) => (
          <ConnectorRow key={c.id} name={c.name} sub="Courses, assignments, calendar" connected={c.status === 'connected'} onConnect={() => connect(c.id)} />
        ))}
      </div>

      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-5 mb-2">Calendars</p>
      <div className="flex flex-col gap-2">
        {cal.map((c) => (
          <ConnectorRow key={c.id} name={c.name} sub="Availability" connected={c.status === 'connected'} onConnect={() => connect(c.id)} compact />
        ))}
      </div>

      <div className="flex-1" />

      <button
        onClick={() => navigate('/syllabus')}
        className="w-full bg-[#6d5bf6] hover:bg-[#5c4ce0] transition-colors text-white font-semibold py-3.5 rounded-2xl text-[15px] mt-6"
      >
        Continue
      </button>
      <button onClick={() => navigate('/syllabus')} className="text-center text-[12px] text-slate-400 mt-3">
        {anyLmsConnected ? 'Add another course from a syllabus' : 'You can also upload a PDF syllabus without connecting an LMS'}
      </button>
    </div>
  )
}

function ConnectorRow({ name, sub, connected, onConnect, compact }: { name: string; sub: string; connected: boolean; onConnect: () => void; compact?: boolean }) {
  return (
    <div className={`flex items-center justify-between bg-white border border-black/5 rounded-xl px-3.5 ${compact ? 'py-2.5' : 'py-3'} shadow-sm`}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-[13px] font-semibold text-slate-500">{name[0]}</div>
        <div>
          <p className="text-[13.5px] font-medium text-[#0b0a14]">{name}</p>
          <p className="text-[11.5px] text-slate-400">{sub}</p>
        </div>
      </div>
      {connected ? (
        <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">Connected</span>
      ) : (
        <button onClick={onConnect} className="text-[12px] font-semibold text-[#6d5bf6] bg-[#eef0ff] px-3 py-1.5 rounded-full">
          Connect
        </button>
      )}
    </div>
  )
}
