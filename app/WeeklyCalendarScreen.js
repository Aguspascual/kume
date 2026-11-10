import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "../lib/backendStorage"
import { useFocusEffect, useRouter } from "expo-router"
import { addDays, addWeeks, eachDayOfInterval, endOfWeek, format, isSameDay, isToday, startOfWeek } from "date-fns"
import { es } from "date-fns/locale"
import { useCallback, useMemo, useState } from "react"
import { Linking, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

const WEEK_OPTIONS = { weekStartsOn: 1 }

const toValidDate = (value) => {
  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

const titleCase = (value) => value ? value.charAt(0).toLocaleUpperCase("es-AR") + value.slice(1) : ""

const WeeklyCalendarScreen = () => {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [allWorks, setAllWorks] = useState([])
  const [menuVisible, setMenuVisible] = useState(false)

  const loadWorks = useCallback(async () => {
    try {
      const worksJson = await AsyncStorage.getItem("trabajos")
      const parsedWorks = worksJson ? JSON.parse(worksJson) : []
      setAllWorks(Array.isArray(parsedWorks) ? parsedWorks : [])
    } catch (error) {
      console.error("Error al cargar los trabajos del calendario:", error)
      setAllWorks([])
    }
  }, [])

  useFocusEffect(useCallback(() => { loadWorks() }, [loadWorks]))

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, WEEK_OPTIONS)
    return eachDayOfInterval({ start, end: endOfWeek(selectedDate, WEEK_OPTIONS) })
  }, [selectedDate])

  const worksByDay = useMemo(() => {
    const grouped = new Map()
    for (const work of allWorks) {
      const date = toValidDate(work.fecha)
      if (!date) continue
      const key = format(date, "yyyy-MM-dd")
      const dayWorks = grouped.get(key) || []
      dayWorks.push(work)
      grouped.set(key, dayWorks)
    }
    grouped.forEach((dayWorks) => dayWorks.sort((a, b) => (toValidDate(a.fecha)?.getTime() ?? 0) - (toValidDate(b.fecha)?.getTime() ?? 0)))
    return grouped
  }, [allWorks])

  const selectedWorks = useMemo(() => {
    const key = format(selectedDate, "yyyy-MM-dd")
    return worksByDay.get(key) || []
  }, [selectedDate, worksByDay])

  const navigateBack = () => router.canGoBack() ? router.back() : router.replace("/")
  const moveWeek = (offset) => setSelectedDate((date) => addWeeks(date, offset))
  const formattedMonth = titleCase(format(startOfWeek(selectedDate, WEEK_OPTIONS), "LLLL yyyy", { locale: es }))
  const selectedDayTitle = titleCase(format(selectedDate, "EEEE d 'de' MMMM", { locale: es }))

  const getStatus = (work) => {
    const status = work.estadoPago || "Pendiente"
    if (status === "Pagado") return { label: "Pagado", icon: "checkmark-circle-outline", color: "#087F75", background: "#E7F5F1" }
    if (status === "Cancelado") return { label: "Cancelado", icon: "close-circle-outline", color: "#748078", background: "#EEF0ED" }
    if (status === "Terminado, falta pago") return { label: "Falta pago", icon: "alert-circle-outline", color: "#A85D0A", background: "#FFF4DF" }
    return { label: "Pendiente", icon: "time-outline", color: "#A85D0A", background: "#FFF4DF" }
  }

  const openWork = (work) => router.push({ pathname: "WorkDetailScreen", params: { trabajo: JSON.stringify(work) } })

  const openTelephone = async (work) => {
    const phone = String(work.telefono || "").replace(/[^\d+]/g, "")
    if (!phone) return
    try {
      await Linking.openURL(`tel:${phone}`)
    } catch (error) {
      console.error("No se pudo abrir el teléfono del cliente:", error)
    }
  }

  const openMap = async (work) => {
    const address = work.domicilio || work.direccion
    if (!address) return
    try {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)
    } catch (error) {
      console.error("No se pudo abrir la ubicación del trabajo:", error)
    }
  }

  const renderWorkCard = (work, index) => {
    const startTime = toValidDate(work.fecha)
    const status = getStatus(work)
    const address = work.domicilio || work.direccion
    return (
      <View key={work.id || `${work.fecha}-${index}`} style={styles.timelineRow}>
        <View style={styles.timeColumn}>
          <Text style={styles.timeText}>{startTime ? format(startTime, "HH:mm") : "--:--"}</Text>
          <View style={styles.timelineTrack}><View style={styles.timelineDot} /><View style={styles.timelineLine} /></View>
        </View>
        <TouchableOpacity style={styles.workCard} onPress={() => openWork(work)} activeOpacity={0.78}>
          <View style={styles.cardTopLine}>
            <View style={styles.workHeading}>
              <Text style={styles.workType} numberOfLines={1}>{work.tipoTrabajo || "Trabajo programado"}</Text>
              <Text style={styles.clientName} numberOfLines={1}>{work.clienteNombre || "Cliente"}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: status.background }]}>
              <Ionicons name={status.icon} size={13} color={status.color} />
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
          {!!(work.trabajo || work.descripcionTrabajo) && <Text style={styles.workDescription} numberOfLines={2}>{work.trabajo || work.descripcionTrabajo}</Text>}
          {!!address && <View style={styles.addressRow}><Ionicons name="location-outline" size={14} color="#6D7A77" /><Text style={styles.addressText} numberOfLines={1}>{address}</Text></View>}
          <View style={styles.cardDivider} />
          <View style={styles.cardFooter}>
            <View style={styles.cardQuickActions}>
              {!!work.telefono && <TouchableOpacity style={styles.detailAction} onPress={() => openTelephone(work)} accessibilityLabel="Llamar al cliente"><Ionicons name="call-outline" size={16} color="#087F75" /><Text style={styles.detailActionText}>Llamar</Text></TouchableOpacity>}
              {!!address && <TouchableOpacity style={styles.detailAction} onPress={() => openMap(work)} accessibilityLabel="Abrir ubicación"><Ionicons name="navigate-outline" size={16} color="#087F75" /><Text style={styles.detailActionText}>Cómo llegar</Text></TouchableOpacity>}
            </View>
            <Ionicons name="chevron-forward" size={17} color="#89948E" />
          </View>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={navigateBack} style={styles.backButton} accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={21} color="#1A1C1A" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Calendario</Text>
          <Text style={styles.headerSubtitle}>Organizá tus trabajos y visitas</Text>
        </View>
        <View style={styles.brandBadge}><Text style={styles.brandBadgeText}>KÜME</Text></View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <View style={styles.monthNavigation}>
          <View style={styles.monthLabelGroup}>
            <Ionicons name="calendar-outline" size={18} color="#087F75" />
            <Text style={styles.monthLabel}>{formattedMonth}</Text>
          </View>
          <View style={styles.monthActions}>
            <TouchableOpacity style={styles.monthArrow} onPress={() => moveWeek(-1)} accessibilityLabel="Semana anterior"><Ionicons name="chevron-back" size={17} color="#3D4947" /></TouchableOpacity>
            <TouchableOpacity style={styles.todayButton} onPress={() => setSelectedDate(new Date())}><Text style={styles.todayButtonText}>Hoy</Text></TouchableOpacity>
            <TouchableOpacity style={styles.monthArrow} onPress={() => moveWeek(1)} accessibilityLabel="Semana siguiente"><Ionicons name="chevron-forward" size={17} color="#3D4947" /></TouchableOpacity>
          </View>
        </View>

        <View style={styles.weekSelector}>
          {weekDays.map((day) => {
            const active = isSameDay(day, selectedDate)
            const dayHasWorks = (worksByDay.get(format(day, "yyyy-MM-dd")) || []).length > 0
            return (
              <TouchableOpacity key={format(day, "yyyy-MM-dd")} style={[styles.dayButton, active && styles.dayButtonActive]} onPress={() => setSelectedDate(day)} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={titleCase(format(day, "EEEE d 'de' MMMM", { locale: es }))} accessibilityState={{ selected: active }}>
                <Text style={[styles.dayAbbreviation, active && styles.dayTextActive]}>{format(day, "EEE", { locale: es }).replace(".", "")}</Text>
                <Text style={[styles.dayNumber, active && styles.dayTextActive]}>{format(day, "d")}</Text>
                <View style={[styles.dayIndicator, dayHasWorks && styles.dayIndicatorMarked, dayHasWorks && active && styles.dayIndicatorSelected]} />
              </TouchableOpacity>
            )
          })}
        </View>

        <View style={styles.agendaHeading}>
          <View style={styles.agendaCopy}>
            <Text style={styles.agendaTitle}>{selectedDayTitle}</Text>
            <Text style={styles.agendaSubtitle}>{selectedWorks.length} {selectedWorks.length === 1 ? "trabajo programado" : "trabajos programados"}</Text>
          </View>
          <TouchableOpacity style={styles.newWorkButton} onPress={() => router.push("NewWorkScreen")}>
            <Ionicons name="add" size={17} color="#087F75" /><Text style={styles.newWorkButtonText}>Nuevo</Text>
          </TouchableOpacity>
        </View>

        {selectedWorks.length > 0 ? (
          <View style={styles.agendaList}>{selectedWorks.map(renderWorkCard)}</View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}><Ionicons name="calendar-clear-outline" size={25} color="#087F75" /></View>
            <Text style={styles.emptyTitle}>Día libre</Text>
            <Text style={styles.emptyDescription}>No hay trabajos programados para esta fecha.</Text>
            <TouchableOpacity style={styles.emptyAction} onPress={() => router.push("NewWorkScreen")}><Ionicons name="add" size={17} color="#087F75" /><Text style={styles.emptyActionText}>Agendar un trabajo</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomNav}>
        <NavItem icon="home-outline" label="Inicio" onPress={() => router.replace("/")} />
        <NavItem icon="bar-chart-outline" label="Informes" onPress={() => router.push("ReportsScreen")} />
        <TouchableOpacity style={styles.navCreateButton} onPress={() => router.push("NewWorkScreen")} accessibilityRole="button" accessibilityLabel="Crear trabajo"><Ionicons name="add" size={27} color="#FFFFFF" /></TouchableOpacity>
        <NavItem icon="calendar-outline" label="Agenda" active onPress={() => {}} />
        <NavItem icon="menu-outline" label="Menú" onPress={() => setMenuVisible(true)} />
      </View>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuScrim} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Accesos</Text>
            {[
              { label: "Clientes", icon: "people-outline", route: "NewClientScreen" },
              { label: "Presupuestos", icon: "document-text-outline", route: "BudgetsScreen" },
              { label: "Pagos y caja", icon: "wallet-outline", route: "PendingPaymentsScreen" },
              { label: "Informes", icon: "bar-chart-outline", route: "MonthlySummaryScreen" },
              { label: "Usuarios", icon: "people-circle-outline", route: "UsersScreen" },
            ].map((item) => (
              <TouchableOpacity key={item.route} style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push(item.route) }}>
                <Ionicons name={item.icon} size={19} color="#087F75" /><Text style={styles.menuItemText}>{item.label}</Text><Ionicons name="chevron-forward" size={16} color="#8A9691" />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const NavItem = ({ icon, label, active, onPress }) => (
  <TouchableOpacity style={styles.navItem} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}>
    <Ionicons name={icon} size={19} color={active ? "#0D9488" : "#89948E"} />
    <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
  </TouchableOpacity>
)

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAF9F6" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 7, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#EAE7E1", gap: 11 },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  headerCopy: { flex: 1 },
  title: { fontSize: 17, fontWeight: "700", color: "#1A1C1A" },
  headerSubtitle: { fontSize: 11, color: "#3D4947", marginTop: 2 },
  brandBadge: { borderWidth: 1, borderColor: "#EAE7E1", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#FFFFFF" },
  brandBadgeText: { color: "#087F75", fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 },
  monthNavigation: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  monthLabelGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  monthLabel: { fontSize: 14, fontWeight: "800", color: "#1A1C1A", textTransform: "capitalize" },
  monthActions: { flexDirection: "row", alignItems: "center", gap: 5 },
  monthArrow: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EAE7E1" },
  todayButton: { paddingHorizontal: 11, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#F0FDFA", borderWidth: 1, borderColor: "#CDEBE5" },
  todayButtonText: { color: "#087F75", fontSize: 11, fontWeight: "700" },
  weekSelector: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EAE7E1", borderRadius: 16, padding: 7, marginBottom: 20 },
  dayButton: { flex: 1, minHeight: 66, alignItems: "center", justifyContent: "center", borderRadius: 11, gap: 3 },
  dayButtonActive: { backgroundColor: "#0D9488" },
  dayAbbreviation: { color: "#6D7A77", fontSize: 10, fontWeight: "600", textTransform: "capitalize" },
  dayNumber: { color: "#1A1C1A", fontSize: 15, fontWeight: "700" },
  dayTextActive: { color: "#FFFFFF" },
  dayIndicator: { width: 4, height: 4, borderRadius: 2, backgroundColor: "transparent", marginTop: 1 },
  dayIndicatorMarked: { backgroundColor: "#0D9488" },
  dayIndicatorSelected: { backgroundColor: "#FFFFFF" },
  agendaHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  agendaCopy: { flex: 1 },
  agendaTitle: { color: "#1A1C1A", fontSize: 18, fontWeight: "800", letterSpacing: -0.3, textTransform: "capitalize" },
  agendaSubtitle: { color: "#6D7A77", fontSize: 11, marginTop: 3 },
  newWorkButton: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 11, borderRadius: 9, borderWidth: 1, borderColor: "#BBDCD5", backgroundColor: "#FFFFFF" },
  newWorkButtonText: { color: "#087F75", fontSize: 11, fontWeight: "700" },
  agendaList: { paddingBottom: 8 },
  timelineRow: { flexDirection: "row", alignItems: "stretch", minHeight: 138 },
  timeColumn: { width: 52, alignItems: "flex-start" },
  timeText: { color: "#3D4947", fontSize: 11, fontWeight: "700", paddingTop: 4 },
  timelineTrack: { flex: 1, alignItems: "center", width: 14, marginLeft: 17, marginTop: 8 },
  timelineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#0D9488", borderWidth: 2, borderColor: "#D9F1EC", zIndex: 1 },
  timelineLine: { position: "absolute", top: 7, bottom: -5, width: 1, backgroundColor: "#D9DFDC" },
  workCard: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#EAE7E1", padding: 13, marginBottom: 12, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.035, shadowRadius: 3, elevation: 1 },
  cardTopLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 7 },
  workHeading: { flex: 1 },
  workType: { color: "#1A1C1A", fontSize: 13, fontWeight: "700" },
  clientName: { color: "#3D4947", fontSize: 11, marginTop: 3 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7 },
  statusText: { fontSize: 9, fontWeight: "700" },
  workDescription: { color: "#55625D", fontSize: 11, lineHeight: 16, marginTop: 10 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  addressText: { flex: 1, color: "#6D7A77", fontSize: 10 },
  cardDivider: { height: 1, backgroundColor: "#F1EFEA", marginTop: 10, marginBottom: 8 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardQuickActions: { flexDirection: "row", alignItems: "center", gap: 13 },
  detailAction: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3 },
  detailActionText: { color: "#087F75", fontSize: 10, fontWeight: "700" },
  emptyCard: { alignItems: "center", paddingHorizontal: 22, paddingVertical: 28, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EAE7E1", borderRadius: 16, marginTop: 4 },
  emptyIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#F0FDFA", marginBottom: 11 },
  emptyTitle: { color: "#1A1C1A", fontSize: 14, fontWeight: "700" },
  emptyDescription: { color: "#6D7A77", fontSize: 11, textAlign: "center", marginTop: 5, lineHeight: 16 },
  emptyAction: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#BBDCD5", backgroundColor: "#FFFFFF", borderRadius: 9, paddingHorizontal: 11, marginTop: 14 },
  emptyActionText: { color: "#087F75", fontSize: 11, fontWeight: "700" },
  bottomNav: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EAE7E1", paddingHorizontal: 5, paddingTop: 5 },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48, gap: 3 },
  navLabel: { fontSize: 9, color: "#89948E", fontWeight: "500" },
  navLabelActive: { color: "#0D9488", fontWeight: "700" },
  navCreateButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#0D9488", alignItems: "center", justifyContent: "center", marginHorizontal: 4, marginTop: -10, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.13, shadowRadius: 5, elevation: 3 },
  menuScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.42)" },
  menuCard: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 20, paddingBottom: Platform.OS === "ios" ? 30 : 20 },
  menuTitle: { color: "#1A1C1A", fontSize: 17, fontWeight: "800", marginBottom: 11 },
  menuItem: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 11, borderTopWidth: 1, borderTopColor: "#F1EFEA" },
  menuItemText: { flex: 1, color: "#1A1C1A", fontSize: 13, fontWeight: "600" },
})

export default WeeklyCalendarScreen
