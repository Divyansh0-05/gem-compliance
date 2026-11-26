import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { FileCheck2, LayoutDashboard, FileText, ClipboardList, LogOut, Menu, X, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth'

const ROLE_LABEL = { BUYER: 'Buyer', BIDDER: 'Bidder', EVALUATOR: 'Evaluator' }

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  if (!user) return null
  const bidder = user.role === 'BIDDER'
  const links = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/tenders', label: bidder ? 'Open Tenders' : 'Tenders', icon: FileText },
    { to: '/bids', label: bidder ? 'My Bids' : 'Bids & Reports', icon: ClipboardList },
  ]
  const initials = (user.full_name || user.username).slice(0, 2).toUpperCase()

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-900 text-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="rounded-lg bg-white/10 p-2"><ShieldCheck className="h-5 w-5" /></div>
        <div>
          <div className="text-base font-bold leading-tight">GeM BidCheck</div>
          <div className="text-[11px] text-blue-200">Compliance Verification</div>
        </div>
      </div>
      <nav className="mt-2 flex-1 space-y-1 px-3">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setOpen(false)}
            className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-white/15 text-white' : 'text-blue-100 hover:bg-white/10'}`}>
            <l.icon className="h-[18px] w-[18px]" /> {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-xl bg-white/10 p-3 text-xs text-blue-100">
        <FileCheck2 className="mb-1 h-4 w-4" />
        Documents are checked automatically against the tender checklist using OCR and rule-based Document AI.
      </div>
    </div>
  )

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <aside className="absolute inset-y-0 left-0 w-64" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-8">
        <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(!open)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        <div className="hidden text-sm text-slate-500 lg:block">Government e-Marketplace · Bid Compliance Platform</div>
        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="text-sm font-semibold text-slate-800">{user.full_name || user.username}</div>
            <div className="text-xs text-slate-500">{ROLE_LABEL[user.role]}{user.company_name ? ` · ${user.company_name}` : ''}</div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">{initials}</div>
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Sign out" onClick={() => { logout(); nav('/login') }}><LogOut className="h-[18px] w-[18px]" /></button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8"><Outlet /></main>
    </div>
  )
}
