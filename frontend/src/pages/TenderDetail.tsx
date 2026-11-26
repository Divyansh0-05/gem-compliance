import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, Pencil, Plus, Trash2, Upload, Users, Wallet, Eye } from 'lucide-react'
import { api, ChecklistItem, CheckType, errMsg, fmtDate, inr, Tender } from '../api'
import { useAuth } from '../auth'
import { Badge, EmptyState, ErrorState, Field, Modal, PageSkeleton } from '../components/ui'
import { tenderTone } from './Tenders'
import { useToast } from '../toast'

export const CHECK_LABEL: Record<CheckType, string> = {
  DOC_PRESENT: 'Document present', KEYWORD: 'Keyword match', REGEX: 'ID / pattern match', NUMERIC_THRESHOLD: 'Numeric threshold',
  SIGNATURE_STAMP: 'Signature / stamp', VALIDITY_DATE: 'Validity date', AI_SEMANTIC: 'AI semantic check',
}
const PATTERNS = ['GSTIN', 'PAN', 'UDYAM', 'CIN', 'IFSC']

function describeConfig(i: ChecklistItem) {
  const c = i.config || {}
  if (i.check_type === 'KEYWORD') return `${c.mode === 'any' ? 'Any of' : 'All of'}: ${(c.keywords || []).join(', ')}`
  if (i.check_type === 'REGEX') return c.custom ? `Custom pattern` : `Pattern: ${c.pattern}`
  if (i.check_type === 'NUMERIC_THRESHOLD') return `Minimum ${inr(c.min_value || 0)}`
  return ''
}

interface FormState { name: string; description: string; check_type: CheckType; is_mandatory: boolean; weight: string; keywords: string; mode: string; pattern: string; custom: string; min_value: string; context_keywords: string }
const BLANK: FormState = { name: '', description: '', check_type: 'DOC_PRESENT', is_mandatory: true, weight: '10', keywords: '', mode: 'all', pattern: 'GSTIN', custom: '', min_value: '', context_keywords: '' }
const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

function buildConfig(f: FormState) {
  if (f.check_type === 'KEYWORD') return { keywords: split(f.keywords), mode: f.mode }
  if (f.check_type === 'REGEX') return f.pattern === 'CUSTOM' ? { custom: f.custom.trim(), label: f.name } : { pattern: f.pattern }
  if (f.check_type === 'NUMERIC_THRESHOLD') return { min_value: Number(f.min_value), ...(f.context_keywords ? { context_keywords: split(f.context_keywords) } : {}) }
  return {}
}
function fromItem(i: ChecklistItem): FormState {
  const c = i.config || {}
  return { ...BLANK, name: i.name, description: i.description, check_type: i.check_type, is_mandatory: i.is_mandatory, weight: String(i.weight),
    keywords: (c.keywords || []).join(', '), mode: c.mode || 'all', pattern: c.custom ? 'CUSTOM' : c.pattern || 'GSTIN', custom: c.custom || '',
    min_value: c.min_value != null ? String(c.min_value) : '', context_keywords: (c.context_keywords || []).join(', ') }
}

