import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalyst } from '../store/useCatalyst'
import { DEMO_COURSES } from '../data/demoSyllabi'
import TopBar from '../components/TopBar'

export default function SyllabusUpload() {
  const navigate = useNavigate()
  const pending = useCatalyst((s) => s.pendingImport)
  const addSyllabusCourse = useCatalyst((s) => s.addSyllabusCourse)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [lastAdded, setLastAdded] = useState<number | null>(null)

  const fillSample = () => {
    const sample = DEMO_COURSES[(pending?.courses.length ?? 0) % DEMO_COURSES.length]
    setCode(sample.meta.code)
    setName(sample.meta.name)
    setText(sample.syllabusText)
  }

  const handleAdd = () => {
    if (!text.trim()) return
    const { added } = addSyllabusCourse({ code, name, text })
    setLastAdded(added)
    setCode('')
    setName('')
    setText('')
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Add a syllabus" subtitle="Paste the text — Catalyst reads dates, weights, and hidden work." back />
      <div className="flex-1 overflow-y-auto px-6 pb-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Course code (e.g. CHEM 101)" className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px]" />
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Course name" className="border border-slate-200 rounded-xl px-3 py-2.5 text-[13px]" />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your syllabus schedule here — assignment names, due dates, and weights work best."
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] h-40 resize-none font-mono"
        />
        <button onClick={fillSample} className="self-start text-[12px] font-medium text-[#6d5bf6]">
          Use a sample syllabus instead
        </button>
        <button
          onClick={handleAdd}
          disabled={!text.trim()}
          className="w-full bg-[#0b0a14] disabled:opacity-30 text-white font-semibold py-3 rounded-2xl text-[14px]"
        >
          Extract and add course
        </button>
        {lastAdded != null && (
          <p className="text-[12px] text-emerald-600 text-center">Found {lastAdded} item{lastAdded === 1 ? '' : 's'}. Add another course, or continue.</p>
        )}

        {pending && pending.courses.length > 0 && (
          <div className="mt-2 border-t border-slate-100 pt-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Added ({pending.courses.length})</p>
            <div className="flex flex-col gap-1.5">
              {pending.courses.map((c) => (
                <div key={c.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-[13px]">
                  <span className="font-medium text-[#0b0a14]">{c.code}</span>
                  <span className="text-slate-400 text-[11px]">{pending.tasks.filter((t) => t.courseId === c.id).length} items</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="shrink-0 px-6 pb-6 pt-2">
        <button
          onClick={() => navigate('/import-review')}
          disabled={!pending || pending.courses.length === 0}
          className="w-full bg-[#6d5bf6] disabled:opacity-30 text-white font-semibold py-3.5 rounded-2xl text-[15px]"
        >
          Review import
        </button>
      </div>
    </div>
  )
}
