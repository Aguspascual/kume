import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "../lib/backendStorage"
import { isRunningInExpoGo } from "expo"
import { useRouter, useFocusEffect } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Alert, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { format, isSameDay } from "date-fns"
import { es } from "date-fns/locale"
import { useAuth } from "../lib/auth"

let notificationsModulePromise

const getNotificationsAsync = async () => {
  // Expo Go imprime advertencias al importar expo-notifications; los push requieren un development build.
  if (Platform.OS === "web" || isRunningInExpoGo()) return null

  if (!notificationsModulePromise) {
    notificationsModulePromise = import("expo-notifications").then((Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      })
      return Notifications
    })
  }

  return notificationsModulePromise
}

const prepareLocalNotificationsAsync = async (Notifications) => {
  try {
    let { status } = await Notifications.getPermissionsAsync()
    if (status !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync())
    }
    if (status !== "granted") return false

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      })
    }
    return true
  } catch {
    // Si no hay permisos o el runtime no soporta la configuración, la app sigue funcionando.
    return false
  }
}

// Función para programar la notificación diaria
const scheduleDailyReminder = async (Notifications) => {
  try {
    const lastScheduledDate = await AsyncStorage.getItem("lastDailyNotificationScheduled")
    const today = new Date().toDateString()

    if (lastScheduledDate === today) {
      console.log("Notificación diaria ya programada para hoy.")
      return
    }

    // Cancelar solo la notificación diaria anterior 
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync()
    const dailyNotifications = scheduledNotifications.filter(
      (notification) => notification.content.title === "Recordatorio de Trabajos 🗓️",
    )

    for (const notification of dailyNotifications) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier)
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Recordatorio de Trabajos 🗓️",
        body: "¡No olvides revisar los trabajos programados para mañana!",
      },
      trigger: {
        hour: 22,
        minute: 0,
        repeats: true,
      },
    })

    await AsyncStorage.setItem("lastDailyNotificationScheduled", today)
    console.log("Notificación diaria programada para las 22:00 horas.")
  } catch (error) {
    console.error("Error al programar notificación diaria:", error)
  }
}

const scheduleWorkNotifications = async (Notifications) => {
  try {
    // Cancelar notificaciones existentes de trabajos 
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync()
    const workNotifications = scheduledNotifications.filter((notification) =>
      notification.identifier.startsWith("work_"),
    )

    for (const notification of workNotifications) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier)
    }

    // Obtener trabajos desde AsyncStorage
    const worksData = await AsyncStorage.getItem("trabajos")
    if (!worksData) return

    const works = JSON.parse(worksData)
    const now = new Date()

    // Programar notificación para cada trabajo futuro
    for (const work of works) {
      if (work.estado === "Cancelado") continue

      const workDateTime = new Date(work.fecha)
      const notificationTime = new Date(workDateTime.getTime() - 60 * 60 * 1000)

      // Solo programar si la notificación es en el futuro
      if (notificationTime > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: `work_${work.id}`,
          content: {
            title: "⏰ Trabajo próximo",
            body: `En 1 hora: ${work.descripcion} - Cliente: ${work.cliente}`,
            data: { workId: work.id, type: "work_reminder" },
          },
          trigger: notificationTime,
        })

        console.log(`Notificación programada para trabajo ${work.id} a las ${notificationTime.toLocaleString()}`)
      }
    }
  } catch (error) {
    console.error("Error al programar notificaciones de trabajos:", error)
  }
}

