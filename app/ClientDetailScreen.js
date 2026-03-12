import { StyleSheet, SafeAreaView, View, Text, TouchableOpacity, Linking, Alert, ScrollView, FlatList, TextInput } from "react-native"
import { useState, useCallback } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"

const ClientDetailScreen = () => {
  const router = useRouter()
  const { cliente: clienteJSON } = useLocalSearchParams()
  const cliente = JSON.parse(clienteJSON)

  // Nuevos estados para la edición
  const [isEditing, setIsEditing] = useState(false)
  const [domicilioEdit, setDomicilioEdit] = useState(cliente.domicilio)
  const [telefonoEdit, setTelefonoEdit] = useState(cliente.telefono)

  const [trabajosCliente, setTrabajosCliente] = useState([])

  const loadTrabajos = async () => {
    try {
      const trabajosJSON = await AsyncStorage.getItem("trabajos")
      const allTrabajos = trabajosJSON ? JSON.parse(trabajosJSON) : []

      const clienteTrabajos = allTrabajos
        .filter((trabajo) => trabajo.clienteId === cliente.id)
        .map((trabajo) => ({
          id: trabajo.id,
          descripcion: trabajo.trabajo,
          fecha: new Date(trabajo.fecha).toLocaleDateString(),
          monto: trabajo.costoMateriales + trabajo.costoManoDeObra,
          estado: trabajo.estadoPago,
          originalData: trabajo,
        }))

      setTrabajosCliente(clienteTrabajos)
    } catch (error) {
      console.error("Error al cargar trabajos:", error)
      Alert.alert("Error", "No se pudieron cargar los trabajos.")
    }
  }

  // Función para guardar los cambios en el cliente
  const handleSave = async () => {
    try {
      const clientesJSON = await AsyncStorage.getItem("clientes")
      const allClients = clientesJSON ? JSON.parse(clientesJSON) : []

      const updatedClients = allClients.map((c) => {
        if (c.id === cliente.id) {
          return {
            ...c,
            domicilio: domicilioEdit,
            telefono: telefonoEdit,
          }
        }
        return c
      })

      await AsyncStorage.setItem("clientes", JSON.stringify(updatedClients))
      Alert.alert("¡Guardado!", "Los cambios se han guardado correctamente.")
      setIsEditing(false) // Desactivar el modo de edición
    } catch (error) {
      console.error("Error al guardar los cambios del cliente:", error)
      Alert.alert("Error", "No se pudieron guardar los cambios.")
    }
  }

  // Se ejecuta cuando la pantalla está enfocada o desenfocada
  useFocusEffect(
    useCallback(() => {
      loadTrabajos()
      return () => {
        // Esta función se ejecuta al desenfocar la pantalla (al salir)
        if (isEditing) {
          handleSave()
        }
      }
    }, [cliente.id, isEditing, domicilioEdit, telefonoEdit]),
  )

  const totalPendiente = trabajosCliente
    .filter((trabajo) => trabajo.estado === "Pendiente")
    .reduce((total, trabajo) => total + trabajo.monto, 0)

  const handleCall = () => {
    if (telefonoEdit) {
      const phoneNumber = `tel:${telefonoEdit}`
      Linking.openURL(phoneNumber).catch((err) => {
        console.error("Error al intentar realizar la llamada:", err)
        Alert.alert("Error", "No se pudo realizar la llamada.")
      })
    }
  }

  const handleWhatsApp = () => {
    if (telefonoEdit) {
      const whatsappUrl = `whatsapp://send?phone=${telefonoEdit}`
      Linking.openURL(whatsappUrl).catch((err) => {
        console.error("Error al intentar abrir WhatsApp:", err)
        Alert.alert("Error", "No se pudo abrir WhatsApp.")
      })
    }
  }

  const handleTrabajoPress = (trabajo) => {
    const workData = trabajo.originalData || trabajo
    router.push({
      pathname: "/WorkDetailScreen",
      params: { trabajo: JSON.stringify(workData) },
    })
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const getEstadoColor = (estado) => {
    switch (estado) {
      case "Pendiente":
        return "#ff9800"
      case "Pagado":
        return "#4caf50"
      case "Cancelado":
        return "#f44336"
      default:
        return "#666"
    }
  }

  const renderTrabajoItem = ({ item }) => (
    <TouchableOpacity style={styles.trabajoItem} onPress={() => handleTrabajoPress(item)} activeOpacity={0.7}>
      <View style={styles.trabajoHeader}>
        <Text style={styles.trabajoDescripcion} numberOfLines={2}>{item.descripcion}</Text>
        <View style={[styles.estadoBadge, { backgroundColor: getEstadoColor(item.estado) }]}>
          <Text style={styles.estadoText}>{item.estado}</Text>
        </View>
      </View>
      <View style={styles.trabajoFooter}>
        <Text style={styles.trabajoFecha}>{item.fecha}</Text>
        <Text style={styles.trabajoMonto}>{formatCurrency(item.monto)}</Text>
      </View>
      <View style={styles.trabajoArrow}>
        <Ionicons name="chevron-forward-outline" size={20} color="#666" />
      </View>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back-outline" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Detalles del Cliente</Text>
        <TouchableOpacity onPress={() => setIsEditing(!isEditing)} style={styles.editButton}>
          <Ionicons name={isEditing ? "checkmark-circle-outline" : "pencil-outline"} size={30} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.detailsContainer}>
          <View style={styles.detailItem}>
            <Text style={styles.label}>Nombre completo:</Text>
            <Text style={styles.value}>{cliente.nombre} {cliente.apellido}</Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.label}>Teléfono:</Text>
            <View style={styles.phoneContent}>
              {isEditing ? (
                <TextInput
                  style={[styles.input, styles.editableValue]}
                  value={telefonoEdit}
                  onChangeText={setTelefonoEdit}
                  keyboardType="phone-pad"
                />
              ) : (
                <Text style={styles.value}>{telefonoEdit}</Text>
              )}
              <View style={styles.actionButtons}>
                <TouchableOpacity onPress={handleCall} style={styles.callButton}>
                  <Ionicons name="call-outline" size={24} color="#007bff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleWhatsApp} style={styles.whatsappButton}>
                  <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.label}>Domicilio:</Text>
            {isEditing ? (
              <TextInput
                style={[styles.input, styles.editableValue]}
                value={domicilioEdit}
                onChangeText={setDomicilioEdit}
              />
            ) : (
              <Text style={styles.value}>{domicilioEdit}</Text>
            )}
          </View>

          <View style={[styles.detailItem, styles.totalPendienteContainer]}>
            <View style={styles.totalPendienteHeader}>
              <Ionicons name="wallet-outline" size={24} color="#ff9800" />
              <Text style={styles.totalPendienteLabel}>Total Pendiente:</Text>
            </View>
            <Text style={styles.totalPendienteValue}>{formatCurrency(totalPendiente)}</Text>
          </View>

          <View style={styles.trabajosSection}>
            <View style={styles.trabajosHeader}>
              <Ionicons name="hammer-outline" size={24} color="#003366" />
              <Text style={styles.trabajosTitle}>Trabajos Realizados</Text>
              <Text style={styles.trabajosCount}>({trabajosCliente.length})</Text>
            </View>

            <FlatList
              data={trabajosCliente}
              renderItem={renderTrabajoItem}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        </View>
      </ScrollView>
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
    left: 30,
  },
  editButton: {
    position: "absolute",
    right: 20,
    fontWeight: "bold",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  scrollContainer: {
    flex: 1,
  },
  detailsContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 30,
    paddingTop: 40,
    marginTop: -20,
    minHeight: "100%",
  },
  detailItem: {
    backgroundColor: "#f0f0f0",
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
    marginBottom: 5,
  },
  value: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#003366",
  },
  editableValue: {
    // Estilo para el TextInput cuando está en modo de edición
    backgroundColor: "#e0e0e0",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    fontSize: 18,
    fontWeight: "bold",
    color: "#003366",
    flex: 1,
  },
  phoneContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 10,
  },
  callButton: {
    padding: 5,
    borderRadius: 50,
  },
  whatsappButton: {
    padding: 5,
    borderRadius: 50,
  },
  totalPendienteContainer: {
    backgroundColor: "#fff3e0",
    borderWidth: 2,
    borderColor: "#ff9800",
  },
  totalPendienteHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  totalPendienteLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ff9800",
    marginLeft: 8,
  },
  totalPendienteValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ff9800",
    textAlign: "center",
  },
  trabajosSection: {
    marginTop: 10,
  },
  trabajosHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 5,
  },
  trabajosTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#003366",
    marginLeft: 8,
    flex: 1,
  },
  trabajosCount: {
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  trabajoItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: "#003366",
    position: "relative",
  },
  trabajoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    paddingRight: 20,
  },
  trabajoDescripcion: {
    fontSize: 16,
    fontWeight: "600",
    color: "#003366",
    flex: 1,
    marginRight: 10,
  },
  estadoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 70,
    alignItems: "center",
  },
  estadoText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#fff",
  },
  trabajoFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trabajoFecha: {
    fontSize: 14,
    color: "#666",
  },
  trabajoMonto: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#003366",
  },
  trabajoArrow: {
    position: "absolute",
    right: 16,
    top: "50%",
    marginTop: -10,
  },
  separator: {
    height: 12,
  },
})

export default ClientDetailScreen