import { useEffect, useRef, useState } from 'react'
import { useCatalyst } from '../store/useCatalyst'
import TopBar from '../components/TopBar'

const PROMPTS = ['Why this task now?', "What's at risk this week?", 'Can I take Friday off?', 'Rebalance my week', 'Break down my final paper']

export default function Coach() {
  const history = useCatalyst((s) => s.coachHistory)
  const pending = useCatalyst((s) => s.coachPending)
  const sendCoachMessage = useCatalyst((s) => s.sendCoachMessage)
  const confirmCoachPending = useCatalyst((s) => s.confirmCoachPending)
  const dismissCoachPending = useCatalyst((s) => s.dismissCoachPending)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [history, pending])

  const send = (text: string) => {
    if (!text.trim()) return
    sendCoachMessage(text.trim())
    setInput('')
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Catalyst Coach" subtitle="Planning help, not homework answers" back />
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-3 flex flex-col gap-3">
        {history.length === 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-[13px] text-slate-500">
            Ask me why something's scheduled, what's at risk, or how to rebalance your week.
          </div>
        )}
        {history.map((m, i) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-snug ${m.role === 'user' ? 'bg-[#6d5bf6] text-white rounded-br-sm' : 'bg-white border border-slate-100 text-[#0b0a14] rounded-bl-sm shadow-sm'}`}>
              {m.text}
              {m.preview && pending && i === history.length - 1 && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex gap-2">
                  <button onClick={confirmCoachPending} className="flex-1 bg-[#0b0a14] text-white text-[12px] font-semibold py-2 rounded-lg">
                    Show me the options
                  </button>
                  <button onClick={dismissCoachPending} className="px-3 text-[12px] text-slate-400">
                    Not now
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 px-5 pb-2 flex gap-1.5 overflow-x-auto">
        {PROMPTS.map((p) => (
          <button key={p} onClick={() => send(p)} className="shrink-0 text-[11.5px] font-medium text-[#6d5bf6] bg-[#f2effe] px-3 py-1.5 rounded-full whitespace-nowrap">
            {p}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="shrink-0 px-5 pb-6 pt-1 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your plan…"
          className="flex-1 border border-slate-200 rounded-full px-4 py-2.5 text-[13.5px]"
        />
        <button type="submit" className="w-10 h-10 rounded-full bg-[#6d5bf6] text-white flex items-center justify-center shrink-0">
          ↑
        </button>
      </form>
    </div>
  )
}
