import { useCallback, useMemo, useState } from "react"
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import AsyncStorage from "../lib/backendStorage"
import { useFocusEffect, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { addMonths, format, isSameMonth, startOfMonth } from "date-fns"
import { es } from "date-fns/locale"

const COLORS = {
  background: "#FAF9F6", surface: "#FFFFFF", ink: "#1A1C1A", secondary: "#66736F",
  muted: "#8A9692", border: "#E7E9E5", primary: "#00685F", teal: "#0D9488",
  tealTint: "#E8F5F2", amber: "#F59E0B", amberTint: "#FFF5E5", track: "#EFEEEB",
}

const amount = (value) => Number.parseFloat(String(value ?? 0).replace(/[^\d.-]/g, "")) || 0
const money = (value, currency = "ARS") => new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency,
  maximumFractionDigits: currency === "USD" ? 2 : 0,
  minimumFractionDigits: currency === "USD" ? 2 : 0,
}).format(Number(value) || 0)
const jobCost = (work) => amount(work.costoMateriales) + amount(work.costoManoDeObra)
const paymentDate = (work) => new Date(work.fechaPago || work.fecha)
const reportAmount = (work, currency) => currency === "USD"
  ? amount(work.montoPagoUSD)
  : amount(work.montoPagoARS ?? jobCost(work))

