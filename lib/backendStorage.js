import AsyncStorage from "@react-native-async-storage/async-storage"

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "https://kume.agromanager.com.ar").replace(/\/$/, "")
const COLLECTIONS = ["clientes", "presupuestos", "trabajos", "tiposTrabajo"]
const SESSION_KEY = "kume_auth_session"
const ACTIVE_USER_KEY = "__kume_active_user"
const CACHE_PREFIX = "__kume_account_cache:"
const BASELINE_PREFIX = "__kume_sync_baseline:"
const MIGRATED_PREFIX = "__kume_migrated:"
const PENDING_PREFIX = "__kume_pending:"
const RESET_PREFIX = "__kume_reset:"
const FRESH_ACCOUNT_PREFIX = "__kume_fresh_account:"
const INTERNAL_PREFIXES = ["__kume_"]

let activeSession = null
let activeUserId = null
let syncStatus = { state: "idle", message: "" }
const listeners = new Set()
const scheduledUploads = new Map()
const collectionQueues = new Map()
const collectionVersions = new Map()

function publishStatus(state, message = "") {
  syncStatus = { state, message }
  for (const listener of listeners) listener(syncStatus)
}

export function subscribeToSyncStatus(listener) {
  listeners.add(listener)
  listener(syncStatus)
  return () => listeners.delete(listener)
}

export function getSyncStatus() {
  return syncStatus
}

function accountCacheKey(userId, collection) {
  return `${CACHE_PREFIX}${userId}:${collection}`
}

function migratedKey(userId, collection) {
  return `${MIGRATED_PREFIX}${userId}:${collection}`
}

function pendingKey(userId, collection) {
  return `${PENDING_PREFIX}${userId}:${collection}`
}

function baselineKey(userId, collection) {
  return `${BASELINE_PREFIX}${userId}:${collection}`
}

function resetKey(userId, collection) {
  return `${RESET_PREFIX}${userId}:${collection}`
}

function isCollection(key) {
  return COLLECTIONS.includes(key)
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]")
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function mergeById(serverItems, localItems) {
  const result = new Map()
  const keyFor = (item) => item && item.id !== undefined && item.id !== null
    ? `id:${item.id}`
    : `value:${JSON.stringify(item)}`
  for (const item of serverItems) result.set(keyFor(item), item)
  for (const item of localItems) result.set(keyFor(item), item)
  return [...result.values()]
}

function applyLocalChanges(baselineItems, localItems, serverItems) {
  const result = new Map()
  const keyFor = (item) => item && item.id !== undefined && item.id !== null
    ? `id:${item.id}`
    : `value:${JSON.stringify(item)}`
  const baseline = new Map(baselineItems.map((item) => [keyFor(item), item]))
  const local = new Map(localItems.map((item) => [keyFor(item), item]))
  for (const item of serverItems) result.set(keyFor(item), item)

  for (const [key] of baseline) if (!local.has(key)) result.delete(key)
  for (const [key, item] of local) {
    const previous = baseline.get(key)
    if (!baseline.has(key) || JSON.stringify(previous) !== JSON.stringify(item)) result.set(key, item)
  }
  return [...result.values()]
}

async function apiRequest(path, token, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    })
    const payload = await response.json().catch(() => ({}))
    return { response, payload }
  } finally {
    clearTimeout(timeout)
  }
}

async function getRemoteCollection(collection, token) {
  const { response, payload } = await apiRequest(`/api/v1/data/${collection}`, token)
  if (!response.ok) {
    const error = new Error(payload.message || `No se pudo cargar ${collection}.`)
    error.status = response.status
    throw error
  }
  return { data: Array.isArray(payload.data) ? payload.data : [], etag: response.headers.get("ETag") || `"${payload.revision || 0}"` }
}

