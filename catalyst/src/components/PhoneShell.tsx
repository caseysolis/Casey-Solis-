import type { ReactNode } from 'react'

export default function PhoneShell({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#eceafb] py-6 px-3">
      <div
        className={`relative w-full max-w-[420px] h-[860px] max-h-[92vh] rounded-[2.5rem] shadow-2xl border-8 border-black overflow-hidden flex flex-col ${dark ? 'bg-[#0b0a14]' : 'bg-[#f7f7fb]'}`}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-30" />
        <div className={`flex items-center justify-between px-6 pt-3 pb-1 text-[13px] font-semibold shrink-0 ${dark ? 'text-white' : 'text-[#0b0a14]'}`}>
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <svg width="16" height="11" viewBox="0 0 16 11" fill="none"><rect x="0" y="6" width="3" height="5" rx="0.5" fill="currentColor" /><rect x="4.5" y="4" width="3" height="7" rx="0.5" fill="currentColor" /><rect x="9" y="2" width="3" height="9" rx="0.5" fill="currentColor" /><rect x="13.5" y="0" width="2.5" height="11" rx="0.5" fill="currentColor" /></svg>
            <svg width="15" height="11" viewBox="0 0 15 11" fill="none"><path d="M7.5 0C10.5 0 13 1.3 15 3.4L13.6 5C12 3.3 9.9 2.3 7.5 2.3S3 3.3 1.4 5L0 3.4C2 1.3 4.5 0 7.5 0Z" fill="currentColor" /><path d="M3.5 6.3C4.7 5.1 6 4.5 7.5 4.5S10.3 5.1 11.5 6.3L10.1 7.9C9.4 7.2 8.5 6.8 7.5 6.8S5.6 7.2 4.9 7.9L3.5 6.3Z" fill="currentColor" /><circle cx="7.5" cy="9.3" r="1.5" fill="currentColor" /></svg>
            <svg width="24" height="11" viewBox="0 0 24 11" fill="none"><rect x="0.5" y="0.5" width="20" height="10" rx="2.5" stroke="currentColor" /><rect x="2" y="2" width="17" height="7" rx="1.5" fill="currentColor" /><rect x="21.5" y="3.5" width="1.5" height="4" rx="0.7" fill="currentColor" /></svg>
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  )
}
