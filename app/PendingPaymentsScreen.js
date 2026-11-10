import { useCallback, useMemo, useState } from "react"
import { Alert, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "../lib/backendStorage"
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
}

const FILTERS = [
  { id: "Todos", label: "Todos" },
  { id: "Pendiente", label: "En curso" },
  { id: "Terminado, falta pago", label: "Terminado, falta pago" },
]

const getWorkAmount = (work) => (Number(work.costoMateriales) || 0) + (Number(work.costoManoDeObra) || 0)

const NavItem = ({ icon, label, onPress }) => (
  <TouchableOpacity style={styles.navItem} onPress={onPress} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={label}>
    <Ionicons name={icon} size={21} color={COLORS.secondary} />
    <Text style={styles.navLabel}>{label}</Text>
  </TouchableOpacity>
)

const PendingPaymentsScreen = () => {
  const router = useRouter()
  const [pendingWorks, setPendingWorks] = useState([])
  const [searchText, setSearchText] = useState("")
  const [activeFilter, setActiveFilter] = useState("Todos")
  const [showOptionsMenu, setShowOptionsMenu] = useState(false)

  const loadPendingWorks = useCallback(async () => {
    try {
      const trabajosJSON = await AsyncStorage.getItem("trabajos")
      const allTrabajos = trabajosJSON ? JSON.parse(trabajosJSON) : []
      const pending = (Array.isArray(allTrabajos) ? allTrabajos : [])
        .filter((trabajo) => trabajo.estadoPago !== "Pagado" && trabajo.estadoPago !== "Cancelado")
        .sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime())
      setPendingWorks(pending)
    } catch (error) {
      console.error("Error al cargar los trabajos pendientes:", error)
      setPendingWorks([])
    }
  }, [])

  useFocusEffect(useCallback(() => { loadPendingWorks() }, [loadPendingWorks]))

  const handleExportData = async () => {
    setShowOptionsMenu(false)
    try {
      const keys = await AsyncStorage.getAllKeys()
      const items = await AsyncStorage.multiGet(keys)
      const fileUri = `${FileSystem.documentDirectory}kume_backup.json`
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(Object.fromEntries(items)))
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
      await loadPendingWorks()
      Alert.alert("Éxito", "Datos restaurados correctamente.")
    } catch (error) {
      console.error("Error al importar los datos:", error)
      Alert.alert("Error", "No se pudieron importar los datos.")
    }
  }

  const formatCurrency = (amount) => new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0)

  const formatDate = (value) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? "Fecha sin registrar" : date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
  }

  const counts = useMemo(() => ({
    Todos: pendingWorks.length,
    Pendiente: pendingWorks.filter((work) => work.estadoPago === "Pendiente").length,
    "Terminado, falta pago": pendingWorks.filter((work) => work.estadoPago === "Terminado, falta pago").length,
  }), [pendingWorks])

  const filteredWorks = useMemo(() => {
    const search = searchText.trim().toLocaleLowerCase("es-AR")
    return pendingWorks.filter((work) => {
      const matchesFilter = activeFilter === "Todos" || work.estadoPago === activeFilter
      const haystack = [work.clienteNombre, work.tipoTrabajo, work.trabajo].filter(Boolean).join(" ").toLocaleLowerCase("es-AR")
      return matchesFilter && haystack.includes(search)
    })
  }, [activeFilter, pendingWorks, searchText])

  const totalDeuda = pendingWorks.reduce((sum, work) => sum + getWorkAmount(work), 0)

  const handleWorkPress = (trabajo) => {
    router.push({ pathname: "/WorkDetailScreen", params: { trabajo: JSON.stringify(trabajo) } })
  }

  const renderWorkItem = ({ item }) => {
    const total = getWorkAmount(item)
    const isCompleted = item.estadoPago === "Terminado, falta pago"
    return (
      <TouchableOpacity style={styles.workCard} onPress={() => handleWorkPress(item)} activeOpacity={0.78} accessibilityRole="button">
        <View style={styles.workTopRow}>
          <View style={styles.clientLine}>
            <Ionicons name="person-outline" size={17} color={COLORS.primary} />
            <Text style={styles.clientName} numberOfLines={1}>{item.clienteNombre || "Cliente"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={COLORS.muted} />
        </View>
        <Text style={styles.workDescription} numberOfLines={2}>{item.trabajo || item.tipoTrabajo || "Trabajo sin descripción"}</Text>
        {!!item.tipoTrabajo && !!item.trabajo && <Text style={styles.workType} numberOfLines={1}>{item.tipoTrabajo}</Text>}
        <View style={styles.cardDivider} />
        <View style={styles.workFooter}>
          <View style={styles.workMeta}>
            <View style={[styles.statusBadge, isCompleted ? styles.completedBadge : styles.pendingBadge]}>
              <Ionicons name={isCompleted ? "checkmark-circle-outline" : "time-outline"} size={13} color={COLORS.amber} />
              <Text style={styles.statusText}>{isCompleted ? "Terminado, falta pago" : "Saldo pendiente"}</Text>
            </View>
            <View style={styles.dateLine}><Ionicons name="calendar-outline" size={14} color={COLORS.muted} /><Text style={styles.workDate} numberOfLines={1}>{formatDate(item.fecha)}</Text></View>
          </View>
          <View style={styles.amountColumn}>
            <Text style={styles.workAmount}>{formatCurrency(total)}</Text>
            <Text style={styles.amountBreakdown}>Mat. {formatCurrency(item.costoMateriales)} + MO {formatCurrency(item.costoManoDeObra)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={21} color={COLORS.ink} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}><Text style={styles.title}>Pendientes</Text><View style={styles.headerCount}><Text style={styles.headerCountText}>{pendingWorks.length} a cobrar</Text></View></View>
          <Text style={styles.subtitle}>Seguimiento de cobros en taller y obra</Text>
        </View>
        <TouchableOpacity onPress={loadPendingWorks} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Actualizar pendientes">
          <Ionicons name="refresh-outline" size={20} color={COLORS.ink} />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryIcon}><Ionicons name="wallet-outline" size={21} color={COLORS.amber} /></View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>TOTAL A COBRAR</Text>
            <Text style={styles.summaryHint}>Materiales + mano de obra</Text>
          </View>
          <View style={styles.unpaidTag}><View style={styles.unpaidDot} /><Text style={styles.unpaidText}>Sin liquidar</Text></View>
        </View>
        <View style={styles.summaryDivider} />
        <Text style={styles.totalAmount}>{formatCurrency(totalDeuda)} <Text style={styles.currencyCode}>ARS</Text></Text>
        <Text style={styles.pendingCount}>{pendingWorks.length} {pendingWorks.length === 1 ? "trabajo con saldo pendiente de pago" : "trabajos con saldo pendiente de pago"}</Text>
        <View style={styles.summaryAccent} />
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={20} color={COLORS.secondary} />
        <TextInput style={styles.searchInput} value={searchText} onChangeText={setSearchText} placeholder="Buscar por cliente o trabajo..." placeholderTextColor={COLORS.muted} returnKeyType="search" accessibilityLabel="Buscar pendientes" />
        {!!searchText && <TouchableOpacity onPress={() => setSearchText("")} accessibilityLabel="Limpiar búsqueda"><Ionicons name="close-circle" size={18} color={COLORS.muted} /></TouchableOpacity>}
      </View>

      <ScrollView horizontal style={styles.filtersScroll} contentContainerStyle={styles.filtersRow} showsHorizontalScrollIndicator={false}>
        {FILTERS.map((filter) => {
          const active = activeFilter === filter.id
          const filterCount = counts[filter.id] || 0
          return (
            <TouchableOpacity key={filter.id} onPress={() => setActiveFilter(filter.id)} style={[styles.filterChip, active && styles.filterChipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter.label}</Text>
              <Text style={[styles.filterCount, active && styles.filterCountActive]}>{filterCount}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <FlatList
        data={filteredWorks}
        renderItem={renderWorkItem}
        keyExtractor={(item, index) => String(item.id ?? index)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Ionicons name="checkmark-done-outline" size={27} color={COLORS.primary} /></View>
            <Text style={styles.emptyTitle}>{searchText ? "No encontramos resultados" : "No hay cobros pendientes"}</Text>
            <Text style={styles.emptyCopy}>{searchText ? "Probá con otro cliente o trabajo." : "Los trabajos sin cobrar van a aparecer acá."}</Text>
          </View>
        )}
        ListFooterComponent={filteredWorks.length ? <Text style={styles.footerNote}>Saldos calculados con materiales y mano de obra.</Text> : null}
      />

      <View style={styles.bottomNav}>
        <NavItem icon="home" label="Inicio" onPress={() => router.replace("/")} />
        <NavItem icon="bar-chart-outline" label="Informes" onPress={() => router.push("ReportsScreen")} />
        <TouchableOpacity style={styles.navCreateButton} onPress={() => router.push("NewWorkScreen")} accessibilityRole="button" accessibilityLabel="Crear nuevo trabajo"><Ionicons name="add" size={30} color="#FFFFFF" /></TouchableOpacity>
        <NavItem icon="calendar-outline" label="Agenda" onPress={() => router.push("WeeklyCalendarScreen")} />
        <NavItem icon="menu-outline" label="Menú" onPress={() => setShowOptionsMenu((visible) => !visible)} />
      </View>

      {showOptionsMenu && (
        <View style={styles.optionsMenu}>
          <TouchableOpacity style={styles.optionButton} onPress={handleExportData}><Ionicons name="save-outline" size={20} color={COLORS.primary} /><Text style={styles.optionButtonText}>Exportar backup</Text></TouchableOpacity>
          <TouchableOpacity style={styles.optionButton} onPress={handleImportData}><Ionicons name="cloud-upload-outline" size={20} color={COLORS.primary} /><Text style={styles.optionButtonText}>Importar backup</Text></TouchableOpacity>
          <TouchableOpacity style={styles.optionButton} onPress={() => { setShowOptionsMenu(false); router.push("UsersScreen") }}><Ionicons name="people-outline" size={20} color={COLORS.primary} /><Text style={styles.optionButtonText}>Usuarios</Text></TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: COLORS.ink, fontSize: 20, lineHeight: 25, fontWeight: "800" },
  headerCount: { backgroundColor: COLORS.peach, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  headerCountText: { color: COLORS.amber, fontSize: 10, fontWeight: "700" },
  subtitle: { color: COLORS.secondary, fontSize: 11, marginTop: 2 },
  summaryCard: { backgroundColor: COLORS.surface, borderRadius: 17, borderWidth: 1, borderColor: COLORS.border, marginHorizontal: 16, marginTop: 14, marginBottom: 12, padding: 15, overflow: "hidden", shadowColor: "#17201F", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.035, shadowRadius: 4, elevation: 1 },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  summaryIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: COLORS.peach },
  summaryCopy: { flex: 1 },
  summaryTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "800", letterSpacing: 0.6 },
  summaryHint: { color: COLORS.muted, fontSize: 11, fontWeight: "600", marginTop: 3 },
  unpaidTag: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9, backgroundColor: COLORS.peach },
  unpaidDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.amber },
  unpaidText: { color: COLORS.amber, fontSize: 10, fontWeight: "700" },
  summaryDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  totalAmount: { color: COLORS.ink, fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.8 },
  currencyCode: { color: COLORS.secondary, fontSize: 12, fontWeight: "600", letterSpacing: 0 },
  pendingCount: { color: COLORS.secondary, fontSize: 12, marginTop: 2 },
  summaryAccent: { height: 5, backgroundColor: "#EFCB81", borderRadius: 3, marginTop: 13 },
  searchBox: { height: 47, flexDirection: "row", alignItems: "center", gap: 9, marginHorizontal: 16, paddingHorizontal: 12, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, height: "100%", color: COLORS.ink, fontSize: 13 },
  filtersScroll: { flexGrow: 0, marginTop: 11, marginBottom: 8 },
  filtersRow: { paddingHorizontal: 16, gap: 8 },
  filterChip: { minHeight: 37, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, borderRadius: 19, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { color: COLORS.secondary, fontSize: 11, fontWeight: "700" },
  filterTextActive: { color: COLORS.surface },
  filterCount: { minWidth: 19, height: 19, textAlign: "center", textAlignVertical: "center", color: COLORS.secondary, backgroundColor: "#EFEEEB", borderRadius: 10, overflow: "hidden", fontSize: 10, fontWeight: "700", paddingHorizontal: 4 },
  filterCountActive: { color: COLORS.primaryDark, backgroundColor: "rgba(255,255,255,0.82)" },
  listContent: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 16, flexGrow: 1 },
  workCard: { backgroundColor: COLORS.surface, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, padding: 13, marginBottom: 10, shadowColor: "#17201F", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.035, shadowRadius: 4, elevation: 1 },
  workTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  clientLine: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  clientName: { flex: 1, color: COLORS.ink, fontSize: 14, fontWeight: "800" },
  workDescription: { color: COLORS.secondary, fontSize: 12, lineHeight: 18, marginTop: 7 },
  workType: { color: COLORS.muted, fontSize: 10, fontWeight: "600", marginTop: 3 },
  cardDivider: { height: 1, backgroundColor: COLORS.border, marginTop: 10, marginBottom: 9 },
  workFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  workMeta: { flex: 1, gap: 7 },
  statusBadge: { alignSelf: "flex-start", minHeight: 25, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 7, borderRadius: 7, borderWidth: 1 },
  pendingBadge: { backgroundColor: "#FFF8E8", borderColor: "#F3D493" },
  completedBadge: { backgroundColor: COLORS.peach, borderColor: "#F3D493" },
  statusText: { color: COLORS.amber, fontSize: 9, fontWeight: "700" },
  dateLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  workDate: { color: COLORS.muted, fontSize: 10, fontWeight: "600" },
  amountColumn: { maxWidth: "44%", alignItems: "flex-end" },
  workAmount: { color: COLORS.ink, fontSize: 17, fontWeight: "800" },
  amountBreakdown: { color: COLORS.muted, fontSize: 8, textAlign: "right", marginTop: 2 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 38, backgroundColor: COLORS.surface, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, marginTop: 7 },
  emptyIcon: { width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: COLORS.mint, marginBottom: 12 },
  emptyTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "700", textAlign: "center" },
  emptyCopy: { color: COLORS.secondary, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 5 },
  footerNote: { color: COLORS.muted, fontSize: 10, fontWeight: "600", textAlign: "center", paddingVertical: 12 },
  bottomNav: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: 6, paddingTop: 5 },
  navItem: { width: 62, alignItems: "center", justifyContent: "center", gap: 2 },
  navLabel: { color: COLORS.secondary, fontSize: 9, fontWeight: "500" },
  navCreateButton: { width: 48, height: 48, marginTop: -19, borderRadius: 17, backgroundColor: COLORS.primary, borderWidth: 3, borderColor: COLORS.background, alignItems: "center", justifyContent: "center", shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  optionsMenu: { position: "absolute", bottom: 70, right: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 6, borderWidth: 1, borderColor: COLORS.border, shadowColor: "#17201F", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 8, zIndex: 10 },
  optionButton: { flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 13 },
  optionButtonText: { fontSize: 14, color: COLORS.ink, marginLeft: 10, fontWeight: "500" },
})

export default PendingPaymentsScreen