export default function ReportsScreen() {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(startOfMonth(new Date()))
  const [currency, setCurrency] = useState("ARS")
  const [works, setWorks] = useState([])
  const [budgets, setBudgets] = useState([])

  useFocusEffect(useCallback(() => {
    let active = true
    AsyncStorage.multiGet(["trabajos", "presupuestos"]).then(([worksEntry, budgetsEntry]) => {
      if (!active) return
      const safeArray = (entry) => {
        try { const parsed = JSON.parse(entry?.[1] || "[]"); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
      }
      setWorks(safeArray(worksEntry))
      setBudgets(safeArray(budgetsEntry))
    }).catch((error) => console.error("No se pudieron cargar los informes:", error))
    return () => { active = false }
  }, []))

  const paidWorks = useMemo(() => works.filter((work) => work.estadoPago === "Pagado"), [works])
  const usdWorksMissingRate = paidWorks.filter((work) => !amount(work.montoPagoUSD) || !amount(work.cotizacionUSD)).length
  const reportWorks = useMemo(() => currency === "USD"
    ? paidWorks.filter((work) => amount(work.montoPagoUSD) > 0 && amount(work.cotizacionUSD) > 0)
    : paidWorks, [currency, paidWorks])
  const monthWorks = useMemo(() => reportWorks.filter((work) => {
    const date = paymentDate(work)
    return Number.isFinite(date.getTime()) && isSameMonth(date, selectedDate)
  }), [reportWorks, selectedDate])
  const previousDate = addMonths(selectedDate, -1)
  const previousWorks = useMemo(() => reportWorks.filter((work) => {
    const date = paymentDate(work)
    return Number.isFinite(date.getTime()) && isSameMonth(date, previousDate)
  }), [reportWorks, previousDate])
  const total = monthWorks.reduce((sum, work) => sum + reportAmount(work, currency), 0)
  const materials = monthWorks.reduce((sum, work) => {
    const arsTotal = amount(work.montoPagoARS ?? jobCost(work))
    return sum + reportAmount(work, currency) * (arsTotal ? amount(work.costoMateriales) / arsTotal : 0)
  }, 0)
  const labor = monthWorks.reduce((sum, work) => {
    const arsTotal = amount(work.montoPagoARS ?? jobCost(work))
    return sum + reportAmount(work, currency) * (arsTotal ? amount(work.costoManoDeObra) / arsTotal : 0)
  }, 0)
  const previousTotal = previousWorks.reduce((sum, work) => sum + reportAmount(work, currency), 0)
  const change = previousTotal ? ((total - previousTotal) / previousTotal) * 100 : null
  const totalCosts = materials + labor
  const materialPercent = totalCosts ? (materials / totalCosts) * 100 : 0

  const monthlyBars = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const date = addMonths(selectedDate, index - 5)
    const value = reportWorks.reduce((sum, work) => {
      const workDate = paymentDate(work)
      return Number.isFinite(workDate.getTime()) && isSameMonth(workDate, date) ? sum + reportAmount(work, currency) : sum
    }, 0)
    return { date, value }
  }), [reportWorks, selectedDate, currency])
  const maxBar = Math.max(...monthlyBars.map((item) => item.value), 1)
  const typeStats = useMemo(() => {
    const grouped = monthWorks.reduce((acc, work) => {
      const type = work.tipoTrabajo || "Otros"
      if (!acc[type]) acc[type] = { count: 0, total: 0 }
      acc[type].count += 1
      acc[type].total += reportAmount(work, currency)
      return acc
    }, {})
    return Object.entries(grouped).sort((a, b) => b[1].total - a[1].total)
  }, [monthWorks, currency])
  const pendingBudgets = budgets.filter((budget) => budget.estado === "Pendiente")

  const exportReport = async () => {
    const rows = [
      ["Informe KÜME", format(selectedDate, "MMMM yyyy", { locale: es })],
      ["Moneda", currency], ["Cobros registrados", monthWorks.length], ["Ingresos cobrados", total],
      ["Materiales", materials], ["Mano de obra", labor],
      ...typeStats.map(([type, data]) => [`Tipo: ${type}`, data.total]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
    try { await Share.share({ title: "Informe KÜME", message: csv }) }
    catch { Alert.alert("No se pudo exportar", "Probá de nuevo en unos segundos.") }
  }

  const moveMonth = (increment) => setSelectedDate((date) => addMonths(date, increment))
  const monthLabel = format(selectedDate, "MMMM yyyy", { locale: es })

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace("/")} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Volver al inicio">
          <Ionicons name="arrow-back" size={21} color={COLORS.ink} />
        </TouchableOpacity>
        <View style={styles.headerCopy}><Text style={styles.title}>Informes</Text><Text style={styles.subtitle}>Rendimiento y balance del taller</Text></View>
        <TouchableOpacity onPress={exportReport} style={styles.exportButton} accessibilityRole="button">
          <Ionicons name="share-outline" size={17} color={COLORS.primary} /><Text style={styles.exportText}>Exportar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.monthPicker}>
          <TouchableOpacity style={styles.monthArrow} onPress={() => moveMonth(-1)} accessibilityLabel="Mes anterior"><Ionicons name="chevron-back" size={20} color={COLORS.secondary} /></TouchableOpacity>
          <TouchableOpacity style={styles.monthTitle} onPress={() => setSelectedDate(startOfMonth(new Date()))}>
            <Ionicons name="calendar-outline" size={18} color={COLORS.primary} /><Text style={styles.monthLabel}>{monthLabel}</Text><Ionicons name="chevron-down" size={15} color={COLORS.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.monthArrow} onPress={() => moveMonth(1)} accessibilityLabel="Mes siguiente"><Ionicons name="chevron-forward" size={20} color={COLORS.secondary} /></TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.currencyModeRow}>
            <View><Text style={styles.currencyModeLabel}>Ver cobros en</Text><Text style={styles.currencyModeHint}>Cambiar moneda del informe</Text></View>
            <View style={styles.currencyToggle}>
              {["ARS", "USD"].map((option) => <TouchableOpacity key={option} onPress={() => setCurrency(option)} style={[styles.currencyToggleOption, currency === option && styles.currencyToggleSelected]} accessibilityRole="button" accessibilityState={{ selected: currency === option }}>
                <Text style={[styles.currencyToggleText, currency === option && styles.currencyToggleTextSelected]}>{option}</Text>
              </TouchableOpacity>)}
            </View>
          </View>
          {currency === "USD" && <Text style={styles.exchangeRateNote}>Dólar oficial BCRA. Los cobros anteriores que no tengan cotización guardada no aparecen en USD{usdWorksMissingRate ? ` (${usdWorksMissingRate})` : ""}.</Text>}
          <View style={styles.heroTop}>
            <View><Text style={styles.eyebrow}>●  INGRESOS COBRADOS DEL MES</Text></View>
            {change !== null && <View style={[styles.changeBadge, change < 0 && styles.changeBadgeDown]}><Ionicons name={change < 0 ? "trending-down" : "trending-up"} size={14} color={change < 0 ? "#9A6700" : COLORS.primary} /><Text style={[styles.changeText, change < 0 && styles.changeTextDown]}>{change > 0 ? "+" : ""}{change.toFixed(1)}%</Text></View>}
          </View>
          <Text style={styles.heroAmount}>{money(total, currency)} <Text style={styles.currency}>{currency}</Text></Text>
          <Text style={styles.comparison}>{previousTotal ? `${money(total - previousTotal, currency)} vs. mes anterior` : "Todavía no hay cobros del mes anterior"}</Text>
          <View style={styles.metricGrid}>
            <MetricCard title="Cobros registrados" value={`${monthWorks.length}`} detail="En este período" icon="briefcase-outline" tint="teal" />
            <MetricCard title="Promedio por cobro" value={money(monthWorks.length ? total / monthWorks.length : 0, currency)} detail="Ingreso promedio" icon="stats-chart-outline" tint="teal" />
            <MetricCard title="Materiales" value={money(materials, currency)} detail={`${totalCosts ? Math.round(materialPercent) : 0}% del total`} icon="cube-outline" tint="slate" />
            <MetricCard title="Mano de obra" value={money(labor, currency)} detail={`${totalCosts ? Math.round(100 - materialPercent) : 0}% del total`} icon="people-outline" tint="amber" />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Ingresos semestrales</Text><Text style={styles.sectionSub}>Evolución de los cobros registrados</Text></View><View style={styles.legend}><View style={styles.legendDot} /><Text style={styles.legendText}>Este mes</Text></View></View>
          <View style={styles.chart}>
            {monthlyBars.map(({ date, value }, index) => <View key={date.toISOString()} style={styles.barColumn}>
              <View style={styles.barArea}>{index === 5 && value > 0 && <Text numberOfLines={1} style={styles.barValue}>{money(value, currency)}</Text>}<View style={[styles.bar, { height: `${Math.max(value ? (value / maxBar) * 72 : 4, 4)}%` }, index === 5 ? styles.barActive : value > 0 ? styles.barPrevious : styles.barEmpty]} /></View>
              <Text style={[styles.barLabel, index === 5 && styles.barLabelActive]}>{format(date, "LLL", { locale: es })}</Text>
            </View>)}
          </View>
          <View style={styles.averageBox}><Ionicons name="analytics-outline" size={17} color={COLORS.primary} /><Text style={styles.averageText}>Promedio mensual: <Text style={styles.averageStrong}>{money(monthlyBars.reduce((sum, item) => sum + item.value, 0) / 6, currency)}</Text></Text></View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Composición de ingresos</Text><Text style={styles.sectionSub}>Desglose de los cobros del período</Text></View></View>
          <View style={styles.costTrack}><View style={[styles.costFillMaterials, { flex: materialPercent || 0.001 }]} /><View style={[styles.costFillLabor, { flex: (100 - materialPercent) || 0.001 }]} /></View>
          <View style={styles.costLegend}><Text style={styles.materialLegend}>● Materiales {Math.round(materialPercent)}%</Text><Text style={styles.laborLegend}>● Mano de obra {Math.round(100 - materialPercent)}%</Text></View>
          <CostRow icon="cube-outline" title="Materiales" value={money(materials, currency)} subtitle={`${monthWorks.length} cobros en el período`} tone="teal" />
          <CostRow icon="people-outline" title="Mano de obra" value={money(labor, currency)} subtitle={`${monthWorks.length} cobros en el período`} tone="amber" last />
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Cobros por especialidad</Text><Text style={styles.sectionSub}>Ingresos agrupados por tipo de trabajo</Text></View><Ionicons name="pie-chart-outline" size={20} color={COLORS.muted} /></View>
          {typeStats.length ? typeStats.map(([type, data], index) => <TypeRow key={type} title={type} data={data} total={total} index={index} currency={currency} />) : <Text style={styles.emptyText}>Cuando registres cobros en este período, vas a ver el desglose por tipo acá.</Text>}
        </View>

        {pendingBudgets.length > 0 && <TouchableOpacity style={styles.budgetCard} onPress={() => router.push("BudgetsScreen")} activeOpacity={0.8}>
          <View style={styles.budgetIcon}><Ionicons name="document-text-outline" size={21} color="#A45B0A" /></View>
          <View style={styles.budgetCopy}><View style={styles.budgetTitleRow}><Text style={styles.budgetTitle}>Presupuestos pendientes</Text><Text style={styles.pendingPill}>{pendingBudgets.length}</Text></View><Text style={styles.budgetHint}>Seguí tus cotizaciones desde Presupuestos.</Text></View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
        </TouchableOpacity>}
        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  )
}

