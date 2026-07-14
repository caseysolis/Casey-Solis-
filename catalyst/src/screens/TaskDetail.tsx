import { useParams } from 'react-router-dom'
import { useCatalyst } from '../store/useCatalyst'
import { useUi } from '../store/useUi'
import { durationLabel, formatDayLabel } from '../lib/dates'
import { TASK_TYPE_LABEL } from '../lib/constants'
import { remainingP80 } from '../lib/engine'
import TopBar from '../components/TopBar'

export default function TaskDetail() {
  const { taskId } = useParams()
  const task = useCatalyst((s) => s.tasks.find((t) => t.id === taskId))
  const course = useCatalyst((s) => s.courses.find((c) => c.id === task?.courseId))
  const blocks = useCatalyst((s) => s.blocks)
  const allTasks = useCatalyst((s) => s.tasks)
  const attachWbs = useCatalyst((s) => s.attachWbs)
  const toggleStageComplete = useCatalyst((s) => s.toggleStageComplete)
  const startAdHoc = useCatalyst((s) => s.startAdHoc)
  const openFocus = useUi((s) => s.openFocus)

  if (!task) return <div className="p-6 text-slate-400 text-sm">Task not found.</div>

  const remaining = remainingP80(task)
  const doneMin = task.actualMinutes ?? 0
  const pctComplete = task.status === 'completed' ? 100 : Math.min(95, Math.round((doneMin / Math.max(task.p50Minutes, 1)) * 100))
  const overdue = task.status !== 'completed' && new Date(task.dueAt) < new Date()

  const blockedBy = task.dependsOn.map((id) => allTasks.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t && t.status !== 'completed')

  const nextStage = task.wbs?.find((s) => s.status !== 'completed')
  const targetLabel = nextStage ? nextStage.title : task.title
  const targetDuration = nextStage ? nextStage.p80Minutes : Math.min(task.maxSessionMin, Math.max(task.minSessionMin, remaining || task.p50Minutes))

  const handleWork = () => {
    const existingBlock = blocks.find(
      (b) => b.status === 'planned' && ((nextStage && b.kind === 'wbs' && b.refId === nextStage.id) || (!nextStage && b.kind === 'task' && b.refId === task.id)),
    )
    if (existingBlock) openFocus(existingBlock.id)
    else {
      const id = startAdHoc(task.id, targetDuration, nextStage?.id)
      if (id) openFocus(id, targetDuration)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar title={task.title} subtitle={`${course?.code ?? ''} · Due ${formatDayLabel(task.dueAt.slice(0, 10))}`} back />
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        {overdue && <div className="bg-rose-50 text-rose-700 text-[12px] font-medium rounded-lg px-3 py-2 mb-3">Past due</div>}
        {blockedBy.length > 0 && (
          <div className="bg-amber-50 text-amber-700 text-[12px] rounded-lg px-3 py-2 mb-3">
            Blocked until you finish: {blockedBy.map((t) => t.title).join(', ')}
          </div>
        )}

        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Estimated remaining effort</p>
          <p className="text-[24px] font-semibold text-[#0b0a14] mt-1">{durationLabel(remaining)}</p>
          <p className="text-[12px] text-slate-400">P50–P80 range {durationLabel(task.p50Minutes)}–{durationLabel(task.p80Minutes)}</p>
          <div className="h-2 bg-slate-100 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-[#6d5bf6]" style={{ width: `${pctComplete}%` }} />
          </div>
          <p className="text-[11.5px] text-slate-400 mt-1">{pctComplete}% complete · {task.confidence} confidence estimate</p>
        </div>

        <div className="flex items-center justify-between mt-4">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Work breakdown</p>
          {!task.wbs && (task.type === 'project' || task.type === 'paper') && (
            <button onClick={() => attachWbs(task.id)} className="text-[11.5px] font-semibold text-[#6d5bf6]">
              Break into stages
            </button>
          )}
        </div>

        {task.wbs ? (
          <div className="flex flex-col gap-1.5 mt-2">
            {task.wbs
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((st) => (
                <button
                  key={st.id}
                  onClick={() => toggleStageComplete(task.id, st.id)}
                  className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-3.5 py-2.5 shadow-sm text-left"
                >
                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${st.status === 'completed' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                    {st.status === 'completed' && <span className="text-white text-[9px]">✓</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] ${st.status === 'completed' ? 'text-slate-400 line-through' : 'text-[#0b0a14] font-medium'}`}>{st.title}</p>
                    {st.dueBy && <p className="text-[11px] text-slate-400">{formatDayLabel(st.dueBy)}</p>}
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">{durationLabel(st.p80Minutes)}</span>
                </button>
              ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-slate-400 mt-2">This task launches its next stage directly — no breakdown needed.</p>
        )}

        <div className="mt-5 bg-[#f2effe] border border-[#ded8fb] rounded-2xl p-3.5 flex items-start gap-3">
          <span className="text-[#6d5bf6] mt-0.5">📈</span>
          <div>
            <p className="text-[13px] font-semibold text-[#0b0a14]">Grade impact</p>
            <p className="text-[12px] text-slate-500 mt-0.5">
              {task.gradeWeightPct ? `Worth ${task.gradeWeightPct}% of your ${course?.code ?? 'course'} grade.` : `Contributes to your ${course?.code ?? 'course'} grade.`}
              {' '}{TASK_TYPE_LABEL[task.type]} · {task.source === 'syllabus' ? 'from your syllabus' : task.source === 'lms' ? 'from your LMS' : 'added by you'}.
            </p>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-6 pb-6 pt-2 border-t border-slate-100">
        <button
          onClick={handleWork}
          disabled={task.status === 'completed' || blockedBy.length > 0}
          className="w-full bg-[#6d5bf6] disabled:opacity-30 text-white font-semibold py-3.5 rounded-2xl text-[15px]"
        >
          {task.status === 'completed' ? 'Completed' : `Work on ${targetLabel}`}
        </button>
      </div>
    </div>
  )
}
