import { useEffect, useRef, useState } from 'react'
import { useUi } from '../store/useUi'
import { useCatalyst } from '../store/useCatalyst'
import { durationLabel } from '../lib/dates'

export default function FocusSession() {
  const activeFocusBlockId = useUi((s) => s.activeFocusBlockId)
  const seedMinutes = useUi((s) => s.focusSeedMinutes)
  const closeFocus = useUi((s) => s.closeFocus)
  const block = useCatalyst((s) => s.blocks.find((b) => b.id === activeFocusBlockId))
  const startBlock = useCatalyst((s) => s.startBlock)
  const completeBlock = useCatalyst((s) => s.completeBlock)

  const [elapsedSec, setElapsedSec] = useState(0)
  const [paused, setPaused] = useState(false)
  const [targetMin, setTargetMin] = useState(0)
  const [phase, setPhase] = useState<'active' | 'result'>('active')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (block) {
      setTargetMin(seedMinutes ?? block.endMin - block.startMin)
      setElapsedSec(0)
      setPaused(false)
      setPhase('active')
      startBlock(block.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block?.id])

  useEffect(() => {
    if (!block || paused || phase !== 'active') return
    timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [block, paused, phase])

  if (!block) return null

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
  const ss = String(elapsedSec % 60).padStart(2, '0')
  const elapsedMin = Math.max(1, Math.round(elapsedSec / 60))

  const finish = (result: 'completed' | 'partial' | 'blocked', energy?: 1 | 2 | 3 | 4 | 5) => {
    completeBlock(block.id, result, elapsedMin, energy)
    closeFocus()
  }

  return (
    <div className="absolute inset-0 z-40 bg-[#0b0a14] text-white flex flex-col">
      <div className="flex justify-end px-5 pt-4">
        <button onClick={() => { setPhase('result') }} className="text-white/50 text-sm">
          End
        </button>
      </div>

      {phase === 'active' ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6">
          <p className="text-white/50 text-[13px] uppercase tracking-wide">{block.title}</p>
          <p className="text-6xl font-semibold tabular-nums tracking-tight">{mm}:{ss}</p>
          <p className="text-white/40 text-[13px]">Target {durationLabel(targetMin)}</p>
          <div className="flex gap-3 mt-2">
            <button onClick={() => setPaused((p) => !p)} className="px-5 py-2.5 rounded-full bg-white/10 text-[13px] font-medium">
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button onClick={() => setTargetMin((t) => t + 10)} className="px-5 py-2.5 rounded-full bg-white/10 text-[13px] font-medium">
              Extend 10m
            </button>
            <button onClick={() => setTargetMin((t) => Math.max(10, t - 10))} className="px-5 py-2.5 rounded-full bg-white/10 text-[13px] font-medium">
              Shorten
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center px-8 gap-4">
          <p className="text-center text-white/60 text-[13px]">You focused for {durationLabel(elapsedMin)}. How did it go?</p>
          <button onClick={() => finish('completed')} className="w-full bg-emerald-500 text-white font-semibold py-3.5 rounded-2xl text-[15px]">
            Completed
          </button>
          <button onClick={() => finish('partial')} className="w-full bg-white/10 text-white font-semibold py-3.5 rounded-2xl text-[15px]">
            Made progress, not finished
          </button>
          <button onClick={() => finish('blocked')} className="w-full bg-white/10 text-white font-semibold py-3.5 rounded-2xl text-[15px]">
            Couldn't do it
          </button>
        </div>
      )}
    </div>
  )
}
