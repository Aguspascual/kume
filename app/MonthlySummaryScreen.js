import { useState, useEffect, useCallback } from "react"
import { ScrollView, StyleSheet, SafeAreaView, View, Text, TouchableOpacity, ActivityIndicator, Alert,} from "react-native"
import AsyncStorage from "../lib/backendStorage"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { format, getMonth, getYear, setMonth, setYear } from "date-fns"
import { es } from "date-fns/locale"

const MonthlySummaryScreen = () => {
  const [trabajos, setTrabajos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [showYearPicker, setShowYearPicker] = useState(false)
  const router = useRouter()

  const fetchTrabajos = useCallback(async () => {
    setLoading(true)
    try {
      const trabajosJSON = await AsyncStorage.getItem("trabajos")
      if (trabajosJSON) {
        const allTrabajos = JSON.parse(trabajosJSON)
        // Filtra los trabajos por el mes y año seleccionados
        const filteredTrabajos = allTrabajos.filter((trabajo) => {
          const trabajoDate = new Date(trabajo.fecha)
          return getMonth(trabajoDate) === getMonth(selectedDate) && getYear(trabajoDate) === getYear(selectedDate)
        })
        setTrabajos(filteredTrabajos)
      }
    } catch (error) {
      console.error("Error al cargar los trabajos:", error)
      Alert.alert("Error", "No se pudieron cargar los trabajos.")
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    // fetchTrabajos updates fetched data and loading state after AsyncStorage resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTrabajos()
  }, [fetchTrabajos])

  // Calcula el resumen de costos
  const totalMateriales = trabajos.reduce((sum, trabajo) => sum + (Number.parseFloat(trabajo.costoMateriales) || 0), 0)
  const totalManoDeObra = trabajos.reduce((sum, trabajo) => sum + (Number.parseFloat(trabajo.costoManoDeObra) || 0), 0)
  const costoTotalMes = totalMateriales + totalManoDeObra

  // Nuevos cálculos estadísticos
  const promedioMateriales = trabajos.length > 0 ? totalMateriales / trabajos.length : 0
  const promedioManoDeObra = trabajos.length > 0 ? totalManoDeObra / trabajos.length : 0
  const promedioPorTrabajo = trabajos.length > 0 ? costoTotalMes / trabajos.length : 0

  // Trabajo más costoso
  const trabajoMasCostoso = trabajos.reduce((max, trabajo) => {
    const costoTrabajo =
      (Number.parseFloat(trabajo.costoMateriales) || 0) + (Number.parseFloat(trabajo.costoManoDeObra) || 0)
    const costoMax = (Number.parseFloat(max.costoMateriales) || 0) + (Number.parseFloat(max.costoManoDeObra) || 0)
    return costoTrabajo > costoMax ? trabajo : max
  }, trabajos[0] || {})

  // Trabajo menos costoso
  const trabajoMenosCostoso = trabajos.reduce((min, trabajo) => {
    const costoTrabajo =
      (Number.parseFloat(trabajo.costoMateriales) || 0) + (Number.parseFloat(trabajo.costoManoDeObra) || 0)
    const costoMin = (Number.parseFloat(min.costoMateriales) || 0) + (Number.parseFloat(min.costoManoDeObra) || 0)
    return costoTrabajo < costoMin ? trabajo : min
  }, trabajos[0] || {})

  // Calcula la cantidad de trabajos por tipo
  const trabajosPorTipo = trabajos.reduce((acc, trabajo) => {
    const tipo = trabajo.tipoTrabajo || "Otros"
    acc[tipo] = (acc[tipo] || 0) + 1
    return acc
  }, {})

  // Clientes más frecuentes
  const clientesFrecuentes = trabajos.reduce((acc, trabajo) => {
    const cliente = trabajo.cliente || "Sin cliente"
    acc[cliente] = (acc[cliente] || 0) + 1
    return acc
  }, {})

  const clientesMasFrecuentes = Object.entries(clientesFrecuentes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)

  const getMonths = () => {
    const months = []
    for (let i = 0; i < 12; i++) {
      months.push({
        value: i,
        label: format(setMonth(new Date(), i), "MMMM", { locale: es }),
      })
    }
    return months
  }

  const getYears = () => {
    const years = []
    const currentYear = getYear(new Date())
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
      years.push({ value: i, label: i.toString() })
    }
    return years
  }

  const handleMonthChange = (value) => {
    setSelectedDate((prevDate) => setMonth(prevDate, value))
    setShowMonthPicker(false)
  }

  const handleYearChange = (value) => {
    setSelectedDate((prevDate) => setYear(prevDate, value))
    setShowYearPicker(false)
  }

  const months = getMonths()
  const years = getYears()

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace("/")} style={styles.backButton}>
          <Ionicons name="home-outline" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Resumen Mensual</Text>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterTitle}>Seleccionar Período</Text>
        <View style={styles.filterButtonsContainer}>
          <TouchableOpacity style={styles.filterButton} onPress={() => setShowMonthPicker(!showMonthPicker)}>
            <View style={styles.filterButtonContent}>
              <Ionicons name="calendar-outline" size={20} color="#003366" />
              <Text style={styles.filterButtonText}>{format(selectedDate, "MMMM", { locale: es })}</Text>
              <Ionicons name={showMonthPicker ? "chevron-up" : "chevron-down"} size={16} color="#666" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.filterButton} onPress={() => setShowYearPicker(!showYearPicker)}>
            <View style={styles.filterButtonContent}>
              <Ionicons name="time-outline" size={20} color="#003366" />
              <Text style={styles.filterButtonText}>{getYear(selectedDate)}</Text>
              <Ionicons name={showYearPicker ? "chevron-up" : "chevron-down"} size={16} color="#666" />
            </View>
          </TouchableOpacity>
        </View>

        {showMonthPicker && (
          <View style={styles.pickerDropdown}>
            <ScrollView style={styles.pickerScrollView} showsVerticalScrollIndicator={false}>
              {months.map((month) => (
                <TouchableOpacity
                  key={month.value}
                  style={[styles.pickerOption, getMonth(selectedDate) === month.value && styles.pickerOptionSelected]}
                  onPress={() => handleMonthChange(month.value)}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      getMonth(selectedDate) === month.value && styles.pickerOptionTextSelected,
                    ]}
                  >
                    {month.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {showYearPicker && (
          <View style={styles.pickerDropdown}>
            <ScrollView style={styles.pickerScrollView} showsVerticalScrollIndicator={false}>
              {years.map((year) => (
                <TouchableOpacity
                  key={year.value}
                  style={[styles.pickerOption, getYear(selectedDate) === year.value && styles.pickerOptionSelected]}
                  onPress={() => handleYearChange(year.value)}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      getYear(selectedDate) === year.value && styles.pickerOptionTextSelected,
                    ]}
                  >
                    {year.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <ScrollView style={styles.summaryContainer} showsVerticalScrollIndicator={false}>
        {loading ? (<ActivityIndicator size="large" color="#003366" style={styles.loadingIndicator} />) : (
          <View>
            <View style={styles.sectionHeader}>
              <Ionicons name="bar-chart-outline" size={24} color="#003366" />
              <Text style={styles.sectionTitle}>Resumen General</Text>
            </View>

            <View style={styles.statsGrid}>
              <View style={[styles.statCard, styles.primaryCard]}>
                <Ionicons name="briefcase-outline" size={32} color="#fff" />
                <Text style={styles.statNumber}>{trabajos.length}</Text>
                <Text style={styles.statLabel}>Trabajos Realizados</Text>
              </View>

              <View style={[styles.statCard, styles.successCard]}>
                <Ionicons name="cash-outline" size={32} color="#fff" />
                <Text style={styles.statNumber}>${costoTotalMes.toFixed(0)}</Text>
                <Text style={styles.statLabel}>Ingresos Totales</Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={[styles.statCard, styles.infoCard]}>
                <Ionicons name="trending-up-outline" size={32} color="#fff" />
                <Text style={styles.statNumber}>${promedioPorTrabajo.toFixed(0)}</Text>
                <Text style={styles.statLabel}>Promedio por Trabajo</Text>
              </View>

              <View style={[styles.statCard, styles.warningCard]}>
                <Ionicons name="construct-outline" size={32} color="#fff" />
                <Text style={styles.statNumber}>{Object.keys(trabajosPorTipo).length}</Text>
                <Text style={styles.statLabel}>Tipos de Trabajo</Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Ionicons name="calculator-outline" size={24} color="#003366" />
              <Text style={styles.sectionTitle}>Análisis de Costos</Text>
            </View>

            <View style={styles.detailCard}>
              <View style={styles.costRow}>
                <View style={styles.costInfo}>
                  <Ionicons name="hammer-outline" size={20} color="#FF6B35" />
                  <Text style={styles.costLabel}>Materiales</Text>
                </View>
                <Text style={styles.costValue}>${totalMateriales.toFixed(2)}</Text>
              </View>
              <View style={styles.costSubRow}>
                <Text style={styles.costSubLabel}>Promedio por trabajo: ${promedioMateriales.toFixed(2)}</Text>
              </View>
            </View>

            <View style={styles.detailCard}>
              <View style={styles.costRow}>
                <View style={styles.costInfo}>
                  <Ionicons name="people-outline" size={20} color="#4ECDC4" />
                  <Text style={styles.costLabel}>Mano de Obra</Text>
                </View>
                <Text style={styles.costValue}>${totalManoDeObra.toFixed(2)}</Text>
              </View>
              <View style={styles.costSubRow}>
                <Text style={styles.costSubLabel}>Promedio por trabajo: ${promedioManoDeObra.toFixed(2)}</Text>
              </View>
            </View>

            {Object.keys(trabajosPorTipo).length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Ionicons name="pie-chart-outline" size={24} color="#003366" />
                  <Text style={styles.sectionTitle}>Trabajos por Tipo</Text>
                </View>

                {Object.entries(trabajosPorTipo).map(([tipo, cantidad]) => (
                  <View style={styles.typeCard} key={tipo}>
                    <View style={styles.typeInfo}>
                      <View style={styles.typeIcon}>
                        <Ionicons name="build-outline" size={20} color="#003366" />
                      </View>
                      <Text style={styles.typeLabel}>{tipo}</Text>
                    </View>
                    <View style={styles.typeStats}>
                      <Text style={styles.typeCount}>{cantidad}</Text>
                      <Text style={styles.typePercentage}>{((cantidad / trabajos.length) * 100).toFixed(1)}%</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
            {trabajos.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="document-outline" size={64} color="#ccc" />
                <Text style={styles.emptyTitle}>No hay trabajos registrados</Text>
                <Text style={styles.emptySubtitle}>
                  No se encontraron trabajos para {format(selectedDate, "MMMM yyyy", { locale: es })}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    paddingBottom: 30,
    marginBottom: 20,
  },
  header: {
    padding: 40,
    paddingTop: 50,
    backgroundColor: "#2F4550",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    position: "absolute",
    left: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
  },
  filterSection: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    position: "relative",
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#003366",
    marginBottom: 12,
    textAlign: "center",
  },
  filterButtonsContainer: {
    flexDirection: "row",
    gap: 12,
  },
  filterButton: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  filterButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  filterButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#003366",
    flex: 1,
    marginLeft: 8,
    textTransform: "capitalize",
  },
  pickerDropdown: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxHeight: 200,
    position: "absolute",
    top: 90,
    left: 20,
    right: 20,
    zIndex: 1000,
  },
  pickerScrollView: {
    maxHeight: 200,
  },
  pickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f8f9fa",
  },
  pickerOptionSelected: {
    backgroundColor: "#FFEB3B",
  },
  pickerOptionText: {
    fontSize: 16,
    color: "#333",
    textTransform: "capitalize",
  },
  pickerOptionTextSelected: {
    fontWeight: "600",
    color: "#003366",
  },
  summaryContainer: {
    flex: 1,
    padding: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#003366",
    marginLeft: 10,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryCard: {
    backgroundColor: "#2196F3",
  },
  successCard: {
    backgroundColor: "#4CAF50",
  },
  infoCard: {
    backgroundColor: "#FF6B35",
  },
  warningCard: {
    backgroundColor: "#9C27B0",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: "#fff",
    textAlign: "center",
    marginTop: 4,
    opacity: 0.9,
  },
  detailCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  costInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  costLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginLeft: 8,
  },
  costValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#003366",
  },
  costSubRow: {
    marginTop: 8,
    paddingLeft: 28,
  },
  costSubLabel: {
    fontSize: 14,
    color: "#666",
  },
  typeCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  typeInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0f8ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    flex: 1,
  },
  typeStats: {
    alignItems: "flex-end",
  },
  typeCount: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#003366",
  },
  typePercentage: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  clientCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  clientRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFEB3B",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#003366",
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  clientCount: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  highlightCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  maxCard: {
    backgroundColor: "#E8F5E8",
    borderLeftWidth: 4,
    borderLeftColor: "#4CAF50",
  },
  minCard: {
    backgroundColor: "#FFF3E0",
    borderLeftWidth: 4,
    borderLeftColor: "#FF9800",
  },
  highlightHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  highlightTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginLeft: 8,
  },
  highlightClient: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#003366",
    marginBottom: 4,
  },
  highlightType: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  highlightAmount: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#4CAF50",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  loadingIndicator: {
    marginTop: 50,
  },
})

export default MonthlySummaryScreen