async function putRemoteCollection(collection, data, token, etag) {
  const body = JSON.stringify(data)
  let bodyBytes = 0
  for (let index = 0; index < body.length; index += 1) {
    const code = body.charCodeAt(index)
    if (code < 0x80) bodyBytes += 1
    else if (code < 0x800) bodyBytes += 2
    else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < body.length) {
      bodyBytes += 4
      index += 1
    } else bodyBytes += 3
  }
  if (bodyBytes > 3_500_000) throw new Error("La colección supera el tamaño permitido por el servidor. Las fotos deben sincronizarse como archivos, no dentro del JSON.")
  const { response, payload } = await apiRequest(`/api/v1/data/${collection}`, token, {
    method: "PUT",
    headers: { "If-Match": etag },
    body,
  })
  if (!response.ok) {
    const error = new Error(payload.message || `No se pudo guardar ${collection}.`)
    error.status = response.status
    throw error
  }
  return Array.isArray(payload.data) ? payload.data : data
}

async function syncCollection(userId, collection, token) {
  const queueKey = `${userId}:${collection}`
  const versionAtStart = collectionVersions.get(collection) || 0
  const localJson = await AsyncStorage.getItem(collection)
  const localData = parseArray(localJson)
  const resetRequested = (await AsyncStorage.getItem(resetKey(userId, collection))) === "1"
  const hasPendingChanges = (await AsyncStorage.getItem(pendingKey(userId, collection))) === "1"
  const migrationDone = (await AsyncStorage.getItem(migratedKey(userId, collection))) === "1"
  const baselineData = parseArray(await AsyncStorage.getItem(baselineKey(userId, collection)))
  let remote = await getRemoteCollection(collection, token)

  if (resetRequested) {
    try {
      if (remote.data.length) await putRemoteCollection(collection, [], token, remote.etag)
    } catch (error) {
      if (error.status !== 409) throw error
      remote = await getRemoteCollection(collection, token)
      if (remote.data.length) await putRemoteCollection(collection, [], token, remote.etag)
    }
    if (activeUserId !== userId) return
    await AsyncStorage.setItem(baselineKey(userId, collection), "[]")
    await AsyncStorage.setItem(migratedKey(userId, collection), "1")
    if ((collectionVersions.get(collection) || 0) !== versionAtStart) return
    await AsyncStorage.setItem(collection, "[]")
    await AsyncStorage.setItem(accountCacheKey(userId, collection), "[]")
    await AsyncStorage.removeItem(resetKey(userId, collection))
    await AsyncStorage.removeItem(pendingKey(userId, collection))
    return
  }

  if (hasPendingChanges || !migrationDone) {
    const nextData = migrationDone
      ? applyLocalChanges(baselineData, localData, remote.data)
      : mergeById(remote.data, localData)
    let savedData = remote.data
    if (JSON.stringify(nextData) !== JSON.stringify(remote.data)) {
      try {
        savedData = await putRemoteCollection(collection, nextData, token, remote.etag)
      } catch (error) {
        if (error.status !== 409) throw error
        remote = await getRemoteCollection(collection, token)
        const rebasedData = migrationDone
          ? applyLocalChanges(baselineData, localData, remote.data)
          : mergeById(remote.data, localData)
        savedData = JSON.stringify(rebasedData) === JSON.stringify(remote.data)
          ? remote.data
          : await putRemoteCollection(collection, rebasedData, token, remote.etag)
      }
    }
    if (activeUserId !== userId) return
    await AsyncStorage.setItem(baselineKey(userId, collection), JSON.stringify(savedData))
    await AsyncStorage.setItem(migratedKey(userId, collection), "1")
    if ((collectionVersions.get(collection) || 0) !== versionAtStart) return
    await AsyncStorage.setItem(collection, JSON.stringify(savedData))
    await AsyncStorage.removeItem(pendingKey(userId, collection))
    return
  }

  if (activeUserId === userId && (collectionVersions.get(collection) || 0) === versionAtStart) {
    await AsyncStorage.setItem(collection, JSON.stringify(remote.data))
    await AsyncStorage.setItem(baselineKey(userId, collection), JSON.stringify(remote.data))
  }
}

