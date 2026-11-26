import { FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ShieldCheck, ScanSearch, ListChecks, FileDown, Loader2 } from 'lucide-react'
import { useAuth } from '../auth'
import { errMsg } from '../api'
import { Field } from '../components/ui'
import { useToast } from '../toast'

const DEMO = [
  { label: 'Buyer', u: 'buyer', p: 'buyer123' },
  { label: 'Bidder', u: 'bidder1', p: 'bidder123' },
  { label: 'Evaluator', u: 'evaluator', p: 'eval123' },
]

export default function Login() {
  const { user, login, register } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', full_name: '', company_name: '', email: '', role: 'BIDDER' })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  if (user) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'login') await login(form.username, form.password)
      else await register(form)
      nav('/')
    } catch (err) {
      toast(mode === 'login' && (err as any).response?.status === 401 ? 'Incorrect username or password.' : errMsg(err), 'error')
    } finally { setBusy(false) }
  }

  const features = [
    { icon: ScanSearch, t: 'Document AI + OCR', d: 'Reads digital and scanned PDFs, DOCX and images.' },
    { icon: ListChecks, t: 'Checklist verification', d: 'GSTIN, PAN, Udyam, turnover, validity, signatures.' },
    { icon: FileDown, t: 'Audit-ready reports', d: 'Score, evidence snippets and a downloadable PDF.' },
  ]

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/10 p-2.5"><ShieldCheck className="h-6 w-6" /></div>
          <span className="text-xl font-bold">GeM BidCheck</span>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Catch bid compliance gaps<br />before they cost the tender.</h1>
          <p className="mt-4 max-w-md text-blue-100">An AI-powered platform that verifies bid documents against a tender's compliance checklist for GeM procurement, in seconds, with evidence for every decision.</p>
          <div className="mt-10 space-y-5">
            {features.map((f) => (
              <div key={f.t} className="flex items-start gap-4">
                <div className="rounded-lg bg-white/10 p-2.5"><f.icon className="h-5 w-5" /></div>
                <div><div className="font-semibold">{f.t}</div><div className="text-sm text-blue-100">{f.d}</div></div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-blue-200">College project · Smart Automation · Document AI</p>
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-white/5" />
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="fade-up w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="rounded-lg bg-brand-700 p-2 text-white"><ShieldCheck className="h-5 w-5" /></div>
            <span className="text-lg font-bold text-slate-900">GeM BidCheck</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mt-1 text-sm text-slate-500">{mode === 'login' ? 'Sign in to verify and review bids.' : 'Register as a buyer or a bidder.'}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                  {(['BIDDER', 'BUYER'] as const).map((r) => (
                    <button type="button" key={r} onClick={() => set('role', r)}
                      className={`rounded-lg py-2 text-sm font-semibold transition ${form.role === r ? 'bg-white text-brand-700 shadow' : 'text-slate-500'}`}>
                      {r === 'BIDDER' ? 'I am a Bidder' : 'I am a Buyer'}
                    </button>
                  ))}
                </div>
                <Field label="Full name"><input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Rajesh Kumar" /></Field>
                <Field label={form.role === 'BIDDER' ? 'Company name' : 'Department / organisation'}><input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="Alpha Infra Pvt Ltd" /></Field>
                <Field label="Email"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@company.com" /></Field>
              </>
            )}
            <Field label="Username"><input required autoFocus value={form.username} onChange={(e) => set('username', e.target.value)} /></Field>
            <Field label="Password"><input required type="password" minLength={mode === 'register' ? 6 : undefined} value={form.password} onChange={(e) => set('password', e.target.value)} /></Field>
            <button className="btn-primary w-full py-2.5" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            {mode === 'login' ? "Don't have an account? " : 'Already registered? '}
            <button className="font-semibold text-brand-700 hover:underline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Register' : 'Sign in'}
            </button>
          </p>

          {mode === 'login' && (
            <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Demo accounts (after seed_demo)</p>
              <div className="flex flex-wrap gap-2">
                {DEMO.map((d) => (
                  <button key={d.u} type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setForm((f) => ({ ...f, username: d.u, password: d.p }))}>{d.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
