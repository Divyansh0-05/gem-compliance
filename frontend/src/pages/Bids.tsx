import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api, BidRow, errMsg, fmtDate, Page } from '../api'
import { useAuth } from '../auth'
import { Badge, EmptyState, ErrorState, PageHeader, Pagination, ScoreBar, Skeleton, VerdictBadge } from '../components/ui'

export const bidTone = (s: string) => (s === 'ACCEPTED' ? 'green' : s === 'REJECTED' ? 'red' : s === 'VERIFIED' ? 'blue' : 'slate') as 'green' | 'red' | 'blue' | 'slate'

export default function Bids() {
  const { user } = useAuth()
  const bidder = user?.role === 'BIDDER'
  const [params] = useSearchParams()
  const tender = params.get('tender')
  const [data, setData] = useState<Page<BidRow> | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [overall, setOverall] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(() => {
    setError('')
    api.get('/bids/', { params: { q: q || undefined, overall: overall || undefined, status: status || undefined, tender: tender || undefined, page } })
      .then((r) => setData(r.data)).catch((e) => setError(errMsg(e)))
  }, [q, overall, status, tender, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  return (
    <div>
      <PageHeader title={bidder ? 'My bids' : 'Bids & reports'} subtitle={tender ? 'Filtered to one tender.' : bidder ? 'Every bid you submitted and its compliance result.' : 'Review compliance reports for submitted bids.'}>
        {tender && <Link to="/bids" className="btn-secondary">Clear tender filter</Link>}
      </PageHeader>

      <div className="card mb-5 flex flex-wrap gap-3 p-4">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="pl-9" placeholder={bidder ? 'Search by tender' : 'Search by bidder, company or tender'} value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        </div>
        <select className="sm:w-48" value={overall} onChange={(e) => { setOverall(e.target.value); setPage(1) }}>
          <option value="">All verdicts</option><option value="COMPLIANT">Compliant</option><option value="PARTIALLY_COMPLIANT">Partially compliant</option><option value="NON_COMPLIANT">Non-compliant</option>
        </select>
        <select className="sm:w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All statuses</option><option value="VERIFIED">Verified</option><option value="ACCEPTED">Accepted</option><option value="REJECTED">Rejected</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {error ? <div className="p-4"><ErrorState message={error} onRetry={load} /></div> : !data ? (
          <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.results.length === 0 ? (
          <EmptyState title="No bids found" text={bidder ? 'Open a tender and submit your documents to get a compliance report.' : 'No bids match these filters yet.'}
            action={bidder ? <Link to="/tenders" className="btn-primary">Browse open tenders</Link> : undefined} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50"><tr><th className="th">Bid</th><th className="th">Tender</th>{!bidder && <th className="th">Bidder</th>}<th className="th">Score</th><th className="th">Verdict</th><th className="th">Status</th><th className="th">Submitted</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.results.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="td"><Link className="font-semibold text-brand-700 hover:underline" to={`/bids/${b.id}`}>#{b.id}</Link></td>
                      <td className="td"><div className="font-medium">{b.tender_no}</div><div className="max-w-[260px] truncate text-xs text-slate-500">{b.tender_title}</div></td>
                      {!bidder && <td className="td">{b.company}<div className="text-xs text-slate-500">@{b.bidder}</div></td>}
                      <td className="td"><ScoreBar score={b.score} /></td>
                      <td className="td"><VerdictBadge v={b.overall_status} /></td>
                      <td className="td"><Badge tone={bidTone(b.status)}>{b.status.charAt(0) + b.status.slice(1).toLowerCase()}</Badge></td>
                      <td className="td whitespace-nowrap text-slate-500">{fmtDate(b.submitted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} count={data.count} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
