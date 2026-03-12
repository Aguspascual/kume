import { useState, useEffect, useCallback } from "react"
import { StyleSheet, SafeAreaView, View, Text, TextInput, TouchableOpacity, FlatList, Alert } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter, useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"

const BudgetsScreen = () => {
 const [budgets, setBudgets] = useState([])
 const [filteredBudgets, setFilteredBudgets] = useState([])
 const [searchText, setSearchText] = useState("")
 const router = useRouter()
 const fetchBudgets = async () => {
  try {
        const budgetsJSON = await AsyncStorage.getItem("presupuestos")
        const budgetsArray = budgetsJSON ? JSON.parse(budgetsJSON) : []
        const today = new Date()
        today.setHours(0, 0, 0, 0) // Normalizar a medianoche

         // Filtra los presupuestos, excluyendo los "Aceptado", "Rechazado" y los que han expirado
        const updatedBudgets = budgetsArray.filter((budget) => {
                const isRejected = budget.estado === "Rechazado"
                
                const validityDate = new Date(budget.fechaValidez)
                validityDate.setHours(0, 0, 0, 0) // Normalizar a medianoche
                
                const hasExpired = validityDate < today
                
                // Excluir los presupuestos aceptados, rechazados y caducados.
                 return budget.estado !== "Aceptado" && !isRejected && !hasExpired
 })
 await AsyncStorage.setItem("presupuestos", JSON.stringify(updatedBudgets))

 // Ordenar por fecha de creación
 const sortedBudgets = updatedBudgets.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion))
 setBudgets(sortedBudgets)
 setFilteredBudgets(sortedBudgets)
 } catch (error) {
  console.error("Error al cargar los presupuestos:", error)
  Alert.alert("Error", "No se pudieron cargar los presupuestos.")
 }
}

useFocusEffect(
 useCallback(() => {
  fetchBudgets()
 }, []),
)

useEffect(() => {
if (searchText === "") {
 setFilteredBudgets(budgets)
} else {
const filtered = budgets.filter(
(budget) =>
budget.clienteNombre.toLowerCase().includes(searchText.toLowerCase()) ||
budget.tipoTrabajo.toLowerCase().includes(searchText.toLowerCase()) ||
budget.descripcionTrabajo.toLowerCase().includes(searchText.toLowerCase()),
)
setFilteredBudgets(filtered)
}
}, [searchText, budgets])

// Función para obtener el color según el estado
const getStatusColor = (estado) => {
switch (estado) {
case "Pendiente":
 return "#FFA726"
case "Rechazado":
 return "#EF5350"
default:
 return "#FFA726"
}
}

// Función para obtener el icono según el estado
const getStatusIcon = (estado) => {
   switch (estado) {
      case "Pendiente":
       return "time-outline"
      case "Rechazado":
       return "close-circle-outline"
      default:
       return "time-outline"
   }
}

const renderBudgetItem = ({ item }) => (
<TouchableOpacity
   style={styles.budgetItem}
   onPress={() => {
    router.push({
     pathname: "BudgetDetailScreen",
     params: { presupuesto: JSON.stringify(item) },
    })
   }}
>
<View style={styles.budgetHeader}>
<View style={styles.budgetMainInfo}>
 <Ionicons name="document-text-outline" size={24} color="#003366" />
 <View style={styles.budgetInfo}>
  <Text style={styles.budgetClient}>{item.clienteNombre}</Text>
  <Text style={styles.budgetType}>{item.tipoTrabajo}</Text>
 </View>
</View>
<View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.estado) }]}>
 <Ionicons name={getStatusIcon(item.estado)} size={16} color="#fff" />
 <Text style={styles.statusText}>{item.estado}</Text>
</View>
</View>

<Text style={styles.budgetDescription} numberOfLines={2}>
 {item.descripcionTrabajo}
</Text>

<View style={styles.budgetFooter}>
   <View style={styles.budgetAmount}>
    <Text style={styles.totalLabel}>Total:</Text>
    <Text style={styles.totalAmount}>${item.total.toFixed(2)}</Text>
   </View>
   <Text style={styles.budgetDate}>{new Date(item.fechaCreacion).toLocaleDateString()}</Text>
</View>

<View style={styles.validityInfo}>
 <Ionicons name="calendar-outline" size={14} color="#666" />
 <Text style={styles.validityText}>Válido hasta: {new Date(item.fechaValidez).toLocaleDateString()}</Text>
