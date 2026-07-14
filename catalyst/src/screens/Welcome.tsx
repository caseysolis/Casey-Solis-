import { useNavigate } from 'react-router-dom'
import { useCatalyst } from '../store/useCatalyst'

export default function Welcome() {
  const navigate = useNavigate()
  const loadDemo = useCatalyst((s) => s.loadDemoImport)
  const startManual = useCatalyst((s) => s.startManualImport)

  return (
    <div className="h-full flex flex-col justify-between px-7 pb-10 pt-6 text-white bg-gradient-to-b from-[#100c22] via-[#131332] to-[#0c1f26]">
      <div />
      <div className="flex flex-col items-center text-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7c6df6] to-[#38d0d0] flex items-center justify-center text-3xl font-bold shadow-lg shadow-purple-900/40">
          C
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Catalyst</h1>
        <p className="text-white/60 text-[15px]">Know what to do next.</p>

        <div className="w-full flex flex-col gap-2.5 mt-6">
          <Feature icon="📖" label="Reads every syllabus" />
          <Feature icon="📅" label="Builds a realistic semester" />
          <Feature icon="⚡" label="Replans when life changes" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={() => {
            loadDemo()
            navigate('/import-review')
          }}
          className="w-full bg-[#6d5bf6] hover:bg-[#5c4ce0] transition-colors text-white font-semibold py-3.5 rounded-2xl text-[15px] shadow-lg shadow-purple-900/30"
        >
          Build my semester (demo)
        </button>
        <button
          onClick={() => {
            startManual()
            navigate('/connect')
          }}
          className="w-full bg-white/10 hover:bg-white/15 transition-colors text-white font-medium py-3.5 rounded-2xl text-[15px] border border-white/10"
        >
          Connect my own courses
        </button>
        <p className="text-center text-white/40 text-[12px] mt-1">Takes about 10 minutes. You stay in control.</p>
      </div>
    </div>
  )
}

function Feature({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3 text-left">
      <span className="text-lg">{icon}</span>
      <span className="text-[14px] text-white/80">{label}</span>
    </div>
  )
}
