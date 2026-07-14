import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import PhoneShell from './components/PhoneShell'
import TabBar from './components/TabBar'
import FocusSession from './components/FocusSession'
import { useCatalyst } from './store/useCatalyst'

import Welcome from './screens/Welcome'
import Connect from './screens/Connect'
import SyllabusUpload from './screens/SyllabusUpload'
import ImportReview from './screens/ImportReview'
import Availability from './screens/Availability'
import PlanPreview from './screens/PlanPreview'
import Today from './screens/Today'
import Plan from './screens/Plan'
import Tasks from './screens/Tasks'
import TaskDetail from './screens/TaskDetail'
import WhatIf from './screens/WhatIf'
import CoachScreen from './screens/Coach'
import Insights from './screens/Insights'
import Settings from './screens/Settings'

function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      <TabBar />
    </>
  )
}

function Gate() {
  const onboarded = useCatalyst((s) => s.onboarded)
  return <Navigate to={onboarded ? '/today' : '/welcome'} replace />
}

function Shell() {
  const location = useLocation()
  const dark = location.pathname === '/welcome' || location.pathname === '/'
  return (
    <PhoneShell dark={dark}>
      <Routes>
          <Route path="/" element={<Gate />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/syllabus" element={<SyllabusUpload />} />
          <Route path="/import-review" element={<ImportReview />} />
          <Route path="/availability" element={<Availability />} />
          <Route path="/plan-preview" element={<PlanPreview />} />

          <Route path="/today" element={<MainLayout><Today /></MainLayout>} />
          <Route path="/plan" element={<MainLayout><Plan /></MainLayout>} />
          <Route path="/tasks" element={<MainLayout><Tasks /></MainLayout>} />
          <Route path="/insights" element={<MainLayout><Insights /></MainLayout>} />

          <Route path="/tasks/:taskId" element={<TaskDetail />} />
          <Route path="/whatif/:blockId" element={<WhatIf />} />
          <Route path="/coach" element={<CoachScreen />} />
          <Route path="/settings" element={<Settings />} />

        <Route path="*" element={<Gate />} />
      </Routes>
      <FocusSession />
    </PhoneShell>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
