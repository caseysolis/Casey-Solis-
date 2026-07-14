import { useNavigate } from 'react-router-dom'
import { useCatalyst } from '../store/useCatalyst'
import TopBar from '../components/TopBar'
import { TASK_TYPE_LABEL } from '../lib/constants'
import { formatShortDate } from '../lib/dates'
import type { CatalystTask } from '../lib/types'

export default function ImportReview() {
  const navigate = useNavigate()
  const pending = useCatalyst((s) => s.pendingImport)
  const confirmImport = useCatalyst((s) => s.confirmImport)
  const updateDraftTask = useCatalyst((s) => s.updateDraftTask)
  const removeDraftTask = useCatalyst((s) => s.removeDraftTask)

  if (!pending || pending.courses.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-slate-500 text-sm">Nothing to review yet.</p>
        <button onClick={() => navigate('/syllabus')} className="text-[#6d5bf6] font-semibold text-sm">Add a syllabus</button>
      </div>
    )
  }

  const tasks = pending.tasks
  const needsConfirm = tasks.filter((t) => t.confidence !== 'high')
  const examCount = tasks.filter((t) => t.type === 'exam').length
  const withHiddenWork = tasks.find((t) => t.hiddenWork)
  const courseLabel = pending.courses.map((c) => c.code).join(' · ')

  const handleConfirm = () => {
    confirmImport()
    navigate('/availability')
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Review the import" subtitle={courseLabel} back />
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3.5 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[13px]">✓</div>
          <div>
            <p className="text-[13.5px] font-semibold text-[#0b0a14]">Syllabus processed</p>
            <p className="text-[12px] text-slate-500">{tasks.length} deadlines · {examCount} exam{examCount === 1 ? '' : 's'} · {pending.courses.length} course{pending.courses.length === 1 ? '' : 's'}</p>
          </div>
        </div>

        {needsConfirm.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-5 mb-2">Needs your confirmation ({needsConfirm.length})</p>
            <div className="flex flex-col gap-2">
              {needsConfirm.map((t) => (
                <DraftRow key={t.id} task={t} onEdit={(patch) => updateDraftTask(t.id, patch)} onRemove={() => removeDraftTask(t.id)} />
              ))}
            </div>
          </>
        )}

        {withHiddenWork && (
          <div className="mt-5 bg-[#f2effe] border border-[#ded8fb] rounded-2xl p-3.5 flex items-start gap-3">
            <span className="text-[#6d5bf6] mt-0.5">⚡</span>
            <div>
              <p className="text-[13px] font-semibold text-[#0b0a14]">Catalyst found hidden work</p>
              <p className="text-[12px] text-slate-500 mt-0.5">{withHiddenWork.hiddenWork}</p>
            </div>
          </div>
        )}

        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-5 mb-2">All items ({tasks.length})</p>
        <div className="flex flex-col gap-1.5">
          {tasks
            .slice()
            .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
            .map((t) => (
              <div key={t.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-[12.5px]">
                <span className="text-[#0b0a14] truncate pr-2">{t.title}</span>
                <span className="text-slate-400 shrink-0">{formatShortDate(t.dueAt.slice(0, 10))}</span>
              </div>
            ))}
        </div>
      </div>
      <div className="shrink-0 px-6 pb-6 pt-2 border-t border-slate-100">
        <button onClick={handleConfirm} className="w-full bg-[#6d5bf6] text-white font-semibold py-3.5 rounded-2xl text-[15px]">
          Confirm and build plan
        </button>
        <p className="text-center text-[11px] text-slate-400 mt-2">Nothing is scheduled until you approve the import.</p>
      </div>
    </div>
  )
}

function DraftRow({ task, onEdit, onRemove }: { task: CatalystTask; onEdit: (patch: Partial<CatalystTask>) => void; onRemove: () => void }) {
  const badgeColor = task.confidence === 'low' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'
  return (
    <div className="bg-white border border-slate-100 rounded-xl px-3.5 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-[#0b0a14] truncate">{task.title}</p>
          <p className="text-[11.5px] text-slate-400 mt-0.5">{TASK_TYPE_LABEL[task.type]} · {formatShortDate(task.dueAt.slice(0, 10))}</p>
          {task.notes && <p className="text-[11px] text-amber-600 mt-1">{task.notes}</p>}
        </div>
        <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${badgeColor}`}>{task.confidence}</span>
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        <input
          type="date"
          value={task.dueAt.slice(0, 10)}
          onChange={(e) => onEdit({ dueAt: `${e.target.value}T${task.dueAt.slice(11)}` })}
          className="text-[12px] border border-slate-200 rounded-lg px-2 py-1"
        />
        <button onClick={() => onEdit({ confidence: 'high' })} className="text-[12px] font-semibold text-[#6d5bf6] ml-auto">
          Confirm
        </button>
        <button onClick={onRemove} className="text-[12px] text-slate-400">
          Remove
        </button>
      </div>
    </div>
  )
}
