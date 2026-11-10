import { Stack, useRootNavigationState, useRouter, useSegments } from "expo-router"
import { useEffect } from "react"
import { ActivityIndicator, StyleSheet, View } from "react-native"
import { AuthProvider, useAuth } from "../lib/auth"

function AuthGate() {
  const { session, loading, dataReady } = useAuth()
  const router = useRouter()
  const segments = useSegments()
  const rootNavigationState = useRootNavigationState()
  const isLoginRoute = segments[0] === "LoginScreen"
  const waitingForData = Boolean(session) && !dataReady
  const shouldShowLoading = loading || waitingForData || (!session && !isLoginRoute) || (Boolean(session) && isLoginRoute)

  useEffect(() => {
    if (!rootNavigationState?.key || loading || waitingForData) return
    if (!session && !isLoginRoute) router.replace("/LoginScreen")
    else if (session && isLoginRoute) router.replace("/")
  }, [rootNavigationState?.key, loading, waitingForData, session, isLoginRoute, router])

  if (!shouldShowLoading) return null

  return (
    <View style={styles.loadingOverlay}>
      <ActivityIndicator color="#00685F" size="large" />
    </View>
  )
}

function AppNavigation() {
  return (
    <View style={styles.container}>
      <Stack initialRouteName="index">
        <Stack.Screen name="LoginScreen" options={{ headerShown: false }} />
        <Stack.Screen name="ProfileScreen" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="NewWorkScreen" options={{ headerShown: false }} />
        <Stack.Screen name="NewClientScreen" options={{ headerShown: false }} />
        <Stack.Screen name="UsersScreen" options={{ headerShown: false }} />
        <Stack.Screen name="ClientDetailScreen" options={{ headerShown: false }} />
        <Stack.Screen name="WeeklyCalendarScreen" options={{ headerShown: false }} />
        <Stack.Screen name="WorkDetailScreen" options={{ headerShown: false }} />
        <Stack.Screen name="MonthlySummaryScreen" options={{ headerShown: false }} />
        <Stack.Screen name="ReportsScreen" options={{ headerShown: false }} />
        <Stack.Screen name="NewBudgetScreen" options={{ headerShown: false }} />
        <Stack.Screen name="BudgetsScreen" options={{ headerShown: false }} />
        <Stack.Screen name="BudgetDetailScreen" options={{ headerShown: false }} />
        <Stack.Screen name="PendingPaymentsScreen" options={{ headerShown: false }} />
      </Stack>
      <AuthGate />
    </View>
  )
}

export default function Layout() {
  return <AuthProvider><AppNavigation /></AuthProvider>
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F7F3",
  },
})
