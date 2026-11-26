import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, ListChecks, Plus, Search, Users, Wallet } from 'lucide-react'
import { api, errMsg, fmtDate, inr, Page, Tender } from '../api'
import { useAuth } from '../auth'
import { Badge, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '../components/ui'

export const tenderTone = (s: string) => (s === 'OPEN' ? 'green' : s === 'CLOSED' ? 'red' : 'slate') as 'green' | 'red' | 'slate'

export default function Tenders() {
  const { user } = useAuth()
  const bidder = user?.role === 'BIDDER'
  const [data, setData] = useState<Page<Tender> | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(() => {
    setError('')
    api.get('/tenders/', { params: { q: q || undefined, status: status || undefined, page } })
      .then((r) => setData(r.data)).catch((e) => setError(errMsg(e)))
  }, [q, status, page])

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  return (
    <div>
      <PageHeader title={bidder ? 'Open tenders' : 'Tenders'} subtitle={bidder ? 'Pick a tender, review its checklist and upload your documents.' : 'Create tenders and define their compliance checklist.'}>
        {user?.role === 'BUYER' && <Link to="/tenders/new" className="btn-primary"><Plus className="h-4 w-4" /> New tender</Link>}
      </PageHeader>

      <div className="card mb-5 flex flex-wrap gap-3 p-4">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="pl-9" placeholder="Search by title, tender no. or category" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        </div>
        {!bidder && (
          <select className="sm:w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All statuses</option><option value="DRAFT">Draft</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option>
          </select>
        )}
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : !data ? (
        <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : data.results.length === 0 ? (
        <div className="card"><EmptyState title="No tenders found" text={bidder ? 'There are no open tenders matching your search.' : 'Create your first tender to start receiving bids.'}
          action={user?.role === 'BUYER' ? <Link to="/tenders/new" className="btn-primary">Create tender</Link> : undefined} /></div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.results.map((t) => (
              <Link to={`/tenders/${t.id}`} key={t.id} className="card fade-up block p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold tracking-wide text-brand-700">{t.tender_no}</div>
                    <h3 className="mt-1 font-semibold leading-snug text-slate-900">{t.title}</h3>
                  </div>
                  <Badge tone={tenderTone(t.status)}>{t.status}</Badge>
                </div>
                {t.category && <p className="mt-1 text-xs text-slate-500">{t.category}</p>}
                <div className="mt-4 grid grid-cols-2 gap-y-2 text-sm text-slate-600">
                  <span className="flex items-center gap-2"><Wallet className="h-4 w-4 text-slate-400" />EMD {inr(t.emd_amount)}</span>
                  <span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-slate-400" />{fmtDate(t.bid_end_date)}</span>
                  <span className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-slate-400" />{t.checklist_count} checks</span>
                  <span className="flex items-center gap-2"><Users className="h-4 w-4 text-slate-400" />{t.bids_count} bids</span>
                </div>
                {bidder && t.my_bid_id && <div className="mt-3"><Badge tone="blue">You have submitted a bid</Badge></div>}
              </Link>
            ))}
          </div>
          <div className="card mt-4"><Pagination page={page} count={data.count} onPage={setPage} /></div>
        </>
      )}
    </div>
  )
}
