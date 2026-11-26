import axios, { AxiosError } from 'axios'

export const API_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
const KEY = 'gem_tokens'

export type Role = 'BUYER' | 'BIDDER' | 'EVALUATOR'
export interface User { id: number; username: string; email: string; full_name: string; role: Role; company_name: string }
export interface Page<T> { count: number; next: string | null; previous: string | null; results: T[] }
export interface Tender {
  id: number; title: string; tender_no: string; description: string; category: string
  estimated_value: string; emd_amount: string; bid_end_date: string; status: 'DRAFT' | 'OPEN' | 'CLOSED'
  created_by_name: string; created_at: string; checklist_count: number; bids_count: number; my_bid_id: number | null
}
export type CheckType = 'DOC_PRESENT' | 'KEYWORD' | 'REGEX' | 'NUMERIC_THRESHOLD' | 'SIGNATURE_STAMP' | 'VALIDITY_DATE' | 'AI_SEMANTIC'
export interface ChecklistItem {
  id: number; tender: number; name: string; description: string; check_type: CheckType
  config: Record<string, any>; is_mandatory: boolean; weight: number; order: number
}
export type ResultStatus = 'PASS' | 'FAIL' | 'REVIEW'
export type Overall = 'COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'NON_COMPLIANT'
export interface ResultRow {
  id: number; item_id: number; item_name: string; item_description: string; check_type: CheckType
  is_mandatory: boolean; weight: number; status: ResultStatus; confidence: number; evidence_snippet: string
  reason: string; fix_suggestion: string; source_document_name: string; original_status: string
  overridden_by_name: string; override_remark: string
}
export interface Report { id: number; bid: number; score: number; overall_status: Overall; summary: string; generated_at: string; results: ResultRow[] }
export interface BidRow {
  id: number; tender_id: number; tender_no: string; tender_title: string; bidder: string; company: string
  status: 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'ACCEPTED'; submitted_at: string
  score: number | null; overall_status: Overall | null
}
export interface BidDetail extends BidRow {
  decision_remark: string; bid_end_date: string; report: Report | null
  documents: { id: number; name: string; item_name: string; ocr_used: boolean; uploaded_at: string; url: string }[]
}
export interface Stats {
  role: Role; tenders_total: number; tenders_open: number; bids_total: number; avg_score: number | null
  compliance_breakdown: Record<Overall, number>; bid_status_counts: Record<string, number>
  bids_per_tender: { tender_no: string; title: string; bids: number }[]
  score_buckets: Record<string, number>; recent_bids: BidRow[]
}

interface Tokens { access: string; refresh: string }
export const tokens = {
  get(): Tokens | null { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } },
  set(t: Tokens | null) { try { t ? localStorage.setItem(KEY, JSON.stringify(t)) : localStorage.removeItem(KEY) } catch { /* ignore */ } },
}

export const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((cfg) => {
  const t = tokens.get()
  if (t?.access) cfg.headers.Authorization = `Bearer ${t.access}`
  return cfg
})

let refreshing: Promise<string | null> | null = null
async function refreshAccess(): Promise<string | null> {
  const t = tokens.get()
  if (!t?.refresh) return null
  try {
    const { data } = await axios.post(`${API_URL}/auth/refresh/`, { refresh: t.refresh })
    tokens.set({ access: data.access, refresh: data.refresh || t.refresh })
    return data.access
  } catch { return null }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const cfg: any = error.config
    const isAuthCall = cfg?.url?.includes('/auth/login') || cfg?.url?.includes('/auth/register')
    if (error.response?.status === 401 && cfg && !cfg._retry && !isAuthCall) {
      cfg._retry = true
      refreshing = refreshing || refreshAccess().finally(() => { refreshing = null })
      const access = await refreshing
      if (access) { cfg.headers.Authorization = `Bearer ${access}`; return api(cfg) }
      tokens.set(null)
      if (!location.pathname.startsWith('/login')) location.href = '/login'
    }
    return Promise.reject(error)
  },
)

/** Turn any API error into one readable sentence. */
export function errMsg(e: unknown): string {
  const err = e as AxiosError<any>
  if (!err.response) return 'Cannot reach the server. Is the backend running on ' + API_URL + '?'
  const d = err.response.data
  if (typeof d === 'string') return d.slice(0, 200)
  if (d?.detail) return String(d.detail)
  if (d && typeof d === 'object') {
    const first = Object.entries(d)[0]
    if (first) { const v = Array.isArray(first[1]) ? first[1][0] : first[1]; return `${first[0] === 'non_field_errors' ? '' : first[0] + ': '}${typeof v === 'object' ? JSON.stringify(v) : v}` }
  }
  return `Request failed (${err.response.status})`
}

export const inr = (v: number | string) => 'Rs. ' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })
export const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
