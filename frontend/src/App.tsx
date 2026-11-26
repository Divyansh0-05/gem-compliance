import { lazy, Suspense, ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'
import { PageSkeleton } from './components/ui'
import { Role } from './api'

const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Tenders = lazy(() => import('./pages/Tenders'))
const TenderForm = lazy(() => import('./pages/TenderForm'))
const TenderDetail = lazy(() => import('./pages/TenderDetail'))
const BidUpload = lazy(() => import('./pages/BidUpload'))
const Bids = lazy(() => import('./pages/Bids'))
const BidReport = lazy(() => import('./pages/BidReport'))

function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-8"><PageSkeleton /></div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="tenders" element={<Tenders />} />
          <Route path="tenders/new" element={<Protected roles={['BUYER']}><TenderForm /></Protected>} />
          <Route path="tenders/:id/edit" element={<Protected roles={['BUYER']}><TenderForm /></Protected>} />
          <Route path="tenders/:id" element={<TenderDetail />} />
          <Route path="tenders/:id/bid" element={<Protected roles={['BIDDER']}><BidUpload /></Protected>} />
          <Route path="bids" element={<Bids />} />
          <Route path="bids/:id" element={<BidReport />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
