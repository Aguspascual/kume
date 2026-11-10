import AsyncStorage from "@react-native-async-storage/async-storage"
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { AppState } from "react-native"
import { activateBackendAccount, getSyncStatus, markAccountAsFresh, resetCurrentAccountData, retryPendingSync, setActiveBackendSession, subscribeToSyncStatus } from "./backendStorage"

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "https://kume.agromanager.com.ar").replace(/\/$/, "")
const SESSION_KEY = "kume_auth_session"

const getSession = () => AsyncStorage.getItem(SESSION_KEY)
const saveSession = (value) => AsyncStorage.setItem(SESSION_KEY, value)
const clearSession = () => AsyncStorage.removeItem(SESSION_KEY)

const AuthContext = createContext(null)

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    })
  } catch {
    throw new Error(`No se pudo conectar con el servidor (${API_URL}). Revisá que el backend esté iniciado y que el teléfono esté en la misma red.`)
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || "No se pudo completar la operación.")
  return payload
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dataReady, setDataReady] = useState(false)
  const [syncStatus, setSyncStatus] = useState(getSyncStatus())

  useEffect(() => {
    getSession()
      .then((stored) => stored && setSession(JSON.parse(stored)))
      .catch(() => clearSession())
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => subscribeToSyncStatus(setSyncStatus), [])

  useEffect(() => {
    if (syncStatus.state !== "auth_error" || !session) return undefined
    let current = true
    clearSession().finally(() => {
      if (!current) return
      setActiveBackendSession(null)
      setSession(null)
    })
    return () => { current = false }
  }, [syncStatus.state, session?.access_token])

  useEffect(() => {
    if (!session) return undefined
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") retryPendingSync()
    })
    return () => subscription.remove()
  }, [session?.access_token, session?.user?.id])

  useEffect(() => {
    if (!session) {
      setActiveBackendSession(null)
      setDataReady(true)
      return undefined
    }

    let current = true
    setDataReady(false)
    setActiveBackendSession(session)
    activateBackendAccount(session).then(async ({ authorized }) => {
      if (!current) return
      if (!authorized) {
        await clearSession()
        setActiveBackendSession(null)
        setSession(null)
        return
      }
      setDataReady(true)
    }).catch(() => {
      if (current) setDataReady(true)
    })

    return () => { current = false }
  }, [session?.access_token, session?.user?.id])

  const value = useMemo(() => ({
    session,
    loading,
    dataReady,
    syncStatus,
    retrySync: retryPendingSync,
    resetAccountData: resetCurrentAccountData,
    signIn: async (email, password) => {
      const next = await request("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })
      await saveSession(JSON.stringify(next))
      setDataReady(false)
      setSession(next)
    },
    register: async (displayName, contactPhone, email, password) => {
      const next = await request("/api/v1/auth/register", { method: "POST", body: JSON.stringify({ display_name: displayName, contact_phone: contactPhone, email, password }) })
      await markAccountAsFresh(next.user.id)
      await saveSession(JSON.stringify(next))
      setDataReady(false)
      setSession(next)
    },
    updateProfile: async (displayName, contactPhone) => {
      const result = await request("/api/v1/me", {
        method: "PUT",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ display_name: displayName, contact_phone: contactPhone }),
      })
      const next = { ...session, user: result.user }
      await saveSession(JSON.stringify(next))
      setSession(next)
      return next.user
    },
    signOut: async () => {
      const token = session?.access_token
      try {
        if (token) await request("/api/v1/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      } finally {
        await clearSession()
        setActiveBackendSession(null)
        setDataReady(true)
        setSession(null)
      }
    },
  }), [session, loading, dataReady, syncStatus])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider")
  return context
}
