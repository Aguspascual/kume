import { useState } from "react"
import { ScrollView, StyleSheet, SafeAreaView, View, Text, TouchableOpacity, Alert, Modal, FlatList, TextInput, Image } from "react-native"
import { useRouter, useLocalSearchParams } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import AsyncStorage from "@react-native-async-storage/async-storage"
import DateTimePicker from "@react-native-community/datetimepicker"

const BudgetDetailScreen = () => {
  const router = useRouter()
  const { presupuesto: presupuestoJSON } = useLocalSearchParams()
  const [presupuesto, setPresupuesto] = useState(JSON.parse(presupuestoJSON))
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [convertModalVisible, setConvertModalVisible] = useState(false)
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false)
  const [newMaterial, setNewMaterial] = useState({ descripcion: "", cantidad: "", precio: "" })
  const [photos, setPhotos] = useState(presupuesto.photos || [])

  // Estado para la alerta personalizada
  const [alertConfig, setAlertConfig] = useState({
      visible: false,
      title: "",
      message: "",
      onConfirm: null,
      onCancel: null,
      confirmText: "Aceptar",
      cancelText: null,
      destructive: false
  })

  // Función auxiliar para mostrar alertas personalizadas
  const showCustomAlert = (title, message, options = {}) => {
      setAlertConfig({
          visible: true,
          title,
          message,
          onConfirm: options.onConfirm || (() => setAlertConfig(prev => ({ ...prev, visible: false }))),
          onCancel: options.onCancel || null,
          confirmText: options.confirmText || "Aceptar",
          cancelText: options.cancelText || null,
          destructive: options.destructive || false
      })
  }
  const hideCustomAlert = () => {
      setAlertConfig(prev => ({ ...prev, visible: false }))
  }

  // formatCurrency: quita los decimales y agrega separador de miles con punto
  const formatCurrency = (amount) => {
    return Math.round(Number(amount) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  const getEstadoColor = (estado) => {
    switch (estado) {
      case "Aceptado":
        return "#4CAF50"
      case "Pendiente":
        return "#FF9800"
      case "Rechazado":
        return "#F44336"
      default:
        return "#FF9800"
    }
  }

  const getEstadoIcon = (estado) => {
    switch (estado) {
      case "Aceptado":
        return "checkmark-circle"
      case "Pendiente":
        return "time"
      case "Rechazado":
        return "close-circle"
      default:
        return "time"
    }
  }

  const cambiarEstadoPresupuesto = async (nuevoEstado) => {
    try {
      const presupuestosJSON = await AsyncStorage.getItem("presupuestos")
      const presupuestos = presupuestosJSON ? JSON.parse(presupuestosJSON) : []

      const presupuestosActualizados = presupuestos.map((p) =>
        p.id === presupuesto.id ? { ...p, estado: nuevoEstado } : p,
      )

      await AsyncStorage.setItem("presupuestos", JSON.stringify(presupuestosActualizados))
      setPresupuesto({ ...presupuesto, estado: nuevoEstado })
      showCustomAlert("Éxito", `Estado del presupuesto cambiado a "${nuevoEstado}"`)
    } catch (error) {
      console.error("Error al cambiar estado del presupuesto:", error)
      showCustomAlert("Error", "No se pudo cambiar el estado del presupuesto")
    }
  }

  const handleAceptarPresupuesto = () => {
    showCustomAlert(
      "Aceptar Presupuesto",
      "¿Estás seguro que deseas aceptar este presupuesto? A continuación podrás programar la fecha del trabajo.",
      {
        cancelText: "Cancelar",
        confirmText: "Aceptar",
        onCancel: hideCustomAlert,
        onConfirm: async () => {
          hideCustomAlert()
          
          // Cambiar estado en UI y Storage a "Aceptado" para que quede registro
          try {
            const presupuestosJSON = await AsyncStorage.getItem("presupuestos")
            const presupuestos = presupuestosJSON ? JSON.parse(presupuestosJSON) : []
            const presupuestosActualizados = presupuestos.map((p) =>
              p.id === presupuesto.id ? { ...p, estado: "Aceptado" } : p,
            )
            await AsyncStorage.setItem("presupuestos", JSON.stringify(presupuestosActualizados))
            setPresupuesto({ ...presupuesto, estado: "Aceptado" })
            
            // Inmediatamente mostrar opciones de fecha
            mostrarModalConversion()
          } catch(e) {
             showCustomAlert("Error", "No se pudo actualizar el estado del presupuesto")
          }
        }
      }
    )
  }

  const handleRechazarPresupuesto = () => {
    showCustomAlert(
      "Rechazar Presupuesto",
      "¿Estás seguro que deseas rechazar este presupuesto? El presupuesto será eliminado.",
      {
        cancelText: "Volver",
        confirmText: "Rechazar y Eliminar",
        destructive: true,
        onCancel: hideCustomAlert,
        onConfirm: async () => {
          hideCustomAlert()
          try {
            const presupuestosJSON = await AsyncStorage.getItem("presupuestos")
            const presupuestos = presupuestosJSON ? JSON.parse(presupuestosJSON) : []
            const presupuestosSinRechazado = presupuestos.filter((p) => p.id !== presupuesto.id)
            await AsyncStorage.setItem("presupuestos", JSON.stringify(presupuestosSinRechazado))
            showCustomAlert("Éxito", "Presupuesto rechazado y eliminado.", {
              cancelText: null,
              confirmText: "Volver al inicio",
              onConfirm: () => {
                hideCustomAlert()
                router.replace("/")
              }
            })
          } catch(e) {
            console.error("Error al eliminar presupuesto rechazado:", e)
            showCustomAlert("Error", "No se pudo eliminar el presupuesto.")
          }
        }
      }
    )
  }

  const handleDeleteMaterial = (indexToDelete) => {
    showCustomAlert(
      "Confirmar Eliminación",
      "¿Estás seguro de que quieres eliminar este material?",
      {
        cancelText: "Cancelar",
        confirmText: "Eliminar",
        destructive: true,
        onCancel: hideCustomAlert,
        onConfirm: async () => {
          hideCustomAlert()
          const nuevosMateriales = presupuesto.materiales.filter(
            (_, index) => index !== indexToDelete
          )

          const nuevoTotalMateriales = nuevosMateriales.reduce(
            (sum, item) => sum + Number(item.cantidad) * Number(item.precio),
            0
          )
          const nuevoTotalFinal = nuevoTotalMateriales + presupuesto.costoManoDeObra

          const presupuestoActualizado = {
            ...presupuesto,
            materiales: nuevosMateriales,
            totalMateriales: nuevoTotalMateriales,
            total: nuevoTotalFinal,
          }

          setPresupuesto(presupuestoActualizado)

          try {
            const presupuestosJSON = await AsyncStorage.getItem("presupuestos")
            const presupuestos = presupuestosJSON ? JSON.parse(presupuestosJSON) : []
            const presupuestosGuardados = presupuestos.map((p) =>
              p.id === presupuesto.id ? presupuestoActualizado : p
            )
            await AsyncStorage.setItem("presupuestos", JSON.stringify(presupuestosGuardados))
            showCustomAlert("Éxito", "Material eliminado correctamente y presupuesto actualizado.")
          } catch (error) {
            console.error("Error al eliminar material y actualizar el presupuesto:", error)
            showCustomAlert("Error", "No se pudo eliminar el material o actualizar el presupuesto.")
          }
        }
      }
    )
  }

  const handleAddMaterial = async () => {
    if (!newMaterial.descripcion || !newMaterial.cantidad || !newMaterial.precio) {
      showCustomAlert("Error", "Por favor, completa todos los campos del material.")
      return
    }

    const materialToAdd = {
      descripcion: newMaterial.descripcion,
      cantidad: Number(newMaterial.cantidad),
      precio: Number(newMaterial.precio),
    }

    const nuevosMateriales = [...presupuesto.materiales, materialToAdd]

    const nuevoTotalMateriales = nuevosMateriales.reduce(
      (sum, item) => sum + Number(item.cantidad) * Number(item.precio),
      0
    )
    const nuevoTotalFinal = nuevoTotalMateriales + presupuesto.costoManoDeObra

    const presupuestoActualizado = {
      ...presupuesto,
      materiales: nuevosMateriales,
      totalMateriales: nuevoTotalMateriales,
      total: nuevoTotalFinal,
    }

    setPresupuesto(presupuestoActualizado)
    setShowAddMaterialModal(false)
    setNewMaterial({ descripcion: "", cantidad: "", precio: "" })

    try {
      const presupuestosJSON = await AsyncStorage.getItem("presupuestos")
      const presupuestos = presupuestosJSON ? JSON.parse(presupuestosJSON) : []
      const presupuestosGuardados = presupuestos.map((p) =>
        p.id === presupuesto.id ? presupuestoActualizado : p
      )
      await AsyncStorage.setItem("presupuestos", JSON.stringify(presupuestosGuardados))
      showCustomAlert("Éxito", "Material agregado correctamente y presupuesto actualizado.")
    } catch (error) {
      console.error("Error al agregar material:", error)
      showCustomAlert("Error", "No se pudo agregar el material.")
    }
  }

  const mostrarModalConversion = () => {
    setConvertModalVisible(true)
  }

  const convertirATrabajo = () => {
    setConvertModalVisible(false)
    setShowDatePicker(true)
  }

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(false)
    if (selectedDate) {
      setSelectedDate(selectedDate)
      setShowTimePicker(true)
    } else {
      // Si el usuario cancela, volvemos a "Pendiente"
      cambiarEstadoPresupuesto("Pendiente")
    }
  }

  const onTimeChange = async (event, selectedTime) => {
    setShowTimePicker(false)
    if (selectedTime) {
      const finalDate = new Date(selectedDate)
      finalDate.setHours(selectedTime.getHours())
      finalDate.setMinutes(selectedTime.getMinutes())

      try {
        const trabajosJSON = await AsyncStorage.getItem("trabajos")
        const trabajosExistentes = trabajosJSON ? JSON.parse(trabajosJSON) : []

        const selectedDateTime = finalDate.getTime()
        const conflictingWork = trabajosExistentes.find((work) => {
          const workDateTime = new Date(work.fecha).getTime()
          const timeDifference = Math.abs(selectedDateTime - workDateTime)
          return timeDifference < 60000
        })

        if (conflictingWork) {
          const conflictDate = new Date(conflictingWork.fecha)
          showCustomAlert(
            "Horario Ocupado",
            `Ya existe un trabajo programado para el ${conflictDate.toLocaleDateString()} a las ${conflictDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.\n\nCliente: ${conflictingWork.clienteNombre}\n\nPor favor selecciona otro horario.`
          )
          return
        }

        const nuevoTrabajo = {
          id: Date.now().toString(),
          clienteId: presupuesto.clienteId,
          clienteNombre: presupuesto.clienteNombre,
          domicilio: presupuesto.direccion || "",
          telefono: presupuesto.telefono,
          tipoTrabajo: presupuesto.tipoTrabajo,
          trabajo: presupuesto.descripcionTrabajo,
          costoMateriales: presupuesto.totalMateriales,
          costoManoDeObra: presupuesto.costoManoDeObra,
          fecha: finalDate.toISOString(),
          materiales: presupuesto.materiales || [],
          photos: presupuesto.photos || [],
          estadoPago: "Pendiente",
          presupuestoId: presupuesto.id,
        }

        const trabajosActualizados = [...trabajosExistentes, nuevoTrabajo]
        await AsyncStorage.setItem("trabajos", JSON.stringify(trabajosActualizados))

        // Eliminar el presupuesto ahora que es un trabajo
        const presupuestosJSON = await AsyncStorage.getItem("presupuestos")
        const presupuestos = presupuestosJSON ? JSON.parse(presupuestosJSON) : []
        const presupuestosSinConvertido = presupuestos.filter((p) => p.id !== presupuesto.id)
        await AsyncStorage.setItem("presupuestos", JSON.stringify(presupuestosSinConvertido))

        showCustomAlert(
          "Trabajo Creado",
          `El presupuesto ha sido convertido a trabajo y programado para el ${format(finalDate, "dd/MM/yyyy 'a las' HH:mm", { locale: es })}.`,
          {
            confirmText: "Ver Trabajo",
            cancelText: "Volver al inicio",
            onCancel: () => {
              hideCustomAlert()
              router.replace("/")
            },
            onConfirm: () => {
              hideCustomAlert()
              router.replace({
                pathname: "WorkDetailScreen",
                params: { trabajo: JSON.stringify(nuevoTrabajo) },
              })
            }
          }
        )
      } catch (error) {
        console.error("Error al convertir presupuesto a trabajo:", error)
        showCustomAlert("Error", "No se pudo convertir el presupuesto a trabajo")
      }
    } else {
      // Si el usuario cancela en el timepicker, volvemos a "Pendiente"
      cambiarEstadoPresupuesto("Pendiente")
    }
  }

  const renderMaterialItem = ({ item, index }) => (
    <View style={styles.materialItem}>
      <View style={styles.materialHeader}>
        <Text style={styles.materialNumber}>{index + 1}.</Text>
        <Text style={styles.materialDescription}>{item.descripcion}</Text>
        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteMaterial(index)}>
          <Ionicons name="trash-outline" size={20} color="#F44336" />
        </TouchableOpacity>
      </View>
      <View style={styles.materialDetails}>
        <Text style={styles.materialQuantity}>Cantidad: {item.cantidad}</Text>
        <Text style={styles.materialPrice}>
          Precio c/u: ${formatCurrency(item.precio)}
        </Text>
        <Text style={styles.materialSubtotal}>
          Subtotal: ${formatCurrency(Number.parseFloat(item.cantidad) * Number.parseFloat(item.precio))}
        </Text>
      </View>
    </View>
  )

  const renderPhotoItem = ({ item }) => (
    <Image source={{ uri: item }} style={styles.photo} />
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back-outline" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Presupuesto</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.detailsContainer}>
          <View
            style={[
              styles.detailItem,
              { borderLeftColor: getEstadoColor(presupuesto.estado) },
            ]}
          >
            <View style={styles.estadoContainer}>
              <View style={styles.estadoInfo}>
                <Text style={styles.label}>Estado del Presupuesto:</Text>
                <View style={styles.estadoBadge}>
                  <Ionicons
                    name={getEstadoIcon(presupuesto.estado)}
                    size={20}
                    color={getEstadoColor(presupuesto.estado)}
                  />
                  <Text style={[styles.estadoText, { color: getEstadoColor(presupuesto.estado) }]}>
                    {presupuesto.estado}
                  </Text>
                </View>
              </View>

              <View style={styles.botonesContainer}>
                {presupuesto.estado === "Pendiente" && (
                  <>
                    <TouchableOpacity
                      style={[styles.estadoButton, styles.estadoButtonSuccess]}
                      onPress={handleAceptarPresupuesto}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark-circle" size={24} color="white" />
                      <Text style={styles.estadoButtonText}>Aceptar Presupuesto</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.estadoButton, styles.estadoButtonDanger]}
                      onPress={handleRechazarPresupuesto}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close-circle" size={24} color="white" />
                      <Text style={styles.estadoButtonText}>Rechazar Presupuesto</Text>
                    </TouchableOpacity>
                  </>
                )}

                {presupuesto.estado === "Aceptado" && (
                  <TouchableOpacity
                    style={[styles.estadoButton, styles.convertButton]}
                    onPress={mostrarModalConversion}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="hammer" size={24} color="white" />
                    <Text style={styles.estadoButtonText}>Convertir a Trabajo</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.label}>Cliente:</Text>
            <Text style={styles.value}>{presupuesto.clienteNombre}</Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.label}>Dirección:</Text>
            <Text style={styles.value}>{presupuesto.direccion || "No especificada"}</Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.label}>Teléfono:</Text>
            <Text style={styles.value}>{presupuesto.telefono}</Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.label}>Tipo de Trabajo:</Text>
            <Text style={styles.value}>{presupuesto.tipoTrabajo}</Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.label}>Descripción del Trabajo:</Text>
            <Text style={styles.value}>{presupuesto.descripcionTrabajo}</Text>
          </View>

          <View style={styles.materialesSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Materiales</Text>
              <TouchableOpacity style={styles.addButton} onPress={() => setShowAddMaterialModal(true)}>
                <Ionicons name="add-circle-outline" size={24} color="#003366" />
                <Text style={styles.addButtonText}>Agregar</Text>
              </TouchableOpacity>
            </View>
            {presupuesto.materiales.length > 0 ? (
              <FlatList
                data={presupuesto.materiales}
                renderItem={renderMaterialItem}
                keyExtractor={(item, index) => `material-${index}`}
                scrollEnabled={false}
              />
            ) : (
              <Text style={styles.emptyListText}>No hay materiales registrados.</Text>
            )}
          </View>

          {photos.length > 0 && (
            <View style={styles.photosSection}>
              <Text style={styles.sectionTitle}>Fotos del Presupuesto</Text>
              <FlatList
                data={photos}
                renderItem={renderPhotoItem}
                keyExtractor={(item, index) => `photo-${index}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.photosList}
              />
            </View>
          )}

          <View style={styles.costosSection}>
            <View style={styles.costoItem}>
              <Text style={styles.costoLabel}>Total Materiales:</Text>
              <Text style={styles.costoValue}>${formatCurrency(presupuesto.totalMateriales)}</Text>
            </View>

            <View style={styles.costoItem}>
              <Text style={styles.costoLabel}>Mano de Obra:</Text>
              <Text style={styles.costoValue}>${formatCurrency(presupuesto.costoManoDeObra)}</Text>
            </View>

            <View style={[styles.costoItem, styles.totalFinal]}>
              <Text style={styles.totalLabel}>TOTAL:</Text>
              <Text style={styles.totalValue}>${formatCurrency(presupuesto.total)}</Text>
            </View>
          </View>

          <View style={styles.fechasSection}>
            <View style={styles.fechaItem}>
              <Text style={styles.label}>Fecha de Creación:</Text>
              <Text style={styles.value}>
                {format(new Date(presupuesto.fechaCreacion), "dd/MM/yyyy", { locale: es })}
              </Text>
            </View>

            <View style={styles.fechaItem}>
              <Text style={styles.label}>Válido hasta:</Text>
              <Text style={styles.value}>
                {format(new Date(presupuesto.fechaValidez), "dd/MM/yyyy", { locale: es })}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={convertModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setConvertModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Convertir a Trabajo</Text>
            <Text style={styles.modalSubtitle}>
              Se creará un nuevo trabajo basado en este presupuesto. Selecciona la fecha y hora para
              programarlo.
            </Text>

            <TouchableOpacity style={styles.confirmButton} onPress={convertirATrabajo}>
              <Ionicons name="calendar-outline" size={24} color="white" />
              <Text style={styles.confirmButtonText}>Seleccionar Fecha y Hora</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={() => setConvertModalVisible(false)}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAddMaterialModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAddMaterialModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.addMaterialModalContent}>
            <Text style={styles.modalTitle}>Agregar Material</Text>

            <TextInput
              style={styles.input}
              placeholder="Descripción del material"
              placeholderTextColor="#999"
              value={newMaterial.descripcion}
              onChangeText={(text) => setNewMaterial({ ...newMaterial, descripcion: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Cantidad"
              placeholderTextColor="#999"
              value={newMaterial.cantidad}
              onChangeText={(text) => setNewMaterial({ ...newMaterial, cantidad: text })}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Precio por unidad"
              placeholderTextColor="#999"
              value={newMaterial.precio}
              onChangeText={(text) => setNewMaterial({ ...newMaterial, precio: text })}
              keyboardType="numeric"
            />

            <TouchableOpacity style={styles.addButtonModal} onPress={handleAddMaterial}>
              <Ionicons name="add-circle" size={24} color="white" />
              <Text style={styles.addButtonModalText}>Guardar Material</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddMaterialModal(false)}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={onDateChange}
          minimumDate={new Date()}
        />
      )}

      {showTimePicker && (
        <DateTimePicker value={selectedDate} mode="time" display="default" onChange={onTimeChange} />
      )}

      {/* Custom Alert Modal */}
      <Modal
          transparent={true}
          visible={alertConfig.visible}
          animationType="fade"
          onRequestClose={hideCustomAlert}
      >
          <View style={styles.alertOverlay}>
              <View style={styles.alertBox}>
                  <Text style={styles.alertTitle}>{alertConfig.title}</Text>
                  <Text style={styles.alertMessage}>{alertConfig.message}</Text>
                  <View style={styles.alertButtons}>
                      {alertConfig.onCancel && (
                          <TouchableOpacity 
                              style={[styles.alertButton, styles.alertCancelButton]} 
                              onPress={alertConfig.onCancel}
                          >
                              <Text style={styles.alertCancelText}>{alertConfig.cancelText}</Text>
                          </TouchableOpacity>
                      )}
                      <TouchableOpacity 
                          style={[
                              styles.alertButton, 
                              styles.alertConfirmButton, 
                              alertConfig.destructive && styles.alertDestructiveButton
                          ]} 
                          onPress={alertConfig.onConfirm}
                      >
                          <Text style={styles.alertConfirmText}>{alertConfig.confirmText}</Text>
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2F4550",
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingBottom: 20,
    paddingTop: 50,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    position: "absolute",
    left: 20,
    bottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFF",
    flex: 1,
    textAlign: "center",
  },
  detailsContainer: {
    flex: 1,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    marginTop: -20,
  },
  detailItem: {
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: "transparent",
  },
  estadoContainer: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  estadoInfo: {
    marginBottom: 15,
  },
  estadoBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  estadoText: {
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 8,
  },
  botonesContainer: {
    flexDirection: "column",
    gap: 12,
  },
  estadoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    minHeight: 50,
  },
  estadoButtonSuccess: {
    backgroundColor: "#4CAF50",
  },
  estadoButtonDanger: {
    backgroundColor: "#F44336",
  },
  convertButton: {
    backgroundColor: "#003366",
  },
  estadoButtonText: {
    color: "white",
    fontWeight: "700",
    marginLeft: 8,
    fontSize: 16,
    textAlign: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
    marginBottom: 5,
  },
  value: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2F4550",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2F4550",
  },
  materialesSection: {
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#E1E5EA",
  },
  materialItem: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#003366",
  },
  materialHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
    justifyContent: "space-between",
    alignItems: "center",
  },
  materialNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#003366",
    marginRight: 8,
    minWidth: 20,
  },
  materialDescription: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  materialDetails: {
    marginLeft: 28,
  },
  materialQuantity: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },
  materialPrice: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },
  materialSubtotal: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2F4550",
  },
  deleteButton: {
    marginLeft: 10,
    padding: 5,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E1E5EA",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: "#2F4550",
    fontWeight: "600",
    marginLeft: 5,
  },
  costosSection: {
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#E1E5EA",
  },
  costoItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  costoLabel: {
    fontSize: 16,
    color: "#2F4550",
  },
  costoValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2F4550",
  },
  totalFinal: {
    borderTopWidth: 1,
    borderTopColor: "#E1E5EA",
    paddingTop: 10,
    marginTop: 10,
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2F4550",
  },
  totalValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#4CAF50",
  },
  fechasSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  fechaItem: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: "#E1E5EA",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 30,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
    width: "90%",
  },
  addMaterialModalContent: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 25,
    width: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  input: {
    width: "100%",
    backgroundColor: "#F5F7FA",
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E1E5EA",
    color: "#2F4550",
  },
  addButtonModal: {
    backgroundColor: "#4CAF50",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 12,
    marginBottom: 15,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  addButtonModalText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2F4550",
    textAlign: "center",
    marginBottom: 10,
  },
  modalSubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 22,
  },
  confirmButton: {
    backgroundColor: "#2F4550",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 12,
    marginBottom: 15,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  confirmButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 10,
  },
  cancelButton: {
    backgroundColor: "#F44336",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 12,
    marginBottom: 15,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  cancelButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  photosSection: {
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#E1E5EA",
  },
  photosList: {
    marginTop: 15,
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginRight: 15,
    borderWidth: 2,
    borderColor: "#E1E5EA",
  },
  emptyListText: {
    textAlign: "center",
    marginTop: 10,
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
  },
  // Custom Alert Styles
  alertOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
  },
  alertBox: {
      backgroundColor: "#FFF",
      borderRadius: 15,
      padding: 20,
      width: "90%",
      maxWidth: 400,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 5,
  },
  alertTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: "#2F4550",
      marginBottom: 10,
      textAlign: "center",
  },
  alertMessage: {
      fontSize: 15,
      color: "#555",
      marginBottom: 20,
      textAlign: "center",
      lineHeight: 22,
  },
  alertButtons: {
      flexDirection: "row",
      justifyContent: "space-around",
      gap: 10,
  },
  alertButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
  },
  alertCancelButton: {
      backgroundColor: "#F5F7FA",
      borderWidth: 1,
      borderColor: "#E1E5EA",
  },
  alertConfirmButton: {
      backgroundColor: "#2196F3",
  },
  alertDestructiveButton: {
      backgroundColor: "#F44336",
  },
  alertCancelText: {
      fontSize: 16,
      fontWeight: "600",
      color: "#555",
  },
  alertConfirmText: {
      fontSize: 16,
      fontWeight: "600",
      color: "#FFF",
  },
});

export default BudgetDetailScreen;