const HomeScreen = () => {
  const router = useRouter()
  const { signOut, syncStatus, retrySync, resetAccountData } = useAuth()
  const [showOptionsMenu, setShowOptionsMenu] = useState(false)
  const [showSignOutModal, setShowSignOutModal] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [dashboard, setDashboard] = useState({ works: [], budgets: [], clientCount: 0 })

  const handleSignOut = () => {
    setShowOptionsMenu(false)
    setShowSignOutModal(true)
  }

  const confirmSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      Alert.alert("Sesión cerrada", "Se cerró la sesión en este dispositivo. No se pudo notificar al servidor.")
    } finally {
      setShowSignOutModal(false)
      setSigningOut(false)
      router.replace("/LoginScreen")
    }
  }

  const handleResetAccountData = () => {
    setShowOptionsMenu(false)
    Alert.alert(
      "Restablecer datos de la cuenta",
      "Se borrarán los clientes, presupuestos, trabajos y tipos de trabajo de esta cuenta en este dispositivo y en el servidor. Esta acción no se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Borrar todo", style: "destructive", onPress: async () => {
          try {
            const result = await resetAccountData()
            if (result.state === "synced") {
              Alert.alert("Cuenta restablecida", "Los datos de esta cuenta se borraron del dispositivo y del servidor.")
            } else {
              Alert.alert("Restablecimiento pendiente", "Los datos se borraron de este dispositivo. Se eliminarán del servidor cuando vuelva la conexión.")
            }
          } catch (error) {
            Alert.alert("No se pudo restablecer", error.message || "Intentá de nuevo.")
          }
        } },
      ],
    )
  }

  const loadDashboard = useCallback(async () => {
    try {
      const [worksJSON, budgetsJSON, clientsJSON] = await AsyncStorage.multiGet(["trabajos", "presupuestos", "clientes"])
      const parseArray = (value) => {
        if (!value) return []
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : []
      }

      setDashboard({
        works: parseArray(worksJSON?.[1]),
        budgets: parseArray(budgetsJSON?.[1]),
        clientCount: parseArray(clientsJSON?.[1]).length,
      })
    } catch (error) {
      console.error("Error al cargar el resumen de inicio:", error)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadDashboard()
    }, [loadDashboard]),
  )

  useEffect(() => {
    let isActive = true
    let responseSubscription
    let receivedSubscription

    const initializeNotifications = async () => {
      const Notifications = await getNotificationsAsync()
      if (!Notifications || !isActive) return

      const notificationsReady = await prepareLocalNotificationsAsync(Notifications)
      if (!notificationsReady) return
      await scheduleDailyReminder(Notifications)
      await scheduleWorkNotifications(Notifications)
      if (!isActive) return

      responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const { data } = response.notification.request.content

        if (data?.type === "work_reminder" && data?.workId) {
          router.push(`/WorkDetailScreen?workId=${data.workId}`)
        }
      })

      receivedSubscription = Notifications.addNotificationReceivedListener(() => {
        scheduleWorkNotifications(Notifications)
      })
    }

    initializeNotifications().catch(() => {})

    return () => {
      isActive = false
      responseSubscription?.remove()
      receivedSubscription?.remove()
    }
  }, [])

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const activeWorks = dashboard.works.filter((work) => {
    const workDate = new Date(work.fecha)
    return !Number.isNaN(workDate.getTime()) && workDate >= startOfToday && work.estadoPago !== "Cancelado"
  })
  const todayWorks = dashboard.works.filter((work) => {
    const workDate = new Date(work.fecha)
    return !Number.isNaN(workDate.getTime()) && isSameDay(workDate, today) && work.estadoPago !== "Cancelado"
  })
  const pendingBudgets = dashboard.budgets.filter((budget) => {
    if (budget.estado !== "Pendiente") return false
    if (!budget.fechaValidez) return true
    const validityDate = new Date(budget.fechaValidez)
    return Number.isNaN(validityDate.getTime()) || validityDate >= new Date(today.getFullYear(), today.getMonth(), today.getDate())
  })
  const latestBudget = [...pendingBudgets].sort((a, b) => new Date(b.fechaCreacion || 0) - new Date(a.fechaCreacion || 0))[0]
  const latestWork = [...dashboard.works]
    .filter((work) => work.estadoPago !== "Cancelado")
    .sort((a, b) => Math.abs(new Date(a.fecha || 0) - today) - Math.abs(new Date(b.fecha || 0) - today))[0]
  const todayLabel = format(today, "EEEE d 'de' MMMM", { locale: es })
  const formattedToday = todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)
  const currentMonth = format(today, "MMMM", { locale: es })
  const budgetStatus = latestBudget?.fechaValidez && isSameDay(new Date(latestBudget.fechaValidez), today) ? "Vence hoy" : "Pendiente"
  const formatCurrency = (amount) => new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0)

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.greeting}>
          <View>
            <Text style={styles.greetingTitle}>Hola, bienvenido</Text>
            <Text style={styles.greetingSubtitle}>Tu taller, al día</Text>
          </View>
          <TouchableOpacity
            style={styles.optionsButton}
            onPress={() => setShowOptionsMenu(!showOptionsMenu)}
            accessibilityRole="button"
            accessibilityLabel="Ajustes"
          >
            <Ionicons name="settings-outline" size={22} color={COLORS.ink} />
          </TouchableOpacity>
        </View>

        {showOptionsMenu && (
          <View style={styles.optionsMenu}>
            <TouchableOpacity style={styles.optionButton} onPress={() => { setShowOptionsMenu(false); router.push("ProfileScreen") }}>
              <Ionicons name="person-circle-outline" size={20} color={COLORS.primary} />
              <Text style={styles.optionButtonText}>Datos del responsable</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionButton} onPress={handleResetAccountData}>
              <Ionicons name="trash-outline" size={20} color="#B54747" />
              <Text style={[styles.optionButtonText, { color: "#B54747" }]}>Restablecer datos de la cuenta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionButton} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={20} color="#B54747" />
              <Text style={[styles.optionButtonText, { color: "#B54747" }]}>Cerrar sesión</Text>
            </TouchableOpacity>
          </View>
        )}

        {syncStatus.state !== "idle" && syncStatus.state !== "synced" && (
          <TouchableOpacity
            onPress={retrySync}
            style={{ marginHorizontal: 18, marginTop: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: syncStatus.state === "syncing" ? "#EEF4F2" : "#FFF3E1", flexDirection: "row", alignItems: "center", gap: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Reintentar sincronización con el servidor"
          >
            <Ionicons name={syncStatus.state === "syncing" ? "sync-outline" : "cloud-offline-outline"} size={17} color={syncStatus.state === "syncing" ? COLORS.primary : "#A05E12"} />
            <Text numberOfLines={2} style={{ flex: 1, color: "#4B5854", fontSize: 12, lineHeight: 17 }}>{syncStatus.message || "Cambios esperando sincronización. Tocá para reintentar."}</Text>
          </TouchableOpacity>
        )}

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <TouchableOpacity style={styles.primaryAction} onPress={() => router.push("NewWorkScreen")} activeOpacity={0.85}>
              <Ionicons name="add" size={24} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>Nuevo trabajo</Text>
            </TouchableOpacity>

            <View style={styles.quickActions}>
              <TouchableOpacity style={styles.quickAction} onPress={() => router.push("NewBudgetScreen")} activeOpacity={0.8}>
                <Ionicons name="document-text-outline" size={20} color={COLORS.primary} />
                <Text style={styles.quickActionText}>Cotizar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickAction} onPress={() => router.push("NewClientScreen")} activeOpacity={0.8}>
                <Ionicons name="person-add-outline" size={20} color={COLORS.primary} />
                <Text style={styles.quickActionText}>Agregar cliente</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Resumen de hoy</Text>
              <Text style={styles.dateLabel}>{formattedToday}</Text>
            </View>
            <View style={styles.summaryCard}>
              <View style={styles.metricsRow}>
                <Metric value={activeWorks.length} label="trabajos activos" note="En curso" color={COLORS.primary} />
                <View style={styles.metricDivider} />
                <Metric value={todayWorks.length} label="citas hoy" note="Programadas" color={COLORS.blue} />
                <View style={styles.metricDivider} />
                <Metric value={pendingBudgets.length} label="presupuestos" note="Pendientes" color={COLORS.amber} />
              </View>
              <View style={styles.summaryFooter}>
                <View style={styles.onlineDot} />
                <Text style={styles.summaryFooterText}>Jornada de trabajo</Text>
                <TouchableOpacity onPress={() => router.push("WeeklyCalendarScreen")}>
                  <Text style={styles.inlineLink}>Ver agenda <Ionicons name="arrow-forward" size={13} color={COLORS.primary} /></Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.sectionHeading, styles.modulesHeading]}>
              <Text style={styles.sectionTitle}>Módulos de gestión</Text>
              <Text style={styles.mutedLabel}>6 accesos</Text>
            </View>
            <View style={styles.moduleGrid}>
              <ModuleCard icon="construct-outline" title="Trabajos & Obras" subtitle="Fabricación y montaje" badge={`${activeWorks.length} activos`} tint={COLORS.mint} onPress={() => router.push("WeeklyCalendarScreen")} />
              <ModuleCard icon="document-text-outline" title="Presupuestos" subtitle="Cotizaciones y PDF" badge={`${pendingBudgets.length} pendientes`} tint={COLORS.peach} onPress={() => router.push("BudgetsScreen")} />
              <ModuleCard icon="calendar-outline" title="Calendario" subtitle="Instalaciones y visitas" badge={`${todayWorks.length} hoy`} tint={COLORS.lavender} onPress={() => router.push("WeeklyCalendarScreen")} />
              <ModuleCard icon="people-outline" title="Clientes" subtitle="Cuentas y contactos" badge={`${dashboard.clientCount} registrados`} tint={COLORS.slate} onPress={() => router.push("UsersScreen")} />
              <ModuleCard icon="wallet-outline" title="Pagos & Caja" subtitle="Cobros, señas y saldos" badge="Ver pagos" tint={COLORS.mint} onPress={() => router.push("PendingPaymentsScreen")} />
              <ModuleCard icon="bar-chart-outline" title="Informes" subtitle="Márgenes y balance" badge={currentMonth} tint={COLORS.lavender} onPress={() => router.push("ReportsScreen")} />
            </View>

            <View style={[styles.sectionHeading, styles.activityHeading]}>
              <Text style={styles.sectionTitle}>Actividad reciente</Text>
              <TouchableOpacity onPress={() => router.push("BudgetsScreen")}>
                <Text style={styles.inlineLink}>Ver todo</Text>
              </TouchableOpacity>
            </View>
            {latestBudget || latestWork ? (
              <View style={styles.activityCard}>
                {latestBudget && (
                  <TouchableOpacity style={styles.activityRow} onPress={() => router.push({ pathname: "BudgetDetailScreen", params: { presupuesto: JSON.stringify(latestBudget) } })} activeOpacity={0.75}>
                    <View style={[styles.activityIcon, styles.activityIconAmber]}>
                      <Ionicons name="document-text-outline" size={20} color={COLORS.amber} />
                    </View>
                    <View style={styles.activityCopy}>
                      <Text style={styles.activityTitle} numberOfLines={1}>Presupuesto · {latestBudget.tipoTrabajo || latestBudget.clienteNombre || "Cotización"}</Text>
                      <Text style={styles.activitySubtitle} numberOfLines={1}>{latestBudget.clienteNombre || "Cliente"} · {formatCurrency(latestBudget.total)}</Text>
                    </View>
                    <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>{budgetStatus}</Text></View>
                  </TouchableOpacity>
                )}
                {latestBudget && latestWork && <View style={styles.activityDivider} />}
                {latestWork && (
                  <TouchableOpacity style={styles.activityRow} onPress={() => router.push({ pathname: "WorkDetailScreen", params: { trabajo: JSON.stringify(latestWork) } })} activeOpacity={0.75}>
                    <View style={[styles.activityIcon, styles.activityIconMint]}>
                      <Ionicons name="hammer-outline" size={20} color={COLORS.primary} />
                    </View>
                    <View style={styles.activityCopy}>
                      <Text style={styles.activityTitle} numberOfLines={1}>{latestWork.tipoTrabajo || "Trabajo"} · {latestWork.clienteNombre || "Cliente"}</Text>
                      <Text style={styles.activitySubtitle} numberOfLines={1}>{latestWork.trabajo || "Trabajo programado"}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.emptyActivity}>
                <Text style={styles.emptyActivityText}>Cuando registres trabajos o presupuestos, vas a verlos acá.</Text>
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.bottomNav}>
          <NavItem icon="home" label="Inicio" active onPress={() => {}} />
          <NavItem icon="bar-chart-outline" label="Informes" onPress={() => router.push("ReportsScreen")} />
          <TouchableOpacity style={styles.navCreateButton} onPress={() => router.push("NewWorkScreen")} accessibilityRole="button" accessibilityLabel="Crear nuevo trabajo">
            <Ionicons name="add" size={30} color="#FFFFFF" />
          </TouchableOpacity>
          <NavItem icon="calendar-outline" label="Agenda" onPress={() => router.push("WeeklyCalendarScreen")} />
          <NavItem icon="wallet-outline" label="Pagos" onPress={() => router.push("PendingPaymentsScreen")} />
        </View>
      </SafeAreaView>
      <Modal
        visible={showSignOutModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !signingOut && setShowSignOutModal(false)}
      >
        <View style={styles.signOutOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => !signingOut && setShowSignOutModal(false)}
            accessibilityLabel="Cerrar confirmación"
          />
          <View style={styles.signOutCard} accessibilityViewIsModal>
            <View style={styles.signOutIcon}>
              <Ionicons name="log-out-outline" size={24} color={COLORS.primary} />
            </View>
            <Text style={styles.signOutTitle}>¿Cerrar sesión?</Text>
            <Text style={styles.signOutMessage}>Vas a salir de tu cuenta en este dispositivo. Podés volver a entrar cuando quieras.</Text>
            <View style={styles.signOutActions}>
              <TouchableOpacity
                style={[styles.signOutButton, styles.signOutCancelButton]}
                onPress={() => setShowSignOutModal(false)}
                disabled={signingOut}
                accessibilityRole="button"
              >
                <Text style={styles.signOutCancelText}>Seguir en la app</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.signOutButton, styles.signOutConfirmButton, signingOut && styles.signOutButtonDisabled]}
                onPress={confirmSignOut}
                disabled={signingOut}
                accessibilityRole="button"
              >
                {signingOut ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.signOutConfirmText}>Cerrar sesión</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const COLORS = {
  background: "#FAF9F6",
  surface: "#FFFFFF",
  ink: "#17201F",
  secondary: "#6F7D7A",
  muted: "#9AA5A2",
  border: "#E5E9E6",
  primary: "#087F75",
  primaryDark: "#006A61",
  mint: "#E2F6F2",
  peach: "#FFF0E0",
  lavender: "#EEF0FB",
  slate: "#EEF1EF",
  blue: "#536A9B",
  amber: "#A86407",
}

