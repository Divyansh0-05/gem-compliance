import { DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, FileText, Loader2, ScanSearch, UploadCloud, X } from 'lucide-react'
import { api, ChecklistItem, errMsg, Tender } from '../api'
import { Badge, ErrorState, PageSkeleton } from '../components/ui'
import { useToast } from '../toast'

const ALLOWED = ['.pdf', '.docx', '.png', '.jpg', '.jpeg']
const MAX_MB = 10

function DropZone({ item, file, onFile }: { item: ChecklistItem; file: File | null; onFile: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const toast = useToast()

  function accept(f: File | undefined) {
    if (!f) return
    const ext = '.' + (f.name.split('.').pop() || '').toLowerCase()
    if (!ALLOWED.includes(ext)) return toast(`"${f.name}": only PDF, DOCX, PNG or JPG files are allowed.`, 'error')
    if (f.size > MAX_MB * 1024 * 1024) return toast(`"${f.name}" is larger than ${MAX_MB} MB.`, 'error')
    onFile(f)
  }
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files[0]) }

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div><div className="font-semibold text-slate-900">{item.name}</div><div className="text-xs text-slate-500">{item.description}</div></div>
        <Badge tone={item.is_mandatory ? 'red' : 'slate'}>{item.is_mandatory ? 'Mandatory' : 'Optional'}</Badge>
      </div>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-slate-800">{file.name}</div><div className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB</div></div>
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-white" onClick={() => onFile(null)} title="Remove"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <div role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={drop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${over ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-500 hover:bg-slate-50'}`}>
          <UploadCloud className="h-6 w-6 text-slate-400" />
          <p className="mt-1 text-sm text-slate-600"><span className="font-semibold text-brand-700">Click to upload</span> or drag and drop</p>
          <p className="text-xs text-slate-400">PDF, DOCX, PNG, JPG · max {MAX_MB} MB</p>
        </div>
      )}
      <input ref={input} type="file" hidden accept={ALLOWED.join(',')} onChange={(e) => { accept(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}

export default function BidUpload() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [tender, setTender] = useState<Tender | null>(null)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [files, setFiles] = useState<Record<number, File | null>>({})
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [verifying, setVerifying] = useState(false)

  const load = useCallback(() => {
    Promise.all([api.get(`/tenders/${id}/`), api.get(`/tenders/${id}/checklist/`)])
      .then(([t, c]) => { setTender(t.data); setItems(c.data) }).catch((e) => setError(errMsg(e)))
  }, [id])
  useEffect(load, [load])

  const chosen = Object.values(files).filter(Boolean).length
  const missingMandatory = items.filter((i) => i.is_mandatory && !files[i.id])

  async function submit() {
    if (chosen === 0) return toast('Upload at least one document.', 'error')
    if (missingMandatory.length && !confirm(`${missingMandatory.length} mandatory document(s) are missing and will be marked as failed. Submit anyway?`)) return
    const fd = new FormData()
    items.forEach((i) => { const f = files[i.id]; if (f) fd.append(`file_${i.id}`, f) })
    setProgress(0)
    try {
      const { data } = await api.post(`/tenders/${id}/bids/`, fd, {
        onUploadProgress: (e) => { const p = Math.round((e.loaded * 100) / (e.total || 1)); setProgress(p); if (p >= 100) setVerifying(true) },
      })
      toast('Bid submitted and verified.')
      nav(`/bids/${data.id}`)
    } catch (e) {
      toast(errMsg(e), 'error'); setProgress(null); setVerifying(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!tender) return <PageSkeleton />

  return (
    <div className="mx-auto max-w-4xl">
      <Link to={`/tenders/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Back to tender</Link>
      <h1 className="text-2xl font-bold text-slate-900">Submit bid</h1>
      <p className="mb-6 text-sm text-slate-500">{tender.tender_no} · {tender.title}</p>

      {items.length === 0 ? <ErrorState message="This tender has no checklist yet, so there is nothing to upload." /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((i) => <DropZone key={i.id} item={i} file={files[i.id] || null} onFile={(f) => setFiles((x) => ({ ...x, [i.id]: f }))} />)}
          </div>
          <div className="sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
            <div className="text-sm text-slate-600"><b>{chosen}</b> of {items.length} documents selected{missingMandatory.length > 0 && <span className="ml-2 text-red-600">· {missingMandatory.length} mandatory missing</span>}</div>
            <button className="btn-primary" disabled={progress !== null || chosen === 0} onClick={submit}>
              {progress !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} Submit &amp; verify
            </button>
          </div>
        </>
      )}

      {progress !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="fade-up w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="relative mx-auto mb-4 flex h-24 w-20 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <FileText className="h-9 w-9 text-slate-400" />{verifying && <div className="scan-line" />}
            </div>
            <h3 className="font-semibold text-slate-900">{verifying ? 'Verifying documents with Document AI…' : 'Uploading documents…'}</h3>
            <p className="mt-1 text-sm text-slate-500">{verifying ? 'Extracting text, running OCR where needed and checking every requirement.' : `${progress}% uploaded`}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full bg-brand-600 transition-all ${verifying ? 'animate-pulse' : ''}`} style={{ width: `${verifying ? 100 : progress}%` }} /></div>
          </div>
        </div>
      )}
    </div>
  )
}