function scheduleCollectionUpload(collection) {
  if (!activeSession?.access_token || !activeUserId || !isCollection(collection)) return
  const userId = activeUserId
  const token = activeSession.access_token
  const queueKey = `${userId}:${collection}`
  collectionVersions.set(collection, (collectionVersions.get(collection) || 0) + 1)
  AsyncStorage.setItem(pendingKey(userId, collection), "1").catch(() => {})
  publishStatus("pending", "Hay cambios esperando sincronización.")
  const previousTimer = scheduledUploads.get(queueKey)
  if (previousTimer) clearTimeout(previousTimer)
  const timer = setTimeout(() => {
    scheduledUploads.delete(queueKey)
    const previous = collectionQueues.get(queueKey) || Promise.resolve()
    const next = previous.catch(() => {}).then(async () => {
      if (!activeSession?.access_token || activeUserId !== userId) return
      try {
        await syncCollection(userId, collection, token)
        publishStatus("synced", "Todos los cambios están guardados en el servidor.")
      } catch (error) {
        publishStatus(error.status === 401 ? "auth_error" : "offline", error.message || "No se pudieron sincronizar los cambios.")
      }
    })
    collectionQueues.set(queueKey, next)
  }, 350)
  scheduledUploads.set(queueKey, timer)
}

export async function activateBackendAccount(session) {
  const userId = session?.user?.id
  const token = session?.access_token
  if (!userId || !token) return { authorized: false }

  const previousUserId = await AsyncStorage.getItem(ACTIVE_USER_KEY)
  const freshAccount = (await AsyncStorage.getItem(`${FRESH_ACCOUNT_PREFIX}${userId}`)) === "1"
  if (previousUserId !== userId) {
    if (previousUserId) {
      for (const collection of COLLECTIONS) {
        const local = await AsyncStorage.getItem(collection)
        if (local !== null) await AsyncStorage.setItem(accountCacheKey(previousUserId, collection), local)
      }
    }

    for (const collection of COLLECTIONS) {
      const cache = previousUserId && !freshAccount ? await AsyncStorage.getItem(accountCacheKey(userId, collection)) : null
      const legacy = previousUserId || freshAccount ? null : await AsyncStorage.getItem(collection)
      await AsyncStorage.setItem(collection, cache ?? legacy ?? "[]")
    }
    await AsyncStorage.setItem(ACTIVE_USER_KEY, userId)
  }

  if (freshAccount) {
    for (const collection of COLLECTIONS) {
      await AsyncStorage.setItem(collection, "[]")
      await AsyncStorage.setItem(baselineKey(userId, collection), "[]")
      await AsyncStorage.setItem(migratedKey(userId, collection), "1")
      await AsyncStorage.removeItem(pendingKey(userId, collection))
      await AsyncStorage.removeItem(resetKey(userId, collection))
      await AsyncStorage.setItem(accountCacheKey(userId, collection), "[]")
    }
    await AsyncStorage.removeItem(`${FRESH_ACCOUNT_PREFIX}${userId}`)
  }

  activeUserId = userId
  activeSession = session
  publishStatus("syncing", "Sincronizando tus datos…")

  try {
    const { response } = await apiRequest("/api/v1/me", token)
    if (response.status === 401) return { authorized: false }
    if (!response.ok) throw new Error("No se pudo validar la sesión con el servidor.")

    await Promise.all(COLLECTIONS.map(async (collection) => {
      const queue = collectionQueues.get(`${userId}:${collection}`)
      if (queue) await queue.catch(() => {})
      await syncCollection(userId, collection, token)
      await AsyncStorage.setItem(accountCacheKey(userId, collection), await AsyncStorage.getItem(collection) || "[]")
    }))
    publishStatus("synced", "Todos los cambios están guardados en el servidor.")
    return { authorized: true }
  } catch (error) {
    publishStatus(error.status === 401 ? "auth_error" : "offline", error.message || "Sin conexión al servidor; se usarán los datos locales.")
    if (error.status === 401) return { authorized: false }
    return { authorized: true, offline: true }
  }
}

