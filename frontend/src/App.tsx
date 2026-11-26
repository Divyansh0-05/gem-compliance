import { Navigate, Route, Routes } from 'react-router-dom'
import { ReactNode } from 'react'
import { useAuth } from './auth'
import Layout from './components/Layout'
import { PageSkeleton } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tenders from './pages/Tenders'
import TenderForm from './pages/TenderForm'
import TenderDetail from './pages/TenderDetail'
import BidUpload from './pages/BidUpload'
import Bids from './pages/Bids'
import BidReport from './pages/BidReport'
import { Role } from './api'

function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-8"><PageSkeleton /></div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
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
  )
}