const Metric = ({ value, label, note, color }) => (
  <View style={styles.metric}>
    <Text style={[styles.metricValue, { color }]}>{value}</Text>
    <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
    <Text style={[styles.metricNote, { color }]} numberOfLines={1}>{note}</Text>
  </View>
)

const ModuleCard = ({ icon, title, subtitle, badge, tint, onPress }) => (
  <TouchableOpacity style={styles.moduleCard} onPress={onPress} activeOpacity={0.78}>
    <View style={styles.moduleTopRow}>
      <View style={[styles.moduleIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={21} color={COLORS.primaryDark} />
      </View>
      <Text style={styles.moduleBadge} numberOfLines={1}>{badge}</Text>
    </View>
    <Text style={styles.moduleTitle} numberOfLines={1}>{title}</Text>
    <Text style={styles.moduleSubtitle} numberOfLines={1}>{subtitle}</Text>
  </TouchableOpacity>
)

const NavItem = ({ icon, label, active, onPress }) => (
  <TouchableOpacity style={styles.navItem} onPress={onPress} activeOpacity={0.75}>
    <Ionicons name={icon} size={21} color={active ? COLORS.primary : COLORS.secondary} />
    <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
    {active && <View style={styles.navActiveDot} />}
  </TouchableOpacity>
)

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  optionsButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  greeting: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  greetingTitle: { color: COLORS.ink, fontSize: 20, fontWeight: "700", letterSpacing: -0.4 },
  greetingSubtitle: { color: COLORS.secondary, fontSize: 13, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  optionsMenu: {
    position: "absolute",
    top: 72,
    right: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#17201F",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
    zIndex: 10,
  },
  optionButton: { flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 13 },
  optionButtonText: { fontSize: 14, color: COLORS.ink, marginLeft: 10, fontWeight: "500" },
  signOutOverlay: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, backgroundColor: "rgba(19, 31, 29, 0.48)" },
  signOutCard: { width: "100%", maxWidth: 380, alignItems: "center", paddingHorizontal: 22, paddingTop: 24, paddingBottom: 20, backgroundColor: COLORS.background, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, shadowColor: "#17201F", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12 },
  signOutIcon: { width: 52, height: 52, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.mint, borderRadius: 18, marginBottom: 15 },
  signOutTitle: { color: COLORS.ink, fontSize: 20, fontWeight: "800", letterSpacing: -0.3, textAlign: "center" },
  signOutMessage: { maxWidth: 290, color: COLORS.secondary, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  signOutActions: { width: "100%", flexDirection: "row", gap: 9, marginTop: 22 },
  signOutButton: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, paddingHorizontal: 9 },
  signOutCancelButton: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  signOutCancelText: { color: COLORS.ink, fontSize: 12, fontWeight: "700", textAlign: "center" },
  signOutConfirmButton: { backgroundColor: COLORS.primary },
  signOutConfirmText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700", textAlign: "center" },
  signOutButtonDisabled: { opacity: 0.7 },
  scrollContent: { paddingBottom: 18 },
  content: { paddingHorizontal: 18, paddingTop: 2 },
  primaryAction: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryActionText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  quickActions: { flexDirection: "row", gap: 10, marginTop: 10, marginBottom: 22 },
  quickAction: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
  },
  quickActionText: { color: COLORS.ink, fontSize: 13, fontWeight: "600" },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: COLORS.ink, fontSize: 18, fontWeight: "700", letterSpacing: -0.35 },
  dateLabel: { color: COLORS.secondary, fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
    shadowColor: "#17201F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  metricsRow: { flexDirection: "row", alignItems: "stretch" },
  metric: { flex: 1, alignItems: "center", justifyContent: "flex-start", paddingHorizontal: 3 },
  metricValue: { fontSize: 27, lineHeight: 32, fontWeight: "800", letterSpacing: -0.7 },
  metricLabel: { minHeight: 32, textAlign: "center", color: COLORS.ink, fontSize: 11, lineHeight: 15, fontWeight: "600", marginTop: 2 },
  metricNote: { backgroundColor: COLORS.background, borderRadius: 8, overflow: "hidden", paddingHorizontal: 6, paddingVertical: 4, fontSize: 10, fontWeight: "700", marginTop: 6 },
  metricDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 4, marginVertical: 2 },
  summaryFooter: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 14, paddingTop: 11, gap: 7 },
  summaryFooterText: { color: COLORS.secondary, fontSize: 11, flex: 1 },
  inlineLink: { color: COLORS.primary, fontSize: 11, fontWeight: "700" },
  modulesHeading: { marginTop: 22 },
  mutedLabel: { color: COLORS.secondary, fontSize: 11, fontWeight: "600" },
  moduleGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  moduleCard: {
    width: "48.5%",
    minHeight: 132,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#17201F",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.035,
    shadowRadius: 4,
    elevation: 1,
  },
  moduleTopRow: { minHeight: 38, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  moduleIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  moduleBadge: { maxWidth: "70%", color: COLORS.primaryDark, backgroundColor: COLORS.mint, fontSize: 9, lineHeight: 15, fontWeight: "700", paddingHorizontal: 7, borderRadius: 10, overflow: "hidden" },
  moduleTitle: { color: COLORS.ink, fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 9 },
  moduleSubtitle: { color: COLORS.secondary, fontSize: 10, lineHeight: 14, marginTop: 1 },
  activityHeading: { marginTop: 22 },
  activityCard: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" },
  activityRow: { minHeight: 72, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  activityIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  activityIconAmber: { backgroundColor: COLORS.peach },
  activityIconMint: { backgroundColor: COLORS.mint },
  activityCopy: { flex: 1 },
  activityTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "700" },
  activitySubtitle: { color: COLORS.secondary, fontSize: 11, marginTop: 4 },
  pendingBadge: { backgroundColor: COLORS.peach, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 5 },
  pendingBadgeText: { color: COLORS.amber, fontSize: 9, fontWeight: "700" },
  activityDivider: { height: 1, backgroundColor: COLORS.border, marginLeft: 60 },
  emptyActivity: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16 },
  emptyActivityText: { color: COLORS.secondary, fontSize: 12, lineHeight: 18 },
  bottomNav: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: 6, paddingTop: 5 },
  navItem: { width: 62, alignItems: "center", justifyContent: "center", gap: 2 },
  navLabel: { color: COLORS.secondary, fontSize: 9, fontWeight: "500" },
  navLabelActive: { color: COLORS.primary, fontWeight: "700" },
  navActiveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.primary, position: "absolute", bottom: -5 },
  navCreateButton: { width: 48, height: 48, marginTop: -19, borderRadius: 17, backgroundColor: COLORS.primary, borderWidth: 3, borderColor: COLORS.background, alignItems: "center", justifyContent: "center", shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
})

export default HomeScreen
