import { useState } from "react"
import { ScrollView, StyleSheet, View, Text, TouchableOpacity, Modal, FlatList, TextInput, Image, Linking } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter, useLocalSearchParams } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import AsyncStorage from "../lib/backendStorage"
import DateTimePicker from "@react-native-community/datetimepicker"
import { createAndSharePdf } from "../lib/sharePdf"
import { useAuth } from "../lib/auth"

const parseBudgetParam = (value) => {
  try {
    const parsed = JSON.parse(value || "{}")
    return { ...parsed, materiales: Array.isArray(parsed.materiales) ? parsed.materiales : [], photos: Array.isArray(parsed.photos) ? parsed.photos : [] }
  } catch {
    return { materiales: [], photos: [] }
  }
}

const BudgetDetailScreen = () => {
  const router = useRouter()
  const { session } = useAuth()
  const { presupuesto: presupuestoParam } = useLocalSearchParams()
  const presupuestoJSON = Array.isArray(presupuestoParam) ? presupuestoParam[0] : presupuestoParam
  const [presupuesto, setPresupuesto] = useState(() => parseBudgetParam(presupuestoJSON))
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [hasSelectedScheduleDate, setHasSelectedScheduleDate] = useState(false)
  const [hasSelectedScheduleTime, setHasSelectedScheduleTime] = useState(false)
  const [convertModalVisible, setConvertModalVisible] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false)
  const [newMaterial, setNewMaterial] = useState({ descripcion: "", cantidad: "", precio: "" })
  const [photos] = useState(() => parseBudgetParam(presupuestoJSON).photos)

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

  const formatSafeDate = (dateValue) => {
    const date = new Date(dateValue)
    return Number.isNaN(date.getTime()) ? "Sin fecha" : format(date, "dd MMM yyyy", { locale: es })
  }

  const handleCall = async () => {
    if (!presupuesto.telefono) return
    try {
      await Linking.openURL(`tel:${presupuesto.telefono}`)
    } catch {
      showCustomAlert("No se pudo iniciar la llamada", "Revisá que el teléfono esté disponible en este dispositivo.")
    }
  }

  const handleWhatsApp = async () => {
    const phone = String(presupuesto.telefono || "").replace(/\D/g, "")
    if (!phone) return
    try {
      await Linking.openURL(`https://wa.me/${phone}`)
    } catch {
      showCustomAlert("WhatsApp no disponible", "No se pudo abrir la conversación en este dispositivo.")
    }
  }

  const getEstadoColor = (estado) => {
    switch (estado) {
      case "Aceptado":
        return "#087F75"
      case "Pendiente":
        return "#A85D0A"
      case "Rechazado":
        return "#748078"
      default:
        return "#A85D0A"
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


  const handleAceptarPresupuesto = () => {
    mostrarModalConversion()
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
    setSelectedDate(new Date())
    setHasSelectedScheduleDate(false)
    setHasSelectedScheduleTime(false)
    setConvertModalVisible(true)
  }

  const onDateValueChange = (event, selectedDate) => {
    setShowDatePicker(false)
    if (selectedDate) {
      setSelectedDate(selectedDate)
      setHasSelectedScheduleDate(true)
    }
  }

  const onTimeValueChange = (event, selectedTime) => {
    setShowTimePicker(false)
    if (selectedTime) {
      const updatedDate = new Date(selectedDate)
      updatedDate.setHours(selectedTime.getHours())
      updatedDate.setMinutes(selectedTime.getMinutes())
      setSelectedDate(updatedDate)
      setHasSelectedScheduleTime(true)
    }
  }

  const convertirATrabajo = async () => {
    if (!hasSelectedScheduleDate || !hasSelectedScheduleTime) return
    const finalDate = new Date(selectedDate)
    setConvertModalVisible(false)

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
  }

  const renderMaterialItem = ({ item, index }) => (
    <View style={styles.materialItem}>
      <View style={styles.materialCopy}>
        <Text style={styles.materialDescription}>{item.descripcion || "Material"}</Text>
        <Text style={styles.materialMeta}>Cant. {item.cantidad || 0} · Unitario ${formatCurrency(item.precio)}</Text>
      </View>
      <View style={styles.materialTrailing}>
        <Text style={styles.materialSubtotal}>${formatCurrency(Number(item.cantidad) * Number(item.precio))}</Text>
        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteMaterial(index)} accessibilityRole="button" accessibilityLabel={`Eliminar ${item.descripcion || "material"}`}>
          <Ionicons name="trash-outline" size={17} color="#A85D0A" />
        </TouchableOpacity>
      </View>
    </View>
  )

  const renderPhotoItem = ({ item }) => (
    <Image source={{ uri: typeof item === "string" ? item : item?.uri }} style={styles.photo} />
  )

  const materiales = Array.isArray(presupuesto.materiales) ? presupuesto.materiales : []
  const totalMateriales = Number(presupuesto.totalMateriales ?? materiales.reduce((sum, item) => sum + Number(item.cantidad || 0) * Number(item.precio || 0), 0)) || 0
  const costoManoDeObra = Number(presupuesto.costoManoDeObra) || 0
  const totalPresupuesto = Number(presupuesto.total ?? totalMateriales + costoManoDeObra) || 0
  const estado = presupuesto.estado || "Pendiente"

  const handleExportPdf = async () => {
    setIsExportingPdf(true)
    try {
      await createAndSharePdf({
        documentType: "PRESUPUESTO",
        title: "Detalle del presupuesto",
        subtitle: "Cotización de trabajo y servicios",
        status: estado,
        client: {
          name: presupuesto.clienteNombre,
          phone: presupuesto.telefono,
          address: presupuesto.direccion,
          description: presupuesto.descripcionTrabajo,
        },
        responsable: {
          name: session?.user?.display_name,
          phone: session?.user?.contact_phone,
        },
        serviceDetails: [
          ["Tipo de trabajo", presupuesto.tipoTrabajo],
          ["Creado", formatSafeDate(presupuesto.fechaCreacion)],
          ["Válido hasta", formatSafeDate(presupuesto.fechaValidez)],
          ["Referencia", presupuesto.id ? String(presupuesto.id) : ""],
        ],
        materials: materiales.map((item) => ({
          descripcion: item.descripcion || "Material",
          cantidad: item.cantidad ?? "—",
          precioUnitario: `$ ${formatCurrency(item.precio)}`,
          subtotal: `$ ${formatCurrency(Number(item.cantidad) * Number(item.precio))}`,
        })),
        costs: {
          materials: `$ ${formatCurrency(totalMateriales)}`,
          labor: `$ ${formatCurrency(costoManoDeObra)}`,
          total: `$ ${formatCurrency(totalPresupuesto)} ARS`,
        },
        photos: presupuesto.photos || [],
      })
    } catch (error) {
      console.error("Error al generar PDF del presupuesto:", error)
      showCustomAlert("No se pudo generar el PDF", "Intentá de nuevo en unos segundos.")
    } finally {
      setIsExportingPdf(false)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Volver a presupuestos">
          <Ionicons name="arrow-back" size={21} color={stylesTheme.ink} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Detalle del presupuesto</Text>
        <TouchableOpacity onPress={handleExportPdf} style={styles.headerSpacer} accessibilityRole="button" accessibilityLabel="Generar PDF del presupuesto" disabled={isExportingPdf}>
          <Ionicons name={isExportingPdf ? "hourglass-outline" : "document-text-outline"} size={19} color={stylesTheme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.statusCard}>
            <View style={styles.statusTopRow}>
              <View style={[styles.statusBadge, { backgroundColor: estado === "Pendiente" ? stylesTheme.amberSoft : estado === "Aceptado" ? stylesTheme.tealSoft : stylesTheme.neutralSoft }]}>
                <Ionicons name={getEstadoIcon(estado)} size={15} color={getEstadoColor(estado)} />
                <Text style={[styles.statusText, { color: getEstadoColor(estado) }]}>{estado}</Text>
              </View>
              {!!presupuesto.id && <Text style={styles.referenceText}>ID {String(presupuesto.id).slice(-8)}</Text>}
            </View>
            <View style={styles.statusDivider} />
            <View style={styles.datesRow}>
              <View style={styles.dateColumn}>
                <Text style={styles.metaLabel}>CREADO</Text>
                <Text style={styles.metaValue}>{formatSafeDate(presupuesto.fechaCreacion)}</Text>
              </View>
              <View style={styles.dateColumn}>
                <Text style={styles.metaLabel}>VÁLIDO HASTA</Text>
                <Text style={styles.metaValue}>{formatSafeDate(presupuesto.fechaValidez)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionIcon}><Ionicons name="person-outline" size={18} color={stylesTheme.primary} /></View>
              <Text style={styles.sectionTitle}>Cliente</Text>
            </View>
            <Text style={styles.clientName}>{presupuesto.clienteNombre || "Cliente"}</Text>
            {!!presupuesto.telefono && (
              <View style={styles.contactRow}>
                <Ionicons name="call-outline" size={16} color={stylesTheme.muted} />
                <Text style={styles.contactValue}>{presupuesto.telefono}</Text>
                <TouchableOpacity style={styles.contactAction} onPress={handleCall} accessibilityLabel="Llamar al cliente"><Ionicons name="call-outline" size={17} color={stylesTheme.primary} /></TouchableOpacity>
                <TouchableOpacity style={[styles.contactAction, styles.whatsAppAction]} onPress={handleWhatsApp} accessibilityLabel="Abrir WhatsApp"><Ionicons name="logo-whatsapp" size={17} color={stylesTheme.primary} /></TouchableOpacity>
              </View>
            )}
            {!!presupuesto.direccion && (
              <View style={styles.contactRow}>
                <Ionicons name="location-outline" size={16} color={stylesTheme.muted} />
                <Text style={styles.contactValue}>{presupuesto.direccion}</Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionIcon}><Ionicons name="construct-outline" size={18} color={stylesTheme.primary} /></View>
              <Text style={styles.sectionTitle}>Alcance del trabajo</Text>
            </View>
            <Text style={styles.workType}>{presupuesto.tipoTrabajo || "Trabajo"}</Text>
            <Text style={styles.description}>{presupuesto.descripcionTrabajo || "Sin descripción del trabajo."}</Text>
          </View>

          <View style={styles.costCard}>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionIcon}><Ionicons name="receipt-outline" size={18} color={stylesTheme.primary} /></View>
              <Text style={styles.sectionTitle}>Resumen del presupuesto</Text>
            </View>
            <View style={styles.costRow}><Text style={styles.costLabel}>Materiales</Text><Text style={styles.costValue}>{"$"}{formatCurrency(totalMateriales)}</Text></View>
            <View style={styles.costRow}><Text style={styles.costLabel}>Mano de obra</Text><Text style={styles.costValue}>{"$"}{formatCurrency(costoManoDeObra)}</Text></View>
            <View style={styles.costDivider} />
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{"$"}{formatCurrency(totalPresupuesto)} <Text style={styles.totalCurrency}>ARS</Text></Text></View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionIcon}><Ionicons name="cube-outline" size={18} color={stylesTheme.primary} /></View>
              <Text style={styles.sectionTitle}>Materiales</Text>
              <TouchableOpacity style={styles.addButton} onPress={() => setShowAddMaterialModal(true)} accessibilityRole="button">
                <Ionicons name="add" size={18} color={stylesTheme.primary} />
                <Text style={styles.addButtonText}>Agregar</Text>
              </TouchableOpacity>
            </View>
            {materiales.length > 0 ? (
              <FlatList data={materiales} renderItem={renderMaterialItem} keyExtractor={(item, index) => String(index)} scrollEnabled={false} />
            ) : (
              <Text style={styles.emptyListText}>No hay materiales registrados.</Text>
            )}
          </View>

          {photos.length > 0 && (
            <View style={styles.card}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionIcon}><Ionicons name="images-outline" size={18} color={stylesTheme.primary} /></View>
                <Text style={styles.sectionTitle}>Fotos del presupuesto</Text>
              </View>
              <FlatList data={photos} renderItem={renderPhotoItem} keyExtractor={(item, index) => String(index)} horizontal showsHorizontalScrollIndicator={false} style={styles.photosList} />
            </View>
          )}
        </View>
      </ScrollView>

      {estado === "Pendiente" && (
        <View style={styles.bottomActions}>
          <TouchableOpacity style={styles.primaryAction} onPress={handleAceptarPresupuesto} activeOpacity={0.85}>
            <Ionicons name="checkmark-circle-outline" size={19} color="#FFFFFF" />
            <Text style={styles.primaryActionText}>Aceptar presupuesto</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectAction} onPress={handleRechazarPresupuesto} activeOpacity={0.75}>
            <Ionicons name="close-circle-outline" size={17} color={stylesTheme.amber} />
            <Text style={styles.rejectActionText}>Rechazar presupuesto</Text>
          </TouchableOpacity>
        </View>
      )}
      {estado === "Aceptado" && (
        <View style={styles.bottomActions}>
          <TouchableOpacity style={styles.primaryAction} onPress={mostrarModalConversion} activeOpacity={0.85}>
            <Ionicons name="calendar-outline" size={19} color="#FFFFFF" />
            <Text style={styles.primaryActionText}>Convertir a trabajo</Text>
          </TouchableOpacity>
          <Text style={styles.bottomHint}>El siguiente paso es programar fecha y hora.</Text>
        </View>
      )}

      <Modal
        visible={convertModalVisible}
        transparent={true}
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setConvertModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Aceptar y programar</Text>
            <Text style={styles.modalSubtitle}>Elegí cuándo se realizará el trabajo. El presupuesto se acepta al confirmar la fecha y la hora.</Text>

            <TouchableOpacity style={styles.schedulePickerButton} onPress={() => setShowDatePicker(true)} accessibilityRole="button">
              <View style={styles.schedulePickerIcon}><Ionicons name="calendar-outline" size={19} color={stylesTheme.primary} /></View>
              <View style={styles.schedulePickerCopy}><Text style={styles.schedulePickerLabel}>Fecha</Text><Text style={styles.schedulePickerValue}>{hasSelectedScheduleDate ? format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es }) : "Seleccionar fecha"}</Text></View>
              <Ionicons name="chevron-forward" size={18} color={stylesTheme.secondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.schedulePickerButton} onPress={() => setShowTimePicker(true)} accessibilityRole="button">
              <View style={styles.schedulePickerIcon}><Ionicons name="time-outline" size={19} color={stylesTheme.primary} /></View>
              <View style={styles.schedulePickerCopy}><Text style={styles.schedulePickerLabel}>Hora</Text><Text style={styles.schedulePickerValue}>{hasSelectedScheduleTime ? format(selectedDate, "HH:mm 'hs'") : "Seleccionar hora"}</Text></View>
              <Ionicons name="chevron-forward" size={18} color={stylesTheme.secondary} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.confirmButton, (!hasSelectedScheduleDate || !hasSelectedScheduleTime) && styles.confirmButtonDisabled]} onPress={convertirATrabajo} disabled={!hasSelectedScheduleDate || !hasSelectedScheduleTime} accessibilityRole="button">
              <Ionicons name="checkmark-circle-outline" size={20} color="white" />
              <Text style={styles.confirmButtonText}>Aceptar presupuesto</Text>
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
          onValueChange={onDateValueChange}
          onDismiss={() => setShowDatePicker(false)}
          minimumDate={new Date()}
        />
      )}

      {showTimePicker && (
        <DateTimePicker value={selectedDate} mode="time" display="default" onValueChange={onTimeValueChange} onDismiss={() => setShowTimePicker(false)} />
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

const stylesTheme = {
  canvas: "#FAF9F6",
  surface: "#FFFFFF",
  ink: "#1A1C1A",
  muted: "#748078",
  line: "#EAE7E1",
  primary: "#00685F",
  tealSoft: "#E7F5F1",
  amber: "#A85D0A",
  amberSoft: "#FFF1D9",
  neutralSoft: "#EEF0ED",
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: stylesTheme.canvas },
  header: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: stylesTheme.line, backgroundColor: stylesTheme.canvas },
  backButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  title: { flex: 1, color: stylesTheme.ink, fontSize: 16, fontWeight: "700", textAlign: "center" },
  headerSpacer: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: stylesTheme.tealSoft },
  scrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20 },
  content: { gap: 12 },
  statusCard: { backgroundColor: stylesTheme.surface, borderRadius: 16, borderWidth: 1, borderColor: stylesTheme.line, padding: 15, marginBottom: 1 },
  statusTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusBadge: { minHeight: 29, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, borderRadius: 15 },
  statusText: { fontSize: 12, fontWeight: "700" },
  referenceText: { color: stylesTheme.muted, fontSize: 11, fontWeight: "600" },
  statusDivider: { height: 1, backgroundColor: stylesTheme.line, marginVertical: 12 },
  datesRow: { flexDirection: "row", gap: 16 },
  dateColumn: { flex: 1 },
  metaLabel: { color: stylesTheme.muted, fontSize: 9, fontWeight: "700", letterSpacing: 0.6, marginBottom: 4 },
  metaValue: { color: stylesTheme.ink, fontSize: 12, fontWeight: "600" },
  card: { backgroundColor: stylesTheme.surface, borderRadius: 16, borderWidth: 1, borderColor: stylesTheme.line, padding: 15 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 11 },
  sectionIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: stylesTheme.tealSoft },
  sectionTitle: { flex: 1, color: stylesTheme.ink, fontSize: 14, fontWeight: "700" },
  clientName: { color: stylesTheme.ink, fontSize: 17, fontWeight: "800", marginBottom: 7 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  contactValue: { flex: 1, color: stylesTheme.muted, fontSize: 12, lineHeight: 18 },
  contactAction: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: stylesTheme.line, backgroundColor: stylesTheme.surface },
  whatsAppAction: { backgroundColor: stylesTheme.tealSoft, borderColor: "#BCE5DE" },
  workType: { color: stylesTheme.primary, fontSize: 12, fontWeight: "700", marginBottom: 5 },
  description: { color: stylesTheme.ink, fontSize: 13, lineHeight: 20 },
  costCard: { backgroundColor: "#FFFCF7", borderRadius: 16, borderWidth: 1, borderColor: "#F1D7B1", padding: 15 },
  costRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  costLabel: { color: stylesTheme.muted, fontSize: 12 },
  costValue: { color: stylesTheme.ink, fontSize: 13, fontWeight: "600" },
  costDivider: { height: 1, backgroundColor: "#F1D7B1", marginVertical: 7 },
  totalRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  totalLabel: { color: stylesTheme.ink, fontSize: 14, fontWeight: "700" },
  totalValue: { color: stylesTheme.primary, fontSize: 23, fontWeight: "800" },
  totalCurrency: { color: stylesTheme.muted, fontSize: 11, fontWeight: "600" },
  addButton: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 8, borderRadius: 8, backgroundColor: stylesTheme.tealSoft },
  addButtonText: { color: stylesTheme.primary, fontSize: 11, fontWeight: "700" },
  materialItem: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#F0EFEB" },
  materialCopy: { flex: 1 },
  materialDescription: { color: stylesTheme.ink, fontSize: 12, fontWeight: "700" },
  materialMeta: { color: stylesTheme.muted, fontSize: 10, marginTop: 4 },
  materialTrailing: { flexDirection: "row", alignItems: "center", gap: 3 },
  materialSubtotal: { color: stylesTheme.ink, fontSize: 12, fontWeight: "700" },
  deleteButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  emptyListText: { color: stylesTheme.muted, fontSize: 12, lineHeight: 18, paddingVertical: 8 },
  photosList: { marginTop: 2 },
  photo: { width: 112, height: 112, borderRadius: 12, marginRight: 10, backgroundColor: stylesTheme.neutralSoft },
  bottomActions: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 7, borderTopWidth: 1, borderTopColor: stylesTheme.line, backgroundColor: "rgba(250,249,246,0.98)" },
  primaryAction: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, backgroundColor: stylesTheme.primary },
  primaryActionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  rejectAction: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 2 },
  rejectActionText: { color: stylesTheme.amber, fontSize: 12, fontWeight: "700" },
  bottomHint: { color: stylesTheme.muted, fontSize: 10, textAlign: "center", marginTop: 7 },
  modalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(15,23,42,0.45)", padding: 20 },
  modalContent: { width: "100%", maxWidth: 420, backgroundColor: stylesTheme.surface, borderRadius: 18, padding: 22, alignItems: "stretch" },
  addMaterialModalContent: { width: "100%", maxWidth: 420, backgroundColor: stylesTheme.surface, borderRadius: 18, padding: 22 },
  modalTitle: { color: stylesTheme.ink, fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 9 },
  modalSubtitle: { color: stylesTheme.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: 18 },
  schedulePickerButton: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 11, borderWidth: 1, borderColor: stylesTheme.line, borderRadius: 12, backgroundColor: stylesTheme.canvas, marginBottom: 9 },
  schedulePickerIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: stylesTheme.tealSoft },
  schedulePickerCopy: { flex: 1 },
  schedulePickerLabel: { color: stylesTheme.muted, fontSize: 10, fontWeight: "700", marginBottom: 3 },
  schedulePickerValue: { color: stylesTheme.ink, fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  confirmButton: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: stylesTheme.primary, borderRadius: 9, marginBottom: 8 },
  confirmButtonDisabled: { opacity: 0.45 },
  confirmButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  cancelButton: { minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: stylesTheme.neutralSoft },
  cancelButtonText: { color: stylesTheme.ink, fontSize: 13, fontWeight: "600" },
  input: { minHeight: 46, backgroundColor: stylesTheme.canvas, borderRadius: 9, paddingHorizontal: 12, marginBottom: 11, fontSize: 13, borderWidth: 1, borderColor: stylesTheme.line, color: stylesTheme.ink },
  addButtonModal: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: stylesTheme.primary, borderRadius: 9, marginTop: 3, marginBottom: 8 },
  addButtonModalText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  alertOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "center", alignItems: "center", padding: 20 },
  alertBox: { width: "100%", maxWidth: 400, backgroundColor: stylesTheme.surface, borderRadius: 16, padding: 21 },
  alertTitle: { fontSize: 18, fontWeight: "700", color: stylesTheme.ink, marginBottom: 8, textAlign: "center" },
  alertMessage: { fontSize: 14, lineHeight: 21, color: stylesTheme.muted, marginBottom: 20, textAlign: "center" },
  alertButtons: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  alertButton: { flex: 1, minHeight: 44, paddingVertical: 12, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  alertCancelButton: { backgroundColor: stylesTheme.neutralSoft },
  alertConfirmButton: { backgroundColor: stylesTheme.primary },
  alertDestructiveButton: { backgroundColor: stylesTheme.amber },
  alertCancelText: { fontSize: 13, fontWeight: "600", color: stylesTheme.ink },
  alertConfirmText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
})
export default BudgetDetailScreen;
