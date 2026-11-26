import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ChevronDown, Download, FileText, Gavel, Lightbulb, Loader2, PencilLine, ShieldAlert, ThumbsDown, ThumbsUp, TriangleAlert } from 'lucide-react'
import { api, BidDetail, errMsg, fmtDate, ResultRow, ResultStatus } from '../api'
import { useAuth } from '../auth'
import { Badge, ConfidenceBar, ErrorState, Field, Modal, PageSkeleton, ScoreGauge, StatusBadge, VERDICT } from '../components/ui'
import { CHECK_LABEL } from './TenderDetail'
import { bidTone } from './Bids'
import { useToast } from '../toast'

const ICON = { PASS: CheckCircle2, FAIL: ShieldAlert, REVIEW: TriangleAlert }
const ICON_COLOR = { PASS: 'text-green-600', FAIL: 'text-red-600', REVIEW: 'text-amber-600' }

function ResultItem({ r, canOverride, onOverride }: { r: ResultRow; canOverride: boolean; onOverride: (r: ResultRow) => void }) {
  const [open, setOpen] = useState(r.status !== 'PASS')
  const Icon = ICON[r.status]
  return (
    <li className="border-b border-slate-100 last:border-0">
      <button className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50" onClick={() => setOpen(!open)}>
        <Icon className={`h-5 w-5 shrink-0 ${ICON_COLOR[r.status]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-900">{r.item_name}</span>{r.is_mandatory && <span className="text-[10px] font-bold uppercase text-red-500">mandatory</span>}</div>
          <div className="truncate text-xs text-slate-500">{r.reason}</div>
        </div>
        <div className="hidden sm:block"><ConfidenceBar value={r.confidence} /></div>
        <StatusBadge status={r.status} />
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="fade-up space-y-3 bg-slate-50/70 px-5 pb-5 pl-[3.25rem] text-sm">
          <div className="sm:hidden"><ConfidenceBar value={r.confidence} /></div>
          <p className="text-slate-700"><span className="font-semibold">Finding: </span>{r.reason}</p>
          {r.evidence_snippet && <div className="rounded-lg border-l-4 border-brand-500 bg-white p-3 text-xs italic text-slate-600 shadow-sm">“{r.evidence_snippet}”{r.source_document_name && <div className="mt-1 not-italic text-slate-400">from {r.source_document_name}</div>}</div>}
          {r.fix_suggestion && <div className="flex gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-900"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0" /><span><b>How to fix: </b>{r.fix_suggestion}</span></div>}
          {r.override_remark && <div className="rounded-lg bg-violet-50 p-3 text-xs text-violet-900"><b>Manual override</b> by {r.overridden_by_name || 'reviewer'} (was {r.original_status}): {r.override_remark}</div>}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400"><span>{CHECK_LABEL[r.check_type]}</span><span>· weight {r.weight}</span>
            {canOverride && <button className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100" onClick={() => onOverride(r)}><PencilLine className="h-3.5 w-3.5" /> Override result</button>}
          </div>
        </div>
      )}
    </li>
  )
}

export default function BidReport() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const [bid, setBid] = useState<BidDetail | null>(null)
  const [error, setError] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [ov, setOv] = useState<ResultRow | null>(null)
  const [ovStatus, setOvStatus] = useState<ResultStatus>('PASS')
  const [remark, setRemark] = useState('')
  const [decision, setDecision] = useState<'ACCEPT' | 'REJECT' | null>(null)
  const [busy, setBusy] = useState(false)
  const reviewer = user?.role === 'BUYER' || user?.role === 'EVALUATOR'
  const buyer = user?.role === 'BUYER'

  const load = useCallback(() => {
    setError('')
    api.get(`/bids/${id}/`).then((r) => setBid(r.data)).catch((e) => setError(errMsg(e)))
  }, [id])
  useEffect(load, [load])

  async function downloadPdf() {
    setPdfBusy(true)
    try {
      const r = await api.get(`/bids/${id}/report/pdf/`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a'); a.href = url; a.download = `compliance-report-bid-${id}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { toast(errMsg(e), 'error') } finally { setPdfBusy(false) }
  }

  async function saveOverride() {
    if (!ov) return
    setBusy(true)
    try { await api.patch(`/results/${ov.id}/override/`, { status: ovStatus, remark }); toast('Result overridden and score recalculated.'); setOv(null); setRemark(''); load() }
    catch (e) { toast(errMsg(e), 'error') } finally { setBusy(false) }
  }

  async function saveDecision() {
    if (!decision) return
    setBusy(true)
    try { await api.post(`/bids/${id}/decision/`, { decision, remark }); toast(decision === 'ACCEPT' ? 'Bid accepted.' : 'Bid rejected.'); setDecision(null); setRemark(''); load() }
    catch (e) { toast(errMsg(e), 'error') } finally { setBusy(false) }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!bid) return <PageSkeleton />
  const rep = bid.report
  const v = rep ? VERDICT[rep.overall_status] : null
  const counts = rep ? { PASS: rep.results.filter((r) => r.status === 'PASS').length, REVIEW: rep.results.filter((r) => r.status === 'REVIEW').length, FAIL: rep.results.filter((r) => r.status === 'FAIL').length } : null

  return (
    <div>
      <Link to="/bids" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> All bids</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold text-slate-900">Compliance report · Bid #{bid.id}</h1><Badge tone={bidTone(bid.status)}>{bid.status.charAt(0) + bid.status.slice(1).toLowerCase()}</Badge></div>
          <p className="mt-1 text-sm text-slate-500"><Link to={`/tenders/${bid.tender_id}`} className="font-semibold text-brand-700 hover:underline">{bid.tender_no}</Link> · {bid.tender_title} · {bid.company} · submitted {fmtDate(bid.submitted_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={downloadPdf} disabled={pdfBusy || !rep}>{pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF</button>
          {buyer && bid.status !== 'ACCEPTED' && <button className="btn-success" onClick={() => { setRemark(''); setDecision('ACCEPT') }}><ThumbsUp className="h-4 w-4" /> Accept</button>}
          {buyer && bid.status !== 'REJECTED' && <button className="btn-danger" onClick={() => { setRemark(''); setDecision('REJECT') }}><ThumbsDown className="h-4 w-4" /> Reject</button>}
        </div>
      </div>

      {!rep || !v || !counts ? <ErrorState message="No report is available for this bid yet." /> : (
        <>
          <div className={`fade-up mb-6 rounded-2xl border p-6 ${v.bg}`}>
            <div className="flex flex-wrap items-center gap-6">
              <ScoreGauge score={rep.score} color={v.color} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Verdict</div>
                <div className={`text-3xl font-extrabold ${v.text}`}>{v.label}</div>
                <p className="mt-1 max-w-xl text-sm text-slate-700">{rep.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2"><Badge tone="green">{counts.PASS} passed</Badge><Badge tone="amber">{counts.REVIEW} need review</Badge><Badge tone="red">{counts.FAIL} failed</Badge></div>
                {bid.decision_remark && <p className="mt-3 flex items-center gap-2 text-sm text-slate-700"><Gavel className="h-4 w-4" /> Buyer decision note: {bid.decision_remark}</p>}
              </div>
            </div>
          </div>

          {(() => {
            const findings = rep.consistency_findings || []
            const hasMismatches = findings.length > 0
            return (
              <div className={`fade-up mb-6 rounded-2xl border p-5 ${hasMismatches ? 'border-amber-200 bg-amber-50/70' : 'border-green-200 bg-green-50/70'}`}>
                <div className="flex items-start gap-3">
                  {hasMismatches ? (
                    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-semibold ${hasMismatches ? 'text-amber-900' : 'text-green-900'}`}>
                        Cross-document consistency
                      </h3>
                      <Badge tone={hasMismatches ? 'amber' : 'green'}>
                        {hasMismatches ? `${findings.length} mismatch${findings.length > 1 ? 'es' : ''}` : 'All identifiers match'}
                      </Badge>
                    </div>
                    {hasMismatches ? (
                      <div className="mt-3 space-y-2 text-sm text-amber-900">
                        {findings.map((f, idx) => (
                          <div key={idx} className="rounded-xl border border-amber-200 bg-white/90 p-3 shadow-xs">
                            <p className="font-medium text-slate-800">{f.message}</p>
                            {f.documents && f.documents.length > 0 && (
                              <p className="mt-1 text-xs text-slate-500">
                                <span className="font-semibold text-slate-700">Documents:</span> {f.documents.join(', ')}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-green-800">
                        All identifiers match across uploaded documents (GSTIN and PAN verified).
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Checklist results</h2><p className="text-xs text-slate-500">Click a row for evidence, confidence and how to fix it.</p></div>
            <ul>{rep.results.map((r) => <ResultItem key={r.id} r={r} canOverride={reviewer} onOverride={(x) => { setOv(x); setOvStatus(x.status); setRemark('') }} />)}</ul>
          </div>

          <div className="card mt-6 p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Submitted documents</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {bid.documents.map((d) => (
                <li key={d.id}><a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm hover:bg-slate-50">
                  <FileText className="h-5 w-5 text-slate-400" /><div className="min-w-0 flex-1"><div className="truncate font-medium">{d.name}</div><div className="text-xs text-slate-500">{d.item_name}</div></div>
                  {d.ocr_used && <Badge tone="blue">OCR</Badge>}</a></li>
              ))}
            </ul>
          </div>
        </>
      )}

      <Modal open={!!ov} onClose={() => setOv(null)} title={`Override: ${ov?.item_name || ''}`}
        footer={<><button className="btn-secondary" onClick={() => setOv(null)}>Cancel</button><button className="btn-primary" disabled={busy || !remark.trim()} onClick={saveOverride}>Save override</button></>}>
        <p className="text-xs text-slate-500">Automated result: <b>{ov?.original_status || ov?.status}</b>. The score is recalculated and your remark is kept in the audit trail and PDF.</p>
        <Field label="New result"><select value={ovStatus} onChange={(e) => setOvStatus(e.target.value as ResultStatus)}><option value="PASS">Pass</option><option value="REVIEW">Needs review</option><option value="FAIL">Fail</option></select></Field>
        <Field label="Remark (required)"><textarea rows={3} value={remark} maxLength={300} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. Verified GSTIN on the GST portal" /></Field>
      </Modal>

      <Modal open={!!decision} onClose={() => setDecision(null)} title={decision === 'ACCEPT' ? 'Accept this bid?' : 'Reject this bid?'}
        footer={<><button className="btn-secondary" onClick={() => setDecision(null)}>Cancel</button><button className={decision === 'ACCEPT' ? 'btn-success' : 'btn-danger'} disabled={busy} onClick={saveDecision}>{decision === 'ACCEPT' ? 'Accept bid' : 'Reject bid'}</button></>}>
        <Field label="Note for the record (optional)"><textarea rows={3} maxLength={300} value={remark} onChange={(e) => setRemark(e.target.value)} /></Field>
      </Modal>
    </div>
  )
}