function MetricCard({ title, value, detail, icon, tint }) {
  return <View style={styles.metricCard}><View style={styles.metricHeading}><Text style={styles.metricTitle}>{title}</Text><Ionicons name={icon} size={15} color={tint === "amber" ? "#A45B0A" : tint === "slate" ? COLORS.secondary : COLORS.primary} /></View><Text style={[styles.metricValue, tint === "amber" && styles.metricAmber]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={styles.metricDetail}>{detail}</Text></View>
}

function CostRow({ icon, title, value, subtitle, tone, last }) {
  return <View style={[styles.costRow, last && styles.costRowLast]}><View style={[styles.costIcon, tone === "amber" && styles.costIconAmber]}><Ionicons name={icon} size={17} color={tone === "amber" ? "#A45B0A" : COLORS.primary} /></View><View style={styles.costInfo}><Text style={styles.costTitle}>{title}</Text><Text style={styles.costSubtitle}>{subtitle}</Text></View><Text style={styles.costValue}>{value}</Text></View>
}

function TypeRow({ title, data, total, index, currency }) {
  const colors = [COLORS.primary, "#0D9488", COLORS.amber, "#545C72"]
  const percent = total ? (data.total / total) * 100 : 0
  return <View style={styles.typeRow}><View style={styles.typeTop}><View style={styles.typeNameWrap}><View style={[styles.typeDot, { backgroundColor: colors[index % colors.length] }]} /><Text style={styles.typeName} numberOfLines={1}>{title}</Text></View><Text style={styles.typeAmount} numberOfLines={1}>{money(data.total, currency)}</Text></View><View style={styles.typeMeta}><Text style={styles.typeCount}>{data.count} {data.count === 1 ? "cobro" : "cobros"}</Text><Text style={styles.typePercent}>{Math.round(percent)}% del total</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(percent, 2)}%`, backgroundColor: colors[index % colors.length] }]} /></View></View>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: { minHeight: 68, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10 },
  backButton: { width: 34, height: 40, alignItems: "flex-start", justifyContent: "center" }, headerCopy: { flex: 1 }, title: { fontSize: 18, lineHeight: 23, color: COLORS.ink, fontWeight: "700" }, subtitle: { fontSize: 11, color: COLORS.secondary, marginTop: 1 },
  exportButton: { minHeight: 38, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface }, exportText: { fontSize: 11, fontWeight: "700", color: COLORS.ink },
  content: { padding: 16, gap: 14 }, monthPicker: { height: 48, flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border }, monthArrow: { width: 48, height: 46, alignItems: "center", justifyContent: "center" }, monthTitle: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }, monthLabel: { fontSize: 15, textTransform: "capitalize", color: COLORS.ink, fontWeight: "700" },
  heroCard: { backgroundColor: COLORS.surface, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16 }, currencyModeRow: { minHeight: 47, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }, currencyModeLabel: { color: COLORS.ink, fontSize: 12, fontWeight: "700" }, currencyModeHint: { color: COLORS.muted, fontSize: 10, marginTop: 3 }, currencyToggle: { flexDirection: "row", backgroundColor: "#F3F5F3", borderRadius: 10, padding: 3 }, currencyToggleOption: { minWidth: 49, minHeight: 33, alignItems: "center", justifyContent: "center", borderRadius: 8 }, currencyToggleSelected: { backgroundColor: COLORS.primary }, currencyToggleText: { color: COLORS.secondary, fontSize: 11, fontWeight: "700" }, currencyToggleTextSelected: { color: COLORS.surface }, exchangeRateNote: { color: COLORS.secondary, fontSize: 10, lineHeight: 15, backgroundColor: "#F6F8F6", borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7, marginBottom: 11 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, eyebrow: { fontSize: 10, fontWeight: "700", color: COLORS.primary, letterSpacing: 0.25 }, heroHint: { fontSize: 11, color: COLORS.secondary, marginTop: 5 }, changeBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: COLORS.tealTint, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5 }, changeBadgeDown: { backgroundColor: COLORS.amberTint }, changeText: { color: COLORS.primary, fontSize: 11, fontWeight: "700" }, changeTextDown: { color: "#9A6700" }, heroAmount: { fontSize: 29, lineHeight: 38, marginTop: 8, fontWeight: "700", color: COLORS.ink }, currency: { fontSize: 12, color: COLORS.muted, fontWeight: "700" }, comparison: { fontSize: 11, color: COLORS.primary, fontWeight: "600", marginTop: 1, marginBottom: 15 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, borderTopWidth: 1, borderTopColor: COLORS.track, paddingTop: 14 }, metricCard: { width: "48%", flexGrow: 1, minHeight: 88, borderRadius: 13, padding: 10, backgroundColor: "#F7F7F4", borderWidth: 1, borderColor: "#E9EAE6" }, metricHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 3 }, metricTitle: { fontSize: 10, fontWeight: "700", color: COLORS.secondary }, metricValue: { fontSize: 17, fontWeight: "700", color: COLORS.ink, marginTop: 7 }, metricAmber: { color: "#9A6700" }, metricDetail: { fontSize: 10, color: COLORS.secondary, marginTop: 3 },
  card: { backgroundColor: COLORS.surface, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16 }, sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, sectionTitle: { fontSize: 16, color: COLORS.ink, fontWeight: "700" }, sectionSub: { fontSize: 11, lineHeight: 16, color: COLORS.secondary, marginTop: 2 }, legend: { flexDirection: "row", alignItems: "center", gap: 5 }, legendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary }, legendText: { fontSize: 10, color: COLORS.secondary },
  chart: { height: 150, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", marginTop: 18, borderBottomWidth: 1, borderBottomColor: COLORS.track }, barColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" }, barArea: { width: "100%", height: "100%", justifyContent: "flex-end", alignItems: "center", position: "relative" }, bar: { width: "55%", borderTopLeftRadius: 7, borderTopRightRadius: 7, minHeight: 5 }, barActive: { backgroundColor: COLORS.primary }, barPrevious: { backgroundColor: "#C8D1CE" }, barEmpty: { backgroundColor: "#EFEEEB" }, barValue: { position: "absolute", bottom: "76%", right: 0, zIndex: 1, width: 88, textAlign: "center", color: COLORS.surface, backgroundColor: COLORS.primary, overflow: "hidden", borderRadius: 6, paddingHorizontal: 4, paddingVertical: 3, fontSize: 9, fontWeight: "700", includeFontPadding: false }, barLabel: { color: COLORS.secondary, fontSize: 10, marginTop: 8, marginBottom: 8, textTransform: "capitalize" }, barLabelActive: { color: COLORS.primary, fontWeight: "700" }, averageBox: { marginTop: 12, minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, borderRadius: 11, backgroundColor: "#F5F5F2" }, averageText: { fontSize: 11, color: COLORS.secondary }, averageStrong: { color: COLORS.ink, fontWeight: "700" },
  costTrack: { height: 9, flexDirection: "row", overflow: "hidden", borderRadius: 9, marginTop: 17, backgroundColor: COLORS.track }, costFillMaterials: { backgroundColor: COLORS.primary }, costFillLabor: { backgroundColor: COLORS.amber }, costLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 8 }, materialLegend: { fontSize: 10, fontWeight: "700", color: COLORS.primary }, laborLegend: { fontSize: 10, fontWeight: "700", color: "#9A6700" }, costRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: 1, borderBottomColor: COLORS.track }, costRowLast: { borderBottomWidth: 0 }, costIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.tealTint, alignItems: "center", justifyContent: "center" }, costIconAmber: { backgroundColor: COLORS.amberTint }, costInfo: { flex: 1 }, costTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "700" }, costSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 3 }, costValue: { color: COLORS.ink, fontSize: 12, fontWeight: "700" },
  typeRow: { paddingTop: 15 }, typeTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }, typeNameWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }, typeDot: { width: 8, height: 8, borderRadius: 4 }, typeName: { flex: 1, fontSize: 12, color: COLORS.ink, fontWeight: "600" }, typeAmount: { fontSize: 12, fontWeight: "700", color: COLORS.ink }, typeMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 }, typeCount: { fontSize: 10, color: COLORS.muted }, typePercent: { fontSize: 10, color: COLORS.secondary, fontWeight: "600" }, progressTrack: { height: 5, borderRadius: 5, backgroundColor: COLORS.track, marginTop: 7, overflow: "hidden" }, progressFill: { height: "100%", borderRadius: 5 }, emptyText: { color: COLORS.secondary, fontSize: 12, lineHeight: 18, marginTop: 14 },
  budgetCard: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: "#FFF9F0", borderRadius: 16, borderWidth: 1, borderColor: "#F2E7D7" }, budgetIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#FFEBD0" }, budgetCopy: { flex: 1 }, budgetTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 }, budgetTitle: { fontSize: 12, fontWeight: "700", color: COLORS.ink }, pendingPill: { fontSize: 10, fontWeight: "700", color: "#855300", backgroundColor: "#FFDEB6", borderRadius: 9, overflow: "hidden", paddingHorizontal: 6, paddingVertical: 3 }, budgetHint: { fontSize: 10, color: COLORS.secondary, marginTop: 4 }, bottomSpace: { height: 14 },
})
