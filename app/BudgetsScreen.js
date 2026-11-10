import { useCallback, useMemo, useState } from "react"
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import AsyncStorage from "../lib/backendStorage"
import { useFocusEffect, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as DocumentPicker from "expo-document-picker"
import * as FileSystem from "expo-file-system/legacy"
import * as Sharing from "expo-sharing"

const COLORS = {
  background: "#FAF9F6",
  surface: "#FFFFFF",
  ink: "#1A1C1A",
  secondary: "#596578",
  muted: "#89948E",
  border: "#EAE7E1",
  primary: "#00685F",
  primaryDark: "#005049",
  mint: "#E7F5F1",
  amber: "#A85D0A",
  peach: "#FFF1D9",
  red: "#748078",
  blush: "#EEF0ED",
}

const FILTERS = [
  { id: "Todos", label: "Todos" },
  { id: "Pendiente", label: "Pendientes" },
  { id: "Aceptado", label: "Aceptados" },
  { id: "Rechazado", label: "Rechazados" },
]

const formatCurrency = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)

const formatDate = (value) => {
  if (!value) return "Fecha sin registrar"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Fecha sin registrar"
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
}

const getStatusStyles = (status) => {
  if (status === "Aceptado") return { backgroundColor: COLORS.mint, color: COLORS.primaryDark, icon: "checkmark-circle-outline" }
  if (status === "Rechazado") return { backgroundColor: COLORS.blush, color: COLORS.red, icon: "close-circle-outline" }
  return { backgroundColor: COLORS.peach, color: COLORS.amber, icon: "time-outline" }
}

const NavItem = ({ icon, label, active, onPress }) => (
  <TouchableOpacity style={styles.navItem} onPress={onPress} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={label}>
    <Ionicons name={icon} size={21} color={active ? COLORS.primary : COLORS.secondary} />
    <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
    {active && <View style={styles.navActiveDot} />}
  </TouchableOpacity>
)

