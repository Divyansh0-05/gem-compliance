import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { api, errMsg } from '../api'
import { Field, PageHeader, Skeleton } from '../components/ui'
import { useToast } from '../toast'

const EMPTY = { title: '', tender_no: '', category: '', description: '', estimated_value: '', emd_amount: '', bid_end_date: '', status: 'DRAFT' }

export default function TenderForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState<Record<string, string>>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(!!id)
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!id) return
    api.get(`/tenders/${id}/`).then((r) => {
      const d = r.data
      setForm({ title: d.title, tender_no: d.tender_no, category: d.category, description: d.description, estimated_value: d.estimated_value, emd_amount: d.emd_amount, bid_end_date: d.bid_end_date, status: d.status })
    }).catch((e) => toast(errMsg(e), 'error')).finally(() => setLoading(false))
  }, [id])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErrors({})
    const body = { ...form, estimated_value: form.estimated_value || 0, emd_amount: form.emd_amount || 0 }
    try {
      const r = id ? await api.put(`/tenders/${id}/`, body) : await api.post('/tenders/', body)
      toast(id ? 'Tender updated.' : 'Tender created. Now add the compliance checklist.')
      nav(`/tenders/${r.data.id}`)
    } catch (err: any) {
      const d = err.response?.data
      if (d && typeof d === 'object' && !d.detail) setErrors(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)])))
      toast(errMsg(err), 'error')
    } finally { setBusy(false) }
  }

  if (loading) return <Skeleton className="h-96" />

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={id ? `/tenders/${id}` : '/tenders'} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <PageHeader title={id ? 'Edit tender' : 'New tender'} subtitle="Basic details of the procurement. Set the status to Open when bidders can start submitting." />
      <form onSubmit={submit} className="card space-y-5 p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Tender / bid number" error={errors.tender_no}><input required value={form.tender_no} onChange={(e) => set('tender_no', e.target.value)} placeholder="GEM/2026/B/1234567" /></Field>
          <Field label="Category" error={errors.category}><input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="IT Hardware" /></Field>
        </div>
        <Field label="Title" error={errors.title}><input required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Supply of laptops and networking equipment" /></Field>
        <Field label="Description" error={errors.description}><textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Estimated value (Rs.)" error={errors.estimated_value}><input type="number" min="0" value={form.estimated_value} onChange={(e) => set('estimated_value', e.target.value)} /></Field>
          <Field label="EMD amount (Rs.)" error={errors.emd_amount}><input type="number" min="0" value={form.emd_amount} onChange={(e) => set('emd_amount', e.target.value)} /></Field>
          <Field label="Bid end date" error={errors.bid_end_date}><input required type="date" value={form.bid_end_date} onChange={(e) => set('bid_end_date', e.target.value)} /></Field>
          <Field label="Status" error={errors.status}>
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="DRAFT">Draft (hidden from bidders)</option><option value="OPEN">Open for bidding</option><option value="CLOSED">Closed</option>
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Link to={id ? `/tenders/${id}` : '/tenders'} className="btn-secondary">Cancel</Link>
          <button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {id ? 'Save changes' : 'Create tender'}</button>
        </div>
      </form>
    </div>
  )
}
