import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "../lib/backendStorage"
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import { useCallback, useMemo, useState } from "react"
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

const parseAmount = (value) => {
  if (typeof value === "number") return value
  return Number(String(value ?? "").replace(/\D/g, "")) || 0
}

const getInitials = (client) => `${client?.nombre?.trim()?.[0] || ""}${client?.apellido?.trim()?.[0] || ""}`.toUpperCase() || "?"

const readClientParam = (value) => {
  try {
    return JSON.parse(value || "{}")
  } catch {
    return {}
  }
}

const getPaymentStyle = (status) => {
  if (status === "Pagado") return { label: "Pagado", color: "#087F75", background: "#E7F5F1", icon: "checkmark-circle-outline" }
  if (status === "Cancelado") return { label: "Cancelado", color: "#748078", background: "#EEF0ED", icon: "close-circle-outline" }
  if (status === "Terminado, falta pago") return { label: "Falta pago", color: "#A85D0A", background: "#FFF1D9", icon: "alert-circle-outline" }
  return { label: status || "Pendiente", color: "#A85D0A", background: "#FFF1D9", icon: "time-outline" }
}

const ClientDetailScreen = () => {
  const router = useRouter()
  const { cliente: clientParam } = useLocalSearchParams()
  const initialClientJson = Array.isArray(clientParam) ? clientParam[0] : clientParam
  const [cliente, setCliente] = useState(() => readClientParam(initialClientJson))
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [domicilioEdit, setDomicilioEdit] = useState(cliente.domicilio || "")
  const [telefonoEdit, setTelefonoEdit] = useState(cliente.telefono || "")
  const [trabajos, setTrabajos] = useState([])
  const [workFilter, setWorkFilter] = useState("Todos")

  const loadTrabajos = useCallback(async () => {
    try {
      const trabajosJson = await AsyncStorage.getItem("trabajos")
      const allWorks = trabajosJson ? JSON.parse(trabajosJson) : []
      const clientWorks = (Array.isArray(allWorks) ? allWorks : [])
        .filter((work) => String(work.clienteId) === String(cliente.id))
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      setTrabajos(clientWorks)
    } catch (error) {
      console.error("Error al cargar los trabajos del cliente:", error)
      Alert.alert("Error", "No se pudieron cargar los trabajos del cliente.")
    }
  }, [cliente.id])

  useFocusEffect(useCallback(() => { loadTrabajos() }, [loadTrabajos]))

  const totalPendiente = useMemo(() => trabajos
    .filter((work) => work.estadoPago === "Pendiente" || work.estadoPago === "Terminado, falta pago")
    .reduce((total, work) => total + parseAmount(work.costoMateriales) + parseAmount(work.costoManoDeObra), 0), [trabajos])

  const trabajosFiltrados = useMemo(() => trabajos.filter((work) => {
    if (workFilter === "Pendientes") return work.estadoPago === "Pendiente" || work.estadoPago === "Terminado, falta pago"
    if (workFilter === "Pagados") return work.estadoPago === "Pagado"
    return true
  }), [trabajos, workFilter])

  const formatCurrency = (amount) => new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(parseAmount(amount))

  const formatDate = (value) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? "Fecha sin definir" : date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
  }

  const handleCall = async () => {
    const phone = telefonoEdit.trim()
    if (!phone) return
    try {
      await Linking.openURL(`tel:${phone}`)
    } catch (error) {
      console.error("Error al llamar al cliente:", error)
      Alert.alert("Error", "No se pudo iniciar la llamada.")
    }
  }

  const handleWhatsApp = async () => {
    const phone = telefonoEdit.replace(/\D/g, "")
    if (!phone) return
    try {
      const url = `whatsapp://send?phone=${phone}`
      const supported = await Linking.canOpenURL(url)
      if (!supported) {
        Alert.alert("WhatsApp no disponible", "No se pudo abrir WhatsApp en este dispositivo.")
        return
      }
      await Linking.openURL(url)
    } catch (error) {
      console.error("Error al abrir WhatsApp:", error)
      Alert.alert("Error", "No se pudo abrir WhatsApp.")
    }
  }

  const handleOpenMap = async () => {
    const address = domicilioEdit.trim()
    if (!address) return
    try {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)
    } catch (error) {
      console.error("Error al abrir la dirección del cliente:", error)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const clientsJson = await AsyncStorage.getItem("clientes")
      const allClients = clientsJson ? JSON.parse(clientsJson) : []
      const updatedClient = { ...cliente, domicilio: domicilioEdit.trim(), telefono: telefonoEdit.trim() }
      const updatedClients = (Array.isArray(allClients) ? allClients : []).map((item) => String(item.id) === String(cliente.id) ? updatedClient : item)
      await AsyncStorage.setItem("clientes", JSON.stringify(updatedClients))
      setCliente(updatedClient)
      setDomicilioEdit(updatedClient.domicilio)
      setTelefonoEdit(updatedClient.telefono)
      setIsEditing(false)
      Alert.alert("Guardado", "Los datos del cliente se actualizaron.")
    } catch (error) {
      console.error("Error al guardar los datos del cliente:", error)
      Alert.alert("Error", "No se pudieron guardar los datos del cliente.")
    } finally {
      setIsSaving(false)
    }
  }

  const toggleEditing = () => {
    if (isEditing) {
      setDomicilioEdit(cliente.domicilio || "")
      setTelefonoEdit(cliente.telefono || "")
      setIsEditing(false)
      return
    }
    setIsEditing(true)
  }

  const openWork = (work) => router.push({ pathname: "/WorkDetailScreen", params: { trabajo: JSON.stringify(work) } })
  const openNewWork = () => router.push({ pathname: "/NewWorkScreen", params: { clienteId: String(cliente.id) } })

  const renderWork = (work, index) => {
    const status = getPaymentStyle(work.estadoPago)
    const amount = parseAmount(work.costoMateriales) + parseAmount(work.costoManoDeObra)
    return (
      <TouchableOpacity key={String(work.id ?? index)} style={[styles.workCard, work.estadoPago === "Cancelado" && styles.cancelledWorkCard]} onPress={() => openWork(work)} activeOpacity={0.78}>
        <View style={styles.workCardTop}>
          <Text style={styles.workDate}>{formatDate(work.fecha)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: status.background }]}><View style={[styles.statusDot, { backgroundColor: status.color }]} /><Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text></View>
        </View>
        <Text style={[styles.workDescription, work.estadoPago === "Cancelado" && styles.cancelledText]} numberOfLines={2}>{work.trabajo || work.tipoTrabajo || "Trabajo sin descripción"}</Text>
        <View style={styles.workCardBottom}>
          <View style={styles.workTypeLine}><Ionicons name="construct-outline" size={14} color="#748078" /><Text style={styles.workTypeText} numberOfLines={1}>{work.tipoTrabajo || "Trabajo"}</Text></View>
          <Text style={[styles.workAmount, work.estadoPago === "Cancelado" && styles.cancelledText]}>{formatCurrency(amount)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color="#89948E" style={styles.workChevron} />
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton} accessibilityLabel="Volver a clientes"><Ionicons name="arrow-back" size={21} color="#1A1C1A" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Detalle del cliente</Text>
        <TouchableOpacity onPress={toggleEditing} style={styles.headerButton} accessibilityLabel={isEditing ? "Cancelar edición" : "Editar cliente"}><Ionicons name={isEditing ? "close" : "pencil-outline"} size={20} color="#087F75" /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.identityCard}>
          <View style={styles.identityTop}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{getInitials(cliente)}</Text></View>
            <View style={styles.identityCopy}>
              <View style={styles.identityTags}><Text style={styles.clientTag}>CLIENTE</Text>{!!cliente.tipoCliente && <Text style={styles.clientCategory}>{cliente.tipoCliente}</Text>}</View>
              <Text style={styles.clientName}>{`${cliente.nombre || ""} ${cliente.apellido || ""}`.trim() || "Cliente"}</Text>
            </View>
          </View>
          <View style={styles.identityDivider} />
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.callAction} onPress={handleCall}><Ionicons name="call-outline" size={18} color="#087F75" /><Text style={styles.callActionText}>Llamar</Text></TouchableOpacity>
            <TouchableOpacity style={styles.whatsAppAction} onPress={handleWhatsApp}><Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" /><Text style={styles.whatsAppActionText}>WhatsApp</Text></TouchableOpacity>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={styles.metricHeading}><Text style={styles.metricLabel}>TRABAJOS</Text><Ionicons name="construct-outline" size={18} color="#748078" /></View>
            <View style={styles.metricValueRow}><Text style={styles.metricValue}>{trabajos.length}</Text><Text style={styles.metricSuffix}>{trabajos.length === 1 ? "total" : "totales"}</Text></View>
            <Text style={styles.metricFootnote}>Asociados a este cliente</Text>
          </View>
          <View style={[styles.metricCard, styles.balanceCard]}>
            <View style={styles.metricHeading}><Text style={styles.balanceLabel}>SALDO PENDIENTE</Text><Ionicons name="wallet-outline" size={18} color="#A85D0A" /></View>
            <Text style={styles.balanceValue}>{formatCurrency(totalPendiente)}</Text>
            <Text style={styles.balanceFootnote}>De trabajos sin cobrar</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Información de contacto</Text>
            {isEditing && <Text style={styles.editingLabel}>EDITANDO</Text>}
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={19} color="#748078" />
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Teléfono principal</Text>
              {isEditing ? <TextInput style={styles.infoInput} value={telefonoEdit} onChangeText={setTelefonoEdit} placeholder="Ingresá el teléfono" placeholderTextColor="#89948E" keyboardType="phone-pad" /> : <Text style={styles.infoValue}>{cliente.telefono || "Sin teléfono registrado"}</Text>}
            </View>
            {!isEditing && !!cliente.telefono && <TouchableOpacity onPress={handleWhatsApp} style={styles.infoAction} accessibilityLabel="Abrir WhatsApp"><Ionicons name="logo-whatsapp" size={19} color="#087F75" /></TouchableOpacity>}
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={19} color="#748078" />
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Dirección de obra / entrega</Text>
              {isEditing ? <TextInput style={[styles.infoInput, styles.addressInput]} value={domicilioEdit} onChangeText={setDomicilioEdit} placeholder="Ingresá el domicilio" placeholderTextColor="#89948E" multiline /> : <Text style={styles.infoValue}>{cliente.domicilio || "Sin domicilio registrado"}</Text>}
            </View>
            {!isEditing && !!cliente.domicilio && <TouchableOpacity onPress={handleOpenMap} style={styles.infoAction} accessibilityLabel="Ver dirección en el mapa"><Ionicons name="navigate-outline" size={19} color="#087F75" /></TouchableOpacity>}
          </View>
        </View>

        <View style={styles.jobsHeading}>
          <View style={styles.jobsTitleRow}><Text style={styles.sectionTitle}>Trabajos asociados</Text><View style={styles.jobsCount}><Text style={styles.jobsCountText}>{trabajos.length}</Text></View></View>
          <TouchableOpacity onPress={() => setWorkFilter("Todos")}><Text style={styles.viewAllText}>Ver todos</Text></TouchableOpacity>
        </View>
        <View style={styles.filterBar}>
          {[
            { label: "Todos", count: trabajos.length },
            { label: "Pendientes", count: trabajos.filter((work) => work.estadoPago === "Pendiente" || work.estadoPago === "Terminado, falta pago").length },
            { label: "Pagados", count: trabajos.filter((work) => work.estadoPago === "Pagado").length },
          ].map((filter) => (
            <TouchableOpacity key={filter.label} onPress={() => setWorkFilter(filter.label)} style={[styles.filterChip, workFilter === filter.label && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, workFilter === filter.label && styles.filterChipTextActive]}>{filter.label} ({filter.count})</Text>
            </TouchableOpacity>
          ))}
        </View>

        {trabajosFiltrados.length ? (
          <View style={styles.workList}>{trabajosFiltrados.map(renderWork)}</View>
        ) : (
          <View style={styles.emptyWorkCard}>
            <View style={styles.emptyIcon}><Ionicons name="construct-outline" size={24} color="#087F75" /></View>
            <Text style={styles.emptyTitle}>{trabajos.length ? "No hay trabajos en este filtro" : "Todavía no hay trabajos"}</Text>
            <Text style={styles.emptyDescription}>{trabajos.length ? "Elegí otro filtro para ver los trabajos del cliente." : "Cuando agendes un trabajo, va a aparecer en esta ficha."}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.newWorkButton} onPress={openNewWork}>
          <Ionicons name="add" size={21} color="#087F75" /><Text style={styles.newWorkButtonText}>Crear nuevo trabajo para este cliente</Text>
        </TouchableOpacity>
      </ScrollView>

      {isEditing && <View style={styles.saveBar}><TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={isSaving}><Ionicons name={isSaving ? "hourglass-outline" : "checkmark-circle-outline"} size={19} color="#FFFFFF" /><Text style={styles.saveButtonText}>{isSaving ? "Guardando…" : "Guardar cambios"}</Text></TouchableOpacity></View>}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAF9F6" },
  header: { minHeight: 54, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#EAE7E1" },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  headerTitle: { flex: 1, textAlign: "center", color: "#1A1C1A", fontSize: 16, fontWeight: "700" },
  scrollContent: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 30 },
  identityCard: { backgroundColor: "#FFFFFF", borderRadius: 17, borderWidth: 1, borderColor: "#EAE7E1", padding: 16, marginBottom: 13, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  identityTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 61, height: 61, borderRadius: 31, alignItems: "center", justifyContent: "center", backgroundColor: "#DDF7F2", borderWidth: 1, borderColor: "#A9E4DA" },
  avatarText: { color: "#00685F", fontSize: 21, fontWeight: "800" },
  identityCopy: { flex: 1 },
  identityTags: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 5 },
  clientTag: { color: "#087F75", fontSize: 9, fontWeight: "800", letterSpacing: 0.7, backgroundColor: "#E7F5F1", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, overflow: "hidden" },
  clientCategory: { color: "#748078", fontSize: 10, fontWeight: "600" },
  clientName: { color: "#1A1C1A", fontSize: 18, lineHeight: 24, fontWeight: "800" },
  identityDivider: { height: 1, backgroundColor: "#EFEEEB", marginVertical: 14 },
  quickActions: { flexDirection: "row", gap: 9 },
  callAction: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#C7DAD5", backgroundColor: "#FFFFFF", borderRadius: 9 },
  callActionText: { color: "#1A1C1A", fontSize: 12, fontWeight: "700" },
  whatsAppAction: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#087F75", borderRadius: 9 },
  whatsAppActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  metricsRow: { flexDirection: "row", gap: 10, marginBottom: 13 },
  metricCard: { flex: 1, minHeight: 105, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EAE7E1", borderRadius: 15, padding: 13, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.035, shadowRadius: 3, elevation: 1 },
  balanceCard: { backgroundColor: "#FFFCF7", borderColor: "#F1D7B1" },
  metricHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metricLabel: { color: "#748078", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  balanceLabel: { color: "#A85D0A", fontSize: 9, fontWeight: "800", letterSpacing: 0.35 },
  metricValueRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 7 },
  metricValue: { color: "#1A1C1A", fontSize: 26, fontWeight: "800" },
  metricSuffix: { color: "#748078", fontSize: 11, fontWeight: "600" },
  metricFootnote: { color: "#748078", fontSize: 9, marginTop: 3 },
  balanceValue: { color: "#A85D0A", fontSize: 19, fontWeight: "800", marginTop: 9 },
  balanceFootnote: { color: "#A85D0A", fontSize: 9, marginTop: 3 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#EAE7E1", padding: 16, marginBottom: 17, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.035, shadowRadius: 3, elevation: 1 },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionTitle: { color: "#1A1C1A", fontSize: 16, fontWeight: "700" },
  editingLabel: { color: "#087F75", fontSize: 9, fontWeight: "800", letterSpacing: 0.7 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 11, paddingVertical: 12 },
  infoCopy: { flex: 1 },
  infoLabel: { color: "#748078", fontSize: 11, fontWeight: "700", marginBottom: 4 },
  infoValue: { color: "#1A1C1A", fontSize: 13, lineHeight: 19 },
  infoInput: { minHeight: 42, backgroundColor: "#FAF9F6", borderWidth: 1, borderColor: "#D9DFDC", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: "#1A1C1A", fontSize: 13 },
  addressInput: { minHeight: 56, textAlignVertical: "top" },
  infoAction: { width: 33, height: 36, alignItems: "center", justifyContent: "center" },
  infoDivider: { height: 1, backgroundColor: "#EFEEEB" },
  jobsHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 1, marginBottom: 10 },
  jobsTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  jobsCount: { minWidth: 24, height: 23, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#EFEEEB", paddingHorizontal: 7 },
  jobsCountText: { color: "#596578", fontSize: 11, fontWeight: "800" },
  viewAllText: { color: "#087F75", fontSize: 11, fontWeight: "700" },
  filterBar: { flexDirection: "row", backgroundColor: "#EFEEEB", borderRadius: 11, padding: 4, marginBottom: 10 },
  filterChip: { flex: 1, minHeight: 34, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  filterChipActive: { backgroundColor: "#FFFFFF", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  filterChipText: { color: "#596578", fontSize: 10, fontWeight: "600" },
  filterChipTextActive: { color: "#1A1C1A", fontWeight: "700" },
  workList: { gap: 10 },
  workCard: { backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: "#EAE7E1", padding: 14, position: "relative", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.035, shadowRadius: 3, elevation: 1 },
  cancelledWorkCard: { backgroundColor: "#F8F8F6" },
  workCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 9 },
  workDate: { color: "#748078", fontSize: 10, fontWeight: "700" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 9, fontWeight: "700" },
  workDescription: { color: "#1A1C1A", fontSize: 15, lineHeight: 20, fontWeight: "700", paddingRight: 20 },
  cancelledText: { color: "#89948E" },
  workCardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#EFEEEB" },
  workTypeLine: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1 },
  workTypeText: { color: "#748078", fontSize: 10, flex: 1 },
  workAmount: { color: "#1A1C1A", fontSize: 14, fontWeight: "800", paddingRight: 15 },
  workChevron: { position: "absolute", right: 12, top: 47 },
  emptyWorkCard: { alignItems: "center", paddingHorizontal: 22, paddingVertical: 26, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EAE7E1", borderRadius: 15 },
  emptyIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#E7F5F1", marginBottom: 10 },
  emptyTitle: { color: "#1A1C1A", fontSize: 14, fontWeight: "700" },
  emptyDescription: { color: "#748078", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 5 },
  newWorkButton: { minHeight: 49, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderStyle: "dashed", borderColor: "#8ACFC3", borderRadius: 10, backgroundColor: "#F0FDFA", marginTop: 13 },
  newWorkButtonText: { color: "#00685F", fontSize: 12, fontWeight: "700" },
  saveBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderTopColor: "#EAE7E1", backgroundColor: "#FAF9F6" },
  saveButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#087F75", borderRadius: 9 },
  saveButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
})

export default ClientDetailScreen
