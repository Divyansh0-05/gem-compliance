import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { api, tokens, User } from './api'

interface AuthCtx {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<User>
  register: (data: Record<string, string>) => Promise<User>
  logout: () => void
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tokens.get()) { setLoading(false); return }
    api.get('/auth/me/').then((r) => setUser(r.data)).catch(() => tokens.set(null)).finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const { data } = await api.post('/auth/login/', { username, password })
    tokens.set({ access: data.access, refresh: data.refresh })
    setUser(data.user)
    return data.user as User
  }, [])

  const register = useCallback(async (payload: Record<string, string>) => {
    const { data } = await api.post('/auth/register/', payload)
    tokens.set({ access: data.access, refresh: data.refresh })
    setUser(data.user)
    return data.user as User
  }, [])

  const logout = useCallback(() => { tokens.set(null); setUser(null) }, [])

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>
}