export default function TenderDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [tender, setTender] = useState<Tender | null>(null)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [error, setError] = useState('')
  const [modal, setModal] = useState<{ item: ChecklistItem | null } | null>(null)
  const [form, setForm] = useState<FormState>(BLANK)
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const buyer = user?.role === 'BUYER'
  const bidder = user?.role === 'BIDDER'
  const set = (k: keyof FormState, v: any) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(() => {
    setError('')
    Promise.all([api.get(`/tenders/${id}/`), api.get(`/tenders/${id}/checklist/`)])
      .then(([t, c]) => { setTender(t.data); setItems(c.data) }).catch((e) => setError(errMsg(e)))
  }, [id])
  useEffect(load, [load])

  function openModal(item: ChecklistItem | null) { setForm(item ? fromItem(item) : BLANK); setModal({ item }) }

  async function save() {
    setBusy(true)
    const body = { name: form.name, description: form.description, check_type: form.check_type, is_mandatory: form.is_mandatory, weight: Number(form.weight) || 1, config: buildConfig(form) }
    try {
      if (modal?.item) await api.put(`/checklist/${modal.item.id}/`, body)
      else await api.post(`/tenders/${id}/checklist/`, body)
      toast(modal?.item ? 'Checklist item updated.' : 'Checklist item added.')
      setModal(null); load()
    } catch (e) { toast(errMsg(e), 'error') } finally { setBusy(false) }
  }

  async function remove(item: ChecklistItem) {
    if (!confirm(`Delete "${item.name}"?`)) return
    try { await api.delete(`/checklist/${item.id}/`); toast('Checklist item removed.'); load() } catch (e) { toast(errMsg(e), 'error') }
  }

  async function deleteTender() {
    try { await api.delete(`/tenders/${id}/`); toast('Tender deleted.'); nav('/tenders') } catch (e) { toast(errMsg(e), 'error') }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!tender) return <PageSkeleton />
  const totalWeight = items.reduce((a, i) => a + i.weight, 0)

  return (
    <div>
      <Link to="/tenders" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> All tenders</Link>
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-brand-700">{tender.tender_no}</span><Badge tone={tenderTone(tender.status)}>{tender.status}</Badge></div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{tender.title}</h1>
            {tender.description && <p className="mt-2 max-w-3xl text-sm text-slate-600">{tender.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {buyer && <><Link to={`/tenders/${id}/edit`} className="btn-secondary"><Pencil className="h-4 w-4" /> Edit</Link>
              <Link to={`/bids?tender=${id}`} className="btn-secondary"><Users className="h-4 w-4" /> Bids ({tender.bids_count})</Link>
              <button className="btn-secondary text-red-600" onClick={() => setConfirmDel(true)}><Trash2 className="h-4 w-4" /></button></>}
            {bidder && tender.my_bid_id && <Link to={`/bids/${tender.my_bid_id}`} className="btn-secondary"><Eye className="h-4 w-4" /> My latest bid</Link>}
            {bidder && tender.status === 'OPEN' && <Link to={`/tenders/${id}/bid`} className="btn-primary"><Upload className="h-4 w-4" /> {tender.my_bid_id ? 'Submit a new bid' : 'Submit bid'}</Link>}
          </div>
        </div>
        <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
          <div><div className="text-xs uppercase text-slate-400">Estimated value</div><div className="font-semibold">{inr(tender.estimated_value)}</div></div>
          <div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-slate-400" /><div><div className="text-xs uppercase text-slate-400">EMD</div><div className="font-semibold">{inr(tender.emd_amount)}</div></div></div>
          <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-slate-400" /><div><div className="text-xs uppercase text-slate-400">Bid end date</div><div className="font-semibold">{fmtDate(tender.bid_end_date)}</div></div></div>
          <div><div className="text-xs uppercase text-slate-400">Category</div><div className="font-semibold">{tender.category || '-'}</div></div>
        </div>
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div><h2 className="font-semibold text-slate-900">Compliance checklist</h2><p className="text-xs text-slate-500">{items.length} requirements · total weight {totalWeight}. Every submitted bid is verified against these.</p></div>
          {buyer && <button className="btn-primary" onClick={() => openModal(null)}><Plus className="h-4 w-4" /> Add item</button>}
        </div>
        {items.length === 0 ? (
          <EmptyState title="No checklist items yet" text={buyer ? 'Add the documents and conditions bidders must satisfy.' : 'The buyer has not published a checklist yet.'}
            action={buyer ? <button className="btn-primary" onClick={() => openModal(null)}>Add first item</button> : undefined} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((i, n) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-slate-50">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{n + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{i.name}</div>
                  <div className="text-xs text-slate-500">{i.description || describeConfig(i)}{i.description && describeConfig(i) ? ` · ${describeConfig(i)}` : ''}</div>
                </div>
                <Badge tone="blue">{CHECK_LABEL[i.check_type]}</Badge>
                <Badge tone={i.is_mandatory ? 'red' : 'slate'}>{i.is_mandatory ? 'Mandatory' : 'Optional'}</Badge>
                <span className="w-16 text-right text-xs text-slate-500">wt {i.weight}</span>
                {buyer && <div className="flex gap-1">
                  <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => openModal(i)}><Pencil className="h-4 w-4" /></button>
                  <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></button>
                </div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.item ? 'Edit checklist item' : 'Add checklist item'}
        footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" disabled={busy || !form.name.trim()} onClick={save}>{modal?.item ? 'Save' : 'Add item'}</button></>}>
        <Field label="Name"><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. GST Registration Certificate" /></Field>
        <Field label="Description (shown to bidders)"><input value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Check type">
          <select value={form.check_type} onChange={(e) => set('check_type', e.target.value)}>{(Object.keys(CHECK_LABEL) as CheckType[]).map((k) => <option key={k} value={k}>{CHECK_LABEL[k]}</option>)}</select>
        </Field>
        {form.check_type === 'KEYWORD' && <>
          <Field label="Keywords (comma separated)"><input value={form.keywords} onChange={(e) => set('keywords', e.target.value)} placeholder="work order, completed successfully" /></Field>
          <Field label="Match mode"><select value={form.mode} onChange={(e) => set('mode', e.target.value)}><option value="all">All keywords required</option><option value="any">Any keyword is enough</option></select></Field></>}
        {form.check_type === 'REGEX' && <>
          <Field label="Pattern"><select value={form.pattern} onChange={(e) => set('pattern', e.target.value)}>{PATTERNS.map((p) => <option key={p}>{p}</option>)}<option value="CUSTOM">Custom regex</option></select></Field>
          {form.pattern === 'CUSTOM' && <Field label="Regular expression"><input value={form.custom} onChange={(e) => set('custom', e.target.value)} placeholder="[A-Z]{3}\d{6}" /></Field>}</>}
        {form.check_type === 'NUMERIC_THRESHOLD' && <>
          <Field label="Minimum value (Rs.)"><input type="number" min="0" value={form.min_value} onChange={(e) => set('min_value', e.target.value)} placeholder="5000000" /></Field>
          <Field label="Only look at lines containing (optional)"><input value={form.context_keywords} onChange={(e) => set('context_keywords', e.target.value)} placeholder="turnover" /></Field></>}
        {form.check_type === 'VALIDITY_DATE' && <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">Passes when the latest validity/expiry date in the document is on or after today and the tender's bid end date.</p>}
        {form.check_type === 'AI_SEMANTIC' && <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">Uses the AI model with the description above. Without an API key on the server this check is flagged for manual review.</p>}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Weight"><input type="number" min="1" max="100" value={form.weight} onChange={(e) => set('weight', e.target.value)} /></Field>
          <div className="flex items-end pb-2"><label className="flex cursor-pointer items-center gap-2 normal-case tracking-normal"><input type="checkbox" checked={form.is_mandatory} onChange={(e) => set('is_mandatory', e.target.checked)} /> <span className="text-sm font-medium text-slate-700">Mandatory</span></label></div>
        </div>
      </Modal>

      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete this tender?"
        footer={<><button className="btn-secondary" onClick={() => setConfirmDel(false)}>Cancel</button><button className="btn-danger" onClick={deleteTender}>Delete tender</button></>}>
        <p className="text-sm text-slate-600">This permanently removes the tender, its checklist and all bids and reports submitted against it.</p>
      </Modal>
    </div>
  )
}
