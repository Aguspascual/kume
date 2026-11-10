import AsyncStorage from "@react-native-async-storage/async-storage"

const BCRA_CURRENCIES_URL = "https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones"
const USD_RATE_CACHE_KEY = "kume_bcra_usd_rate"

const formatLocalDate = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const getQuoteForDate = async (date) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)
  let response
  try {
    response = await fetch(`${BCRA_CURRENCIES_URL}?fecha=${formatLocalDate(date)}`, { signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
  if (!response.ok) throw new Error(`BCRA respondió ${response.status}`)

  const payload = await response.json()
  const usd = payload?.results?.detalle?.find((item) => item.codigoMoneda === "USD")
  const rate = Number(usd?.tipoCotizacion)
  if (!rate || !Number.isFinite(rate)) return null

  return { rate, quoteDate: payload.results.fecha || formatLocalDate(date) }
}

export const getOfficialUsdQuote = async (referenceDate = new Date()) => {
  let lastError
  for (let daysBack = 0; daysBack <= 10; daysBack += 1) {
    const date = new Date(referenceDate)
    date.setDate(date.getDate() - daysBack)
    try {
      const quote = await getQuoteForDate(date)
      if (quote) {
        const savedQuote = { ...quote, source: "BCRA", retrievedAt: new Date().toISOString() }
        try { await AsyncStorage.setItem(USD_RATE_CACHE_KEY, JSON.stringify(savedQuote)) }
        catch (error) { console.warn("No se pudo guardar la cotización BCRA en caché:", error) }
        return savedQuote
      }
    } catch (error) {
      lastError = error
      break
    }
  }

  try {
    const cached = JSON.parse((await AsyncStorage.getItem(USD_RATE_CACHE_KEY)) || "null")
    if (cached?.rate && cached?.quoteDate) {
      const quoteDate = new Date(`${cached.quoteDate}T12:00:00`)
      const ageInDays = Math.floor((referenceDate.getTime() - quoteDate.getTime()) / 86400000)
      if (Number.isFinite(ageInDays) && ageInDays >= 0 && ageInDays <= 10) return { ...cached, cached: true }
    }
  } catch (error) {
    console.warn("No se pudo leer la cotización BCRA guardada:", error)
  }

  throw lastError || new Error("El BCRA todavía no publicó una cotización para los últimos días.")
}