</View>
  </TouchableOpacity>
 )

 return (
  <SafeAreaView style={styles.container}>
   <View style={styles.header}>
    <TouchableOpacity onPress={() => router.replace("/")} style={styles.backButton}>
     <Ionicons name="home-outline" size={28} color="#fff" />
    </TouchableOpacity>
    <Text style={styles.title}>Presupuestos</Text>
   </View>

<View style={styles.formContainer}>
 <View style={styles.searchContainer}>
  <Ionicons name="search-outline" size={20} color="#003366" style={styles.searchIcon} />
  <TextInput
   style={styles.searchInput}
   value={searchText}
   onChangeText={setSearchText}
   placeholder="Buscar presupuesto"
   placeholderTextColor="#999"
  />
</View>

<TouchableOpacity style={styles.newBudgetButton} onPress={() => router.push("NewBudgetScreen")}>
 <Ionicons name="add-circle-outline" size={24} color="#fff" />
 <Text style={styles.newBudgetButtonText}>Nuevo Presupuesto</Text>
</TouchableOpacity>

{/* Resumen de estados */}
<View style={styles.summaryContainer}>
 <View style={styles.summaryItem}>
  <View style={[styles.summaryDot, { backgroundColor: "#FFA726" }]} />
  <Text style={styles.summaryText}>Pendientes: {budgets.filter((b) => b.estado === "Pendiente").length}</Text>
 </View>
 <View style={styles.summaryItem}>
  <View style={[styles.summaryDot, { backgroundColor: "#EF5350" }]} />
  <Text style={styles.summaryText}>Rechazados: {budgets.filter((b) => b.estado === "Rechazado").length}</Text>
 </View>
</View>

 <FlatList
  data={filteredBudgets}
  keyExtractor={(item) => item.id}
  renderItem={renderBudgetItem}
  ListEmptyComponent={() => <Text style={styles.emptyListText}>No hay presupuestos registrados.</Text>}
  style={styles.list}
  showsVerticalScrollIndicator={false}
 />
  </View>
 </SafeAreaView>
 )
}

const styles = StyleSheet.create({
 container: {
  flex: 1,
  backgroundColor: "#2F4550",
  paddingTop: 10,
 },
 header: {
  padding: 40,
  backgroundColor: "#2F4550",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
 },
 backButton: {
  position: "absolute",
  left: 20,
 },
 title: {
  fontSize: 28,
  fontWeight: "bold",
  color: "#fff",
 },
 formContainer: {
  flex: 1,
  backgroundColor: "#fff",
  borderTopLeftRadius: 30,
  borderTopRightRadius: 30,
  padding: 20,
  paddingTop: 30,
  marginTop: -20,
 },
 searchContainer: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#f0f0f0",
  borderRadius: 8,
  paddingHorizontal: 15,
  marginBottom: 20,
 },
 searchIcon: {
  marginRight: 10,
 },
 searchInput: {
  flex: 1,
  paddingVertical: 15,
  fontSize: 16,
  color: "#333",
 },
 newBudgetButton: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#2196F3",
  padding: 18,
  borderRadius: 12,
  marginBottom: 20,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 5,
  elevation: 5,
 },
 newBudgetButtonText: {
  color: "#fff",
  fontSize: 16,
  fontWeight: "600",
  marginLeft: 8,
 },
 summaryContainer: {
  flexDirection: "row",
  justifyContent: "space-around",
  backgroundColor: "#f8f9fa",
  borderRadius: 12,
  padding: 15,
  marginBottom: 20,
 },
 summaryItem: {
  flexDirection: "row",
  alignItems: "center",
 },
 summaryDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
  marginRight: 6,
 },
 summaryText: {
  fontSize: 12,
  color: "#666",
  fontWeight: "500",
 },
 list: {
  flex: 1,
 },
 budgetItem: {
  backgroundColor: "#f9f9f9",
  padding: 16,
  borderRadius: 12,
  marginBottom: 12,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 3,
  elevation: 2,
  borderLeftWidth: 4,
  borderLeftColor: "#2196F3",
 },
 budgetHeader: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 8,
 },
 budgetMainInfo: {
  flexDirection: "row",
  alignItems: "center",
  flex: 1,
 },
 budgetInfo: {
  marginLeft: 12,
  flex: 1,
 },
 budgetClient: {
  fontSize: 16,
  fontWeight: "bold",
  color: "#333",
 },
 budgetType: {
  fontSize: 14,
  color: "#666",
  marginTop: 2,
 },
 statusBadge: {
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 12,
 },
 statusText: {
  color: "#fff",
  fontSize: 12,
  fontWeight: "600",
  marginLeft: 4,
 },
 budgetDescription: {
  fontSize: 14,
  color: "#555",
  marginBottom: 12,
  lineHeight: 20,
 },
 budgetFooter: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
 },
 budgetAmount: {
  flexDirection: "row",
  alignItems: "center",
 },
 totalLabel: {
  fontSize: 14,
  color: "#666",
  marginRight: 6,
 },
 totalAmount: {
  fontSize: 18,
  fontWeight: "bold",
  color: "#2196F3",
 },
 budgetDate: {
  fontSize: 12,
  color: "#999",
 },
 validityInfo: {
  flexDirection: "row",
  alignItems: "center",
 },
 validityText: {
  fontSize: 12,
  color: "#666",
  marginLeft: 4,
 },
 emptyListText: {
  textAlign: "center",
  marginTop: 50,
  fontSize: 16,
  color: "#999",
 },
})

export default BudgetsScreen