export async function retryPendingSync() {
  if (!activeSession?.access_token || !activeUserId) return
  const userId = activeUserId
  const token = activeSession.access_token
  for (const [key, timer] of scheduledUploads.entries()) {
    if (key.startsWith(`${userId}:`)) {
      clearTimeout(timer)
      scheduledUploads.delete(key)
    }
  }
  publishStatus("syncing", "Sincronizando tus datos…")
  const results = await Promise.allSettled(COLLECTIONS.map(async (collection) => {
    const queue = collectionQueues.get(`${userId}:${collection}`)
    if (queue) await queue.catch(() => {})
    await syncCollection(userId, collection, token)
  }))
  const failed = results.some((result) => result.status === "rejected")
  const unauthorized = results.some((result) => result.status === "rejected" && result.reason?.status === 401)
  publishStatus(unauthorized ? "auth_error" : failed ? "offline" : "synced", unauthorized ? "La sesión venció. Iniciá sesión de nuevo." : failed ? "Hay cambios esperando sincronización." : "Todos los cambios están guardados en el servidor.")
}

export async function markAccountAsFresh(userId) {
  await AsyncStorage.setItem(`${FRESH_ACCOUNT_PREFIX}${userId}`, "1")
}

export async function resetCurrentAccountData() {
  if (!activeSession?.access_token || !activeUserId) throw new Error("Iniciá sesión para restablecer los datos de la cuenta.")
  const userId = activeUserId
  for (const collection of COLLECTIONS) {
    await AsyncStorage.setItem(collection, "[]")
    await AsyncStorage.setItem(resetKey(userId, collection), "1")
    await AsyncStorage.setItem(pendingKey(userId, collection), "1")
    scheduleCollectionUpload(collection)
  }
  await retryPendingSync()
  return syncStatus
}

export function setActiveBackendSession(session) {
  const nextUserId = session?.user?.id || null
  if (activeUserId && nextUserId !== activeUserId) {
    for (const [key, timer] of scheduledUploads.entries()) {
      if (key.startsWith(`${activeUserId}:`)) {
        clearTimeout(timer)
        scheduledUploads.delete(key)
      }
    }
  }
  activeSession = session || null
  activeUserId = nextUserId
  if (!session) publishStatus("idle", "")
}

const storage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: async (key, value) => {
    await AsyncStorage.setItem(key, value)
    if (isCollection(key)) scheduleCollectionUpload(key)
  },
  multiGet: (keys) => AsyncStorage.multiGet(keys),
  multiRemove: async (keys) => {
    const safeKeys = keys.filter((key) => key !== SESSION_KEY && !INTERNAL_PREFIXES.some((prefix) => key.startsWith(prefix)))
    await AsyncStorage.multiRemove(safeKeys)
    for (const key of safeKeys) if (isCollection(key)) scheduleCollectionUpload(key)
  },
  getAllKeys: async () => (await AsyncStorage.getAllKeys()).filter((key) => key !== SESSION_KEY && !INTERNAL_PREFIXES.some((prefix) => key.startsWith(prefix))),
  clear: async () => {
    const keys = await AsyncStorage.getAllKeys()
    const preserved = keys.filter((key) => key === SESSION_KEY || INTERNAL_PREFIXES.some((prefix) => key.startsWith(prefix)))
    const removable = keys.filter((key) => !preserved.includes(key))
    await AsyncStorage.multiRemove(removable)
    for (const collection of COLLECTIONS) {
      await AsyncStorage.setItem(collection, "[]")
      scheduleCollectionUpload(collection)
    }
  },
}

storage.removeItem = async (key) => {
  if (key === SESSION_KEY || INTERNAL_PREFIXES.some((prefix) => key.startsWith(prefix))) return
  await AsyncStorage.removeItem(key)
  if (isCollection(key)) scheduleCollectionUpload(key)
}

storage.multiSet = async (entries) => {
  const safeEntries = entries.filter(([key]) => key !== SESSION_KEY && !INTERNAL_PREFIXES.some((prefix) => key.startsWith(prefix)))
  await AsyncStorage.multiSet(safeEntries)
  for (const [key] of safeEntries) if (isCollection(key)) scheduleCollectionUpload(key)
}

export default storage
