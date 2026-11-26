import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, FolderOpen, ClipboardCheck, Gauge, Plus } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, errMsg, fmtDate, Stats } from '../api'
import { useAuth } from '../auth'
import { EmptyState, ErrorState, PageHeader, PageSkeleton, ScoreBar, VerdictBadge } from '../components/ui'

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string | number; tone: string }) {
  return (
    <div className="card fade-up flex items-center gap-4 p-5">
      <div className={`rounded-xl p-3 ${tone}`}><Icon className="h-6 w-6" /></div>
      <div>
        <div className="text-2xl font-extrabold text-slate-900">{value}</div>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setError('')
    api.get('/dashboard/stats/').then((r) => setStats(r.data)).catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(load, [load])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!stats) return <PageSkeleton />

  const bidder = user?.role === 'BIDDER'
  const b = stats.compliance_breakdown
  const pie = [
    { name: 'Compliant', value: b.COMPLIANT, color: '#16a34a' },
    { name: 'Partially', value: b.PARTIALLY_COMPLIANT, color: '#d97706' },
    { name: 'Non-compliant', value: b.NON_COMPLIANT, color: '#dc2626' },
  ].filter((d) => d.value > 0)
  const bars = Object.entries(stats.score_buckets).map(([range, count]) => ({ range, count }))

  return (
    <div>
      <PageHeader title={`Hello, ${user?.full_name || user?.username}`} subtitle={bidder ? 'Track your bids and their compliance results.' : 'Overview of tenders and bid compliance.'}>
        {user?.role === 'BUYER' && <Link to="/tenders/new" className="btn-primary"><Plus className="h-4 w-4" /> New tender</Link>}
        {bidder && <Link to="/tenders" className="btn-primary"><FolderOpen className="h-4 w-4" /> Browse open tenders</Link>}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={FileText} label={bidder ? 'Open tenders' : 'Tenders'} value={bidder ? stats.tenders_open : stats.tenders_total} tone="bg-brand-50 text-brand-700" />
        <Stat icon={FolderOpen} label="Open for bidding" value={stats.tenders_open} tone="bg-sky-50 text-sky-700" />
        <Stat icon={ClipboardCheck} label={bidder ? 'My bids' : 'Bids received'} value={stats.bids_total} tone="bg-violet-50 text-violet-700" />
        <Stat icon={Gauge} label="Average score" value={stats.avg_score === null ? '-' : stats.avg_score.toFixed(0)} tone="bg-green-50 text-green-700" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900">Compliance outcome</h3>
          <p className="mb-2 text-xs text-slate-500">Verdict of every verified bid</p>
          {pie.length === 0 ? <EmptyState title="No verified bids yet" text="Charts appear after the first bid is verified." /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                  {pie.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900">{bidder ? 'My score distribution' : 'Score distribution'}</h3>
          <p className="mb-2 text-xs text-slate-500">Number of bids per score range</p>
          {stats.bids_total === 0 ? <EmptyState title="Nothing to chart yet" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bars}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="count" name="Bids" fill="#1d4ed8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="font-semibold text-slate-900">Recent bids</h3>
          <Link to="/bids" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link>
        </div>
        {stats.recent_bids.length === 0 ? (
          <EmptyState title="No bids yet" text={bidder ? 'Open a tender and upload your documents to get an instant compliance report.' : 'Bids will appear here once bidders submit.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50"><tr><th className="th">Tender</th>{!bidder && <th className="th">Bidder</th>}<th className="th">Score</th><th className="th">Verdict</th><th className="th">Submitted</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {stats.recent_bids.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td"><Link to={`/bids/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.tender_no}</Link><div className="text-xs text-slate-500">{r.tender_title}</div></td>
                    {!bidder && <td className="td">{r.company}</td>}
                    <td className="td"><ScoreBar score={r.score} /></td>
                    <td className="td"><VerdictBadge v={r.overall_status} /></td>
                    <td className="td text-slate-500">{fmtDate(r.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