export default function BudgetsScreen() {
  const [budgets, setBudgets] = useState([])
  const [searchText, setSearchText] = useState("")
  const [activeFilter, setActiveFilter] = useState("Todos")
  const [showOptionsMenu, setShowOptionsMenu] = useState(false)
  const router = useRouter()

  const fetchBudgets = useCallback(async () => {
    try {
      const storedBudgets = await AsyncStorage.getItem("presupuestos")
      const parsedBudgets = storedBudgets ? JSON.parse(storedBudgets) : []
      const sortedBudgets = [...parsedBudgets].sort(
        (a, b) => new Date(b.fechaCreacion || 0) - new Date(a.fechaCreacion || 0),
      )
      setBudgets(sortedBudgets)
    } catch (error) {
      console.error("Error al cargar los presupuestos:", error)
      setBudgets([])
    }
  }, [])

  const handleExportData = async () => {
    setShowOptionsMenu(false)
    try {
      const keys = await AsyncStorage.getAllKeys()
      const items = await AsyncStorage.multiGet(keys)
      const backup = Object.fromEntries(items)
      const fileUri = `${FileSystem.documentDirectory}kume_backup.json`
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup))
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Error", "Compartir no está disponible en este dispositivo.")
        return
      }
      await Sharing.shareAsync(fileUri, { dialogTitle: "Exportar Backup Küme" })
    } catch (error) {
      console.error("Error al exportar los datos:", error)
      Alert.alert("Error", "No se pudieron exportar los datos.")
    }
  }

  const handleImportData = async () => {
    setShowOptionsMenu(false)
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/json" })
      if (result.canceled || !result.assets?.[0]?.uri) return
      const contents = await FileSystem.readAsStringAsync(result.assets[0].uri)
      const importedData = JSON.parse(contents)
      await AsyncStorage.clear()
      await AsyncStorage.multiSet(Object.entries(importedData))
      const restoredBudgets = importedData.presupuestos ? JSON.parse(importedData.presupuestos) : []
      setBudgets(Array.isArray(restoredBudgets) ? restoredBudgets : [])
      Alert.alert("Éxito", "Datos restaurados correctamente.")
    } catch (error) {
      console.error("Error al importar los datos:", error)
      Alert.alert("Error", "No se pudieron importar los datos.")
    }
  }

  useFocusEffect(
    useCallback(() => {
      fetchBudgets()
    }, [fetchBudgets]),
  )

  const counts = useMemo(() => {
    const currentMonth = new Date()
    const sentThisMonth = budgets.filter((budget) => {
      const date = new Date(budget.fechaCreacion)
      return !Number.isNaN(date.getTime()) && date.getMonth() === currentMonth.getMonth() && date.getFullYear() === currentMonth.getFullYear()
    }).length

    return {
      Todos: budgets.length,
      Pendiente: budgets.filter((budget) => budget.estado === "Pendiente").length,
      Aceptado: budgets.filter((budget) => budget.estado === "Aceptado").length,
      Rechazado: budgets.filter((budget) => budget.estado === "Rechazado").length,
      sentThisMonth,
      potential: budgets.filter((budget) => budget.estado === "Pendiente").reduce((sum, budget) => sum + (Number(budget.total) || 0), 0),
    }
  }, [budgets])

  const filteredBudgets = useMemo(() => {
    const search = searchText.trim().toLocaleLowerCase("es-AR")
    return budgets.filter((budget) => {
      const matchesFilter = activeFilter === "Todos" || budget.estado === activeFilter
      const searchable = [budget.clienteNombre, budget.tipoTrabajo, budget.descripcionTrabajo].filter(Boolean).join(" ").toLocaleLowerCase("es-AR")
      return matchesFilter && searchable.includes(search)
    })
  }, [activeFilter, budgets, searchText])

  const openBudget = (budget) => {
    router.push({ pathname: "BudgetDetailScreen", params: { presupuesto: JSON.stringify(budget) } })
  }

  const renderBudget = (budget) => {
    const status = getStatusStyles(budget.estado)
    const isExpired = budget.estado === "Pendiente" && budget.fechaValidez && new Date(budget.fechaValidez) < new Date()

    return (
      <TouchableOpacity key={budget.id} style={styles.budgetCard} onPress={() => openBudget(budget)} activeOpacity={0.78} accessibilityRole="button">
        <View style={styles.cardTopRow}>
          <View style={styles.cardTitleGroup}>
            <Text style={styles.clientName} numberOfLines={1}>{budget.clienteNombre || "Cliente"}</Text>
            {!!budget.tipoTrabajo && <Text style={styles.jobType} numberOfLines={1}>{budget.tipoTrabajo}</Text>}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.backgroundColor }]}>
            <Ionicons name={status.icon} size={14} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]}>{budget.estado || "Pendiente"}</Text>
          </View>
        </View>

        <Text style={styles.description} numberOfLines={2}>{budget.descripcionTrabajo || "Sin descripción del trabajo"}</Text>

        <View style={styles.cardDivider} />
        <View style={styles.cardBottomRow}>
          <View style={styles.dateRow}>
            <Ionicons name={budget.estado === "Aceptado" ? "checkmark-circle-outline" : "calendar-outline"} size={15} color={budget.estado === "Aceptado" ? COLORS.primary : COLORS.secondary} />
            <Text style={[styles.dateText, budget.estado === "Aceptado" && styles.acceptedDate]} numberOfLines={2}>
              {formatDate(budget.fechaCreacion)}
              {budget.estado === "Pendiente" && budget.fechaValidez ? ` · ${isExpired ? "Vencido" : `Válido hasta ${formatDate(budget.fechaValidez)}`}` : budget.estado === "Aceptado" ? " · Aceptado" : ""}
            </Text>
          </View>
          <Text style={styles.totalAmount}>{formatCurrency(budget.total)} <Text style={styles.currencyCode}>ARS</Text></Text>
          <View style={styles.openButton}><Ionicons name="chevron-forward" size={19} color={COLORS.secondary} /></View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace("/")} accessibilityRole="button" accessibilityLabel="Volver al inicio">
          <Ionicons name="arrow-back" size={22} color={COLORS.ink} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Presupuestos</Text>
        </View>
        <TouchableOpacity style={styles.headerAction} onPress={() => setActiveFilter((current) => current === "Pendiente" ? "Todos" : "Pendiente")} accessibilityRole="button" accessibilityLabel="Alternar filtro de pendientes">
          <Ionicons name="options-outline" size={21} color={COLORS.ink} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryStats}>
            <View style={styles.pendingSummary}><View style={styles.pendingDot} /><Text style={styles.pendingSummaryText}>{counts.Pendiente} {counts.Pendiente === 1 ? "pendiente" : "pendientes"}</Text></View>
            <View style={styles.sentBadge}><Text style={styles.sentBadgeText}>Enviados este mes: {counts.sentThisMonth}</Text></View>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.potentialRow}>
            <View>
              <Text style={styles.potentialLabel}>Total potencial por cerrar</Text>
              <Text style={styles.potentialValue}>{formatCurrency(counts.potential)} <Text style={styles.currencyCode}>ARS</Text></Text>
            </View>
            <Ionicons name="wallet-outline" size={22} color={COLORS.primary} />
          </View>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={21} color={COLORS.secondary} />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Buscar cliente o trabajo..."
            placeholderTextColor={COLORS.muted}
            returnKeyType="search"
            accessibilityLabel="Buscar presupuestos"
          />
          {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText("")} accessibilityRole="button" accessibilityLabel="Limpiar búsqueda"><Ionicons name="close-circle" size={19} color={COLORS.muted} /></TouchableOpacity>}
        </View>

        <ScrollView horizontal style={styles.filtersScroll} contentContainerStyle={styles.filtersRow} showsHorizontalScrollIndicator={false}>
          {FILTERS.map((filter) => {
            const active = activeFilter === filter.id
            const activeStyle = filter.id === "Pendiente" ? styles.filterChipPending : filter.id === "Aceptado" ? styles.filterChipAccepted : filter.id === "Rechazado" ? styles.filterChipRejected : styles.filterChipActive
            const activeTextStyle = filter.id === "Pendiente" ? styles.filterTextPending : filter.id === "Aceptado" ? styles.filterTextAccepted : filter.id === "Rechazado" ? styles.filterTextRejected : styles.filterTextActive
            return (
              <TouchableOpacity key={filter.id} onPress={() => setActiveFilter(filter.id)} style={[styles.filterChip, active && activeStyle]} accessibilityRole="button" accessibilityState={{ selected: active }}>
                <Text style={[styles.filterText, active && activeTextStyle]}>{filter.label} ({counts[filter.id]})</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        <TouchableOpacity style={styles.newBudgetButton} onPress={() => router.push("NewBudgetScreen")} activeOpacity={0.85} accessibilityRole="button">
          <Ionicons name="add" size={24} color={COLORS.surface} />
          <Text style={styles.newBudgetText}>Nuevo presupuesto</Text>
        </TouchableOpacity>

        <View style={styles.sectionHeading}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>{activeFilter === "Todos" ? "Recientes" : FILTERS.find((filter) => filter.id === activeFilter)?.label}</Text>
            <View style={styles.sectionCountBadge}><Text style={styles.sectionCount}>{filteredBudgets.length}</Text></View>
          </View>
          <Text style={styles.sortLabel}>Orden: Más nuevos</Text>
        </View>

        {filteredBudgets.length > 0 ? filteredBudgets.map(renderBudget) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Ionicons name={searchText ? "search-outline" : "document-text-outline"} size={24} color={COLORS.primary} /></View>
            <Text style={styles.emptyTitle}>{searchText ? "No encontramos resultados" : "Todavía no hay presupuestos"}</Text>
            <Text style={styles.emptyCopy}>{searchText ? "Probá con otro cliente o tipo de trabajo." : "Creá tu primera cotización y seguí su estado desde acá."}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomNav}>
        <NavItem icon="home" label="Inicio" onPress={() => router.replace("/")} />
        <NavItem icon="bar-chart-outline" label="Informes" onPress={() => router.push("ReportsScreen")} />
        <TouchableOpacity style={styles.navCreateButton} onPress={() => router.push("NewWorkScreen")} accessibilityRole="button" accessibilityLabel="Crear nuevo trabajo">
          <Ionicons name="add" size={30} color="#FFFFFF" />
        </TouchableOpacity>
        <NavItem icon="calendar-outline" label="Agenda" onPress={() => router.push("WeeklyCalendarScreen")} />
        <NavItem icon="menu-outline" label="Menú" onPress={() => setShowOptionsMenu((visible) => !visible)} />
      </View>

      {showOptionsMenu && (
        <View style={styles.optionsMenu}>
          <TouchableOpacity style={styles.optionButton} onPress={handleExportData}>
            <Ionicons name="save-outline" size={20} color={COLORS.primary} />
            <Text style={styles.optionButtonText}>Exportar backup</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionButton} onPress={handleImportData}>
            <Ionicons name="cloud-upload-outline" size={20} color={COLORS.primary} />
            <Text style={styles.optionButtonText}>Importar backup</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionButton} onPress={() => { setShowOptionsMenu(false); router.push("UsersScreen") }}>
            <Ionicons name="people-outline" size={20} color={COLORS.primary} />
            <Text style={styles.optionButtonText}>Usuarios</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "center", minHeight: 62, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8, gap: 10 },
  backButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  title: { color: COLORS.ink, fontSize: 21, lineHeight: 27, fontWeight: "800", letterSpacing: -0.5 },
  headerAction: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 22 },
  summaryCard: { backgroundColor: COLORS.surface, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 14, shadowColor: "#17201F", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.035, shadowRadius: 4, elevation: 1 },
  summaryStats: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  pendingSummary: { flexDirection: "row", alignItems: "center", gap: 8 },
  pendingSummaryText: { color: COLORS.ink, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  pendingDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#F3A51C" },
  sentBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: "#F4F3F0" },
  sentBadgeText: { color: COLORS.secondary, fontSize: 11, fontWeight: "700" },
  summaryDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  potentialRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  potentialLabel: { color: COLORS.secondary, fontSize: 13, fontWeight: "600", marginBottom: 3 },
  potentialValue: { color: COLORS.ink, fontSize: 25, lineHeight: 32, fontWeight: "800", letterSpacing: -0.6 },
  currencyCode: { color: COLORS.secondary, fontSize: 12, fontWeight: "600", letterSpacing: 0 },
  searchBox: { height: 50, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: 15, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  searchInput: { flex: 1, color: COLORS.ink, fontSize: 14, paddingVertical: 0 },
  filtersScroll: { flexGrow: 0, marginHorizontal: -16, marginBottom: 14 },
  filtersRow: { paddingHorizontal: 16, gap: 8 },
  filterChip: { minHeight: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 13, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipPending: { backgroundColor: "#FFF9E8", borderColor: "#F8D778" },
  filterChipAccepted: { backgroundColor: COLORS.mint, borderColor: "#A9DDD4" },
  filterChipRejected: { backgroundColor: "#F1F2EF", borderColor: "#D6DBD7" },
  filterText: { color: COLORS.secondary, fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: COLORS.surface },
  filterTextPending: { color: COLORS.amber },
  filterTextAccepted: { color: COLORS.primaryDark },
  filterTextRejected: { color: COLORS.secondary },
  newBudgetButton: { minHeight: 50, borderRadius: 13, backgroundColor: COLORS.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 17, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  newBudgetText: { color: COLORS.surface, fontSize: 15, fontWeight: "700" },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: COLORS.ink, fontSize: 18, fontWeight: "800", letterSpacing: -0.4 },
  sectionCountBadge: { minWidth: 24, height: 23, borderRadius: 12, backgroundColor: "#EFEEEB", alignItems: "center", justifyContent: "center", paddingHorizontal: 7 },
  sectionCount: { color: COLORS.secondary, fontSize: 11, fontWeight: "700" },
  sortLabel: { color: COLORS.secondary, fontSize: 11, fontWeight: "600" },
  budgetCard: { backgroundColor: COLORS.surface, borderRadius: 17, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 11, shadowColor: "#17201F", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.035, shadowRadius: 4, elevation: 1 },
  cardTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardTitleGroup: { flex: 1, paddingTop: 1 },
  clientName: { color: COLORS.ink, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  jobType: { color: COLORS.secondary, fontSize: 11, fontWeight: "700", marginTop: 3 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12 },
  statusText: { fontSize: 10, lineHeight: 14, fontWeight: "700" },
  description: { color: COLORS.secondary, fontSize: 12, lineHeight: 18, marginTop: 9 },
  cardDivider: { height: 1, backgroundColor: COLORS.border, marginTop: 11, marginBottom: 10 },
  cardBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  totalAmount: { color: COLORS.ink, fontSize: 18, lineHeight: 24, fontWeight: "800", letterSpacing: -0.5, marginLeft: 8 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  dateText: { color: COLORS.secondary, flex: 1, fontSize: 10, lineHeight: 15 },
  acceptedDate: { color: COLORS.primary },
  openButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.background, alignItems: "center", justifyContent: "center" },
  emptyState: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 30, borderRadius: 17, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  emptyIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: COLORS.mint, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { color: COLORS.ink, fontSize: 14, fontWeight: "700", textAlign: "center" },
  emptyCopy: { color: COLORS.secondary, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 5 },
  bottomNav: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: 6, paddingTop: 5 },
  navItem: { width: 62, alignItems: "center", justifyContent: "center", gap: 2 },
  navLabel: { color: COLORS.secondary, fontSize: 9, fontWeight: "500" },
  navLabelActive: { color: COLORS.primary, fontWeight: "700" },
  navActiveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.primary, position: "absolute", bottom: -5 },
  navCreateButton: { width: 48, height: 48, marginTop: -19, borderRadius: 17, backgroundColor: COLORS.primary, borderWidth: 3, borderColor: COLORS.background, alignItems: "center", justifyContent: "center", shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  optionsMenu: { position: "absolute", bottom: 70, right: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 6, borderWidth: 1, borderColor: COLORS.border, shadowColor: "#17201F", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 8, zIndex: 10 },
  optionButton: { flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 13 },
  optionButtonText: { fontSize: 14, color: COLORS.ink, marginLeft: 10, fontWeight: "500" },
})
