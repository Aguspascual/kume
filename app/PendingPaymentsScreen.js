import React, { useState, useCallback } from "react"
import {
  StyleSheet,
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
} from "react-native"
import { useRouter, useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"

const PendingPaymentsScreen = () => {
  const router = useRouter()
  const [pendingWorks, setPendingWorks] = useState([])

  const loadPendingWorks = async () => {
    try {
      const trabajosJSON = await AsyncStorage.getItem("trabajos")
      const allTrabajos = trabajosJSON ? JSON.parse(trabajosJSON) : []

      // Filter only works that are NOT "Pagado" and NOT "Cancelado"
      const pending = allTrabajos
        .filter(
          (trabajo) =>
            trabajo.estadoPago !== "Pagado" && trabajo.estadoPago !== "Cancelado"
        )
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

      setPendingWorks(pending)
    } catch (error) {
      console.error("Error loading pending works:", error)
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadPendingWorks()
    }, [])
  )

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const getEstadoColor = (estado) => {
    switch (estado) {
      case "Terminado, falta pago":
      case "Pendiente":
        return "#FF9800"
      default:
        return "#FF9800"
    }
  }

  const handleWorkPress = (trabajo) => {
    router.push({
      pathname: "/WorkDetailScreen",
      params: { trabajo: JSON.stringify(trabajo) },
    })
  }

  const renderWorkItem = ({ item }) => {
    const totalCosto = (Number(item.costoMateriales) || 0) + (Number(item.costoManoDeObra) || 0)

    return (
      <TouchableOpacity
        style={styles.workItem}
        onPress={() => handleWorkPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.workHeader}>
          <Text style={styles.clientName} numberOfLines={1}>
            {item.clienteNombre}
          </Text>
          <View
            style={[
              styles.estadoBadge,
              { backgroundColor: getEstadoColor(item.estadoPago) },
            ]}
          >
            <Text style={styles.estadoText}>{item.estadoPago || "Pendiente"}</Text>
          </View>
        </View>

        <View style={styles.workClientInfo}>
          <Ionicons name="hammer-outline" size={16} color="#666" style={styles.iconSpaced} />
          <Text style={styles.workDescription} numberOfLines={2}>
            {item.trabajo}
          </Text>
        </View>

        <View style={styles.workFooter}>
          <Text style={styles.workDate}>
            {new Date(item.fecha).toLocaleDateString("es-AR")}
          </Text>
          <Text style={styles.workAmount}>{formatCurrency(totalCosto)}</Text>
        </View>
        <View style={styles.workArrow}>
          <Ionicons name="chevron-forward-outline" size={20} color="#666" />
        </View>
      </TouchableOpacity>
    )
  }

  const totalDeuda = pendingWorks.reduce((sum, item) => {
    const cost = (Number(item.costoMateriales) || 0) + (Number(item.costoManoDeObra) || 0)
    return sum + cost
  }, 0)

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back-outline" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Pendientes</Text>
        <TouchableOpacity style={styles.hiddenButton}>
          {/* Placeholder for symmetry */}
          <Ionicons name="arrow-back-outline" size={28} color="transparent" />
        </TouchableOpacity>
      </View>

      <View style={styles.totalDeudaContainer}>
        <View style={styles.totalDeudaHeader}>
          <Ionicons name="wallet-outline" size={24} color="#FF9800" />
          <Text style={styles.totalDeudaLabel}>Total a cobrar:</Text>
        </View>
        <Text style={styles.totalDeudaValue}>{formatCurrency(totalDeuda)}</Text>
      </View>

      <FlatList
        data={pendingWorks}
        renderItem={renderWorkItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-done-circle-outline" size={60} color="#4CAF50" />
            <Text style={styles.emptyText}>¡No tienes trabajos pendientes de cobro!</Text>
          </View>
        }
      />
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
    justifyContent: "space-between",
  },
  backButton: {
    padding: 5,
  },
  hiddenButton: {
    padding: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  totalDeudaContainer: {
    backgroundColor: "#fff3e0",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FF9800",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  totalDeudaHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    justifyContent: "center",
  },
  totalDeudaLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FF9800",
    marginLeft: 8,
  },
  totalDeudaValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FF9800",
    textAlign: "center",
  },
  listContainer: {
    padding: 20,
    paddingTop: 0,
    paddingBottom: 40,
  },
  workItem: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: "#FF9800",
    position: "relative",
  },
  workHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
    paddingRight: 10,
  },
  workDescription: {
    fontSize: 15,
    color: "#666",
    fontWeight: "500",
    flex: 1,
  },
  estadoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 70,
    alignItems: "center",
    maxWidth: 100,
  },
  estadoText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#FFF",
    textAlign: "center",
  },
  workClientInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  iconSpaced: {
    marginRight: 6,
  },
  clientName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2F4550",
    flex: 1,
    marginRight: 10,
  },
  workFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  workDate: {
    fontSize: 14,
    color: "#888",
  },
  workAmount: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2F4550",
    marginRight: 20,
  },
  workArrow: {
    position: "absolute",
    right: 16,
    top: "50%",
    marginTop: -10,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 50,
    padding: 20,
    backgroundColor: "#FFF",
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 18,
    color: "#2F4550",
    marginTop: 15,
    textAlign: "center",
    fontWeight: "500",
  },
})

export default PendingPaymentsScreen
