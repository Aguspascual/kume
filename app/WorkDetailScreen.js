"use client"

import { useEffect, useState } from "react"
import {
  ScrollView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  Dimensions,
  Platform,
  TextInput,
  Linking,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Image } from "expo-image"
import { useRouter, useLocalSearchParams } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import AsyncStorage from "../lib/backendStorage"
import * as FileSystem from "expo-file-system/legacy"
import * as ImagePicker from "expo-image-picker"
import DateTimePicker from "@react-native-community/datetimepicker"
import { getOfficialUsdQuote } from "../lib/officialExchangeRate"
import { createAndSharePdf } from "../lib/sharePdf"
import { useAuth } from "../lib/auth"

const parseCurrencyAmount = (amount) => {
  if (typeof amount === "number") return amount
  return Number(String(amount ?? "").replace(/\D/g, "")) || 0
}

const WorkDetailScreen = () => {
  const router = useRouter()
  const { session } = useAuth()
  const { trabajo: trabajoJSON } = useLocalSearchParams()
  const [trabajo, setTrabajo] = useState(() => {
    const initialWork = JSON.parse(trabajoJSON)
    return {
      ...initialWork,
      materiales: Array.isArray(initialWork.materiales) ? initialWork.materiales.filter((item) => item && typeof item === "object") : [],
    }
  })
  const [photoUris, setPhotoUris] = useState([])
  const [modalVisible, setModalVisible] = useState(false)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [newDate, setNewDate] = useState(new Date())
  const [reprogramModalVisible, setReprogramModalVisible] = useState(false)
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false)
  const [showEditPriceModal, setShowEditPriceModal] = useState(false)
  const [showPhotoSourceModal, setShowPhotoSourceModal] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [isEditingAddress, setIsEditingAddress] = useState(false) // NUEVO: Estado para controlar la edición del domicilio
  const [editedAddress, setEditedAddress] = useState(trabajo.domicilio) // NUEVO: Estado para el domicilio editable
  const [newMaterial, setNewMaterial] = useState({
    descripcion: "",
    cantidad: "",
    precio: "",
  })
  const [newWorkPrice, setNewWorkPrice] = useState(parseCurrencyAmount(trabajo.costoManoDeObra).toString())

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    onConfirm: () => {},
    onCancel: null,
    confirmText: "Aceptar",
    cancelText: null,
    destructive: false,
  })

  const showCustomAlert = (title, message, options = {}) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: options.onConfirm || (() => setAlertConfig((prev) => ({ ...prev, visible: false }))),
      onCancel: options.onCancel || null,
      confirmText: options.confirmText || "Aceptar",
      cancelText: options.cancelText || null,
      destructive: options.destructive || false,
    })
  }

  const hideCustomAlert = () => {
    setAlertConfig((prev) => ({ ...prev, visible: false }))
  }

  const formatCurrency = (amount) => Math.round(parseCurrencyAmount(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  const openEditPriceModal = () => {
    setNewWorkPrice(formatCurrency(trabajo.costoManoDeObra))
    setShowEditPriceModal(true)
  }

  // Calcula el costo total basado en los materiales y la mano de obra del objeto de trabajo
  const costoTotal = parseCurrencyAmount(trabajo.costoMateriales) + parseCurrencyAmount(trabajo.costoManoDeObra)

  // NUEVO: Función para buscar y auto-completar el domicilio
  const fetchClientAddress = async () => {
    try {
      const clientesJSON = await AsyncStorage.getItem("clientes")
      if (clientesJSON) {
        const clientes = JSON.parse(clientesJSON)
        const clienteEncontrado = clientes.find((client) => client.id === trabajo.clienteId) ||
          clientes.find((client) => `${client.nombre} ${client.apellido}`.trim() === trabajo.clienteNombre) ||
          clientes.find((client) => client.nombre === trabajo.clienteNombre)
        if (clienteEncontrado && clienteEncontrado.domicilio) {
          const trabajoActualizado = { ...trabajo, domicilio: clienteEncontrado.domicilio }
          setTrabajo(trabajoActualizado)
          setEditedAddress(clienteEncontrado.domicilio)
          // Opcional: guardar el domicilio actualizado en AsyncStorage
          const trabajosJSON = await AsyncStorage.getItem("trabajos")
          const trabajos = trabajosJSON ? JSON.parse(trabajosJSON) : []
          const trabajosGuardados = trabajos.map((t) => (t.id === trabajo.id ? trabajoActualizado : t))
          await AsyncStorage.setItem("trabajos", JSON.stringify(trabajosGuardados))
        }
      }
    } catch (error) {
      console.error("Error al buscar el domicilio del cliente:", error)
    }
  }

  const checkPhotos = async () => {
    if (trabajo.photos && trabajo.photos.length > 0) {
      const validPhotos = []
      for (const photoUri of trabajo.photos) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(photoUri)
          if (fileInfo.exists) {
            validPhotos.push(photoUri)
          } else {
            console.log("Foto no encontrada:", photoUri)
          }
        } catch (error) {
          console.log("Error verificando foto:", photoUri, error)
        }
      }
      setPhotoUris(validPhotos)
    }
  }

  useEffect(() => {
    console.log("Fotos del trabajo:", trabajo.photos)
    // checkPhotos updates photo state after the file system checks resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkPhotos()
    if (!trabajo.domicilio?.trim()) {
      fetchClientAddress()
    }
  }, [])

  const getEstadoPagoColor = (estado) => {
    switch (estado) {
      case "Pagado":
        return "#087F75"
      case "Terminado, falta pago":
      case "Pendiente":
        return "#A85D0A"
      case "Cancelado":
        return "#748078"
      default:
        return "#596578"
    }
  }

  const getEstadoPagoIcon = (estado) => {
    switch (estado) {
      case "Pagado":
        return "checkmark-circle"
      case "Terminado, falta pago":
      case "Pendiente":
        return "time"
      case "Cancelado":
        return "close-circle"
      default:
        return "time"
    }
  }

  const cambiarEstadoPago = async (nuevoEstado) => {
    try {
      const trabajosJSON = await AsyncStorage.getItem("trabajos")
      const trabajos = trabajosJSON ? JSON.parse(trabajosJSON) : []
      let trabajoActualizado
      let datosPago
      if (nuevoEstado === "Pagado") {
        const fechaPago = new Date()
        const cotizacion = await getOfficialUsdQuote(fechaPago)
        const montoPagoARS = parseCurrencyAmount(trabajo.costoMateriales) + parseCurrencyAmount(trabajo.costoManoDeObra)
        datosPago = {
          fechaPago: fechaPago.toISOString(),
          montoPagoARS,
          cotizacionUSD: cotizacion.rate,
          montoPagoUSD: Number((montoPagoARS / cotizacion.rate).toFixed(2)),
          fechaCotizacionUSD: cotizacion.quoteDate,
          fuenteCotizacionUSD: cotizacion.source,
          cotizacionUSDEnCache: Boolean(cotizacion.cached),
        }
      }

      const trabajosActualizados = trabajos.map((t) => {
        if (t.id !== trabajo.id) return t
        trabajoActualizado = { ...t, estadoPago: nuevoEstado, ...(datosPago || {}) }
        return trabajoActualizado
      })
      if (!trabajoActualizado) throw new Error("No se encontró el trabajo para actualizar.")

      await AsyncStorage.setItem("trabajos", JSON.stringify(trabajosActualizados))
      setTrabajo(trabajoActualizado)
      if (nuevoEstado === "Pagado") {
        showCustomAlert(`Pago registrado de $${formatCurrency(datosPago.montoPagoARS)}`, "")
      } else {
        showCustomAlert("Éxito", `Estado de pago cambiado a "${nuevoEstado}"`)
      }
    } catch (error) {
      console.error("Error al cambiar estado de pago:", error)
      if (nuevoEstado === "Pagado") {
        showCustomAlert("No se pudo registrar el pago", "No pudimos consultar una cotización oficial del dólar en el BCRA. El trabajo sigue pendiente; conectate a internet e intentá de nuevo.")
      } else {
        showCustomAlert("Error", "No se pudo cambiar el estado de pago.")
      }
    }
  }

  const handleMarcarPagado = () => {
    showCustomAlert(
      "Confirmar Pago",
      "¿Estás seguro que deseas marcar este trabajo como pagado?",
      {
        cancelText: "Cancelar",
        confirmText: "Marcar como Pagado",
        onCancel: hideCustomAlert,
        onConfirm: () => {
          hideCustomAlert()
          cambiarEstadoPago("Pagado")
        }
      }
    )
  }

  const handleTerminarTrabajo = () => {
    showCustomAlert(
      "Trabajo Terminado",
      "¿El trabajo ya fue abonado por el cliente?",
      {
        cancelText: "No, quedó pendiente",
        confirmText: "Sí, cobrado",
        onCancel: () => {
          hideCustomAlert()
          cambiarEstadoPago("Terminado, falta pago")
        },
        onConfirm: () => {
          hideCustomAlert()
          cambiarEstadoPago("Pagado")
        }
      }
    )
  }

  const handleMarcarCancelado = () => {
    showCustomAlert(
      "Confirmar Cancelado",
      "¿Estás seguro que deseas marcar este trabajo como cancelado?",
      {
        cancelText: "Volver",
        confirmText: "Cancelar Trabajo",
        destructive: true,
        onCancel: hideCustomAlert,
        onConfirm: () => {
          hideCustomAlert()
          cambiarEstadoPago("Cancelado")
          setReprogramModalVisible(true)
        }
      }
    )
  }

  const handleReprogramar = () => {
    setReprogramModalVisible(false)
    setNewDate(new Date(trabajo.fecha))
    setShowDatePicker(true)
  }

  const handleEliminarTrabajo = () => {
    setReprogramModalVisible(false)
    showCustomAlert("Eliminar trabajo", "¿Querés eliminar este trabajo? Esta acción no se puede deshacer.", {
      cancelText: "Volver",
      confirmText: "Eliminar",
      destructive: true,
      onCancel: hideCustomAlert,
      onConfirm: eliminarTrabajoConfirmado,
    })
  }

  const eliminarTrabajoConfirmado = async () => {
    hideCustomAlert()
    try {
      const trabajosJSON = await AsyncStorage.getItem("trabajos")
      const trabajos = trabajosJSON ? JSON.parse(trabajosJSON) : []
      const trabajosActualizados = trabajos.filter((t) => t.id !== trabajo.id)

      await AsyncStorage.setItem("trabajos", JSON.stringify(trabajosActualizados))
      showCustomAlert("Trabajo eliminado", "El trabajo ha sido eliminado correctamente.", {
        confirmText: "OK",
        onConfirm: () => {
          hideCustomAlert()
          router.back()
        }
      })
    } catch (error) {
      console.error("Error al eliminar trabajo:", error)
      showCustomAlert("Error", "No se pudo eliminar el trabajo")
    }
  }

  const handleExportPdf = async () => {
    setIsExportingPdf(true)
    try {
      const materials = Array.isArray(trabajo.materiales) ? trabajo.materiales : []
      await createAndSharePdf({
        documentType: "ORDEN DE TRABAJO",
        title: "Detalle del trabajo",
        subtitle: "Comprobante de servicio realizado",
        status: trabajo.estadoPago || "Pendiente",
        client: {
          name: trabajo.clienteNombre,
          phone: trabajo.telefono,
          address: trabajo.domicilio,
        },
        responsable: {
          name: session?.user?.display_name,
          phone: session?.user?.contact_phone,
        },
        serviceDetails: [
          ["Tipo de trabajo", trabajo.tipoTrabajo],
          ["Fecha y hora", trabajo.fecha ? format(new Date(trabajo.fecha), "dd/MM/yyyy · HH:mm", { locale: es }) : ""],
          ["Descripción", trabajo.trabajo],
        ],
        materials: materials.map((item) => ({
          descripcion: item.descripcion || "Material",
          cantidad: item.cantidad ?? "—",
          precioUnitario: `$ ${formatCurrency(item.precio)}`,
          subtotal: `$ ${formatCurrency(Number(item.cantidad) * parseCurrencyAmount(item.precio))}`,
        })),
        costs: {
          materials: `$ ${formatCurrency(trabajo.costoMateriales)}`,
          labor: `$ ${formatCurrency(trabajo.costoManoDeObra)}`,
          total: `$ ${formatCurrency(parseCurrencyAmount(trabajo.costoMateriales) + parseCurrencyAmount(trabajo.costoManoDeObra))} ARS`,
        },
        photos: photoUris.length ? photoUris : (trabajo.photos || []),
      })
    } catch (error) {
      console.error("Error al generar el PDF del trabajo:", error)
      showCustomAlert("No se pudo generar el PDF", "Intentá de nuevo en unos segundos.")
    } finally {
      setIsExportingPdf(false)
    }
  }

  const onDateValueChange = (event, selectedDate) => {
    setShowDatePicker(false)
    if (selectedDate) {
      setNewDate(selectedDate)
      setShowTimePicker(true)
    }
  }

  const onTimeValueChange = async (event, selectedTime) => {
    setShowTimePicker(false)
    if (selectedTime) {
      const updatedDate = new Date(newDate)
      updatedDate.setHours(selectedTime.getHours())
      updatedDate.setMinutes(selectedTime.getMinutes())

      try {
        const trabajosJSON = await AsyncStorage.getItem("trabajos")
        const trabajos = trabajosJSON ? JSON.parse(trabajosJSON) : []

        const trabajosActualizados = trabajos.map((t) =>
          t.id === trabajo.id ? { ...t, fecha: updatedDate.toISOString(), estadoPago: "Pendiente" } : t,
        )

        await AsyncStorage.setItem("trabajos", JSON.stringify(trabajosActualizados))
        setTrabajo({ ...trabajo, fecha: updatedDate.toISOString(), estadoPago: "Pendiente" })
        showCustomAlert(
          "Trabajo reprogramado",
          `El trabajo ha sido reprogramado para el ${format(updatedDate, "dd/MM/yyyy 'a las' HH:mm", { locale: es })}`
        )
      } catch (error) {
        console.error("Error al reprogramar trabajo:", error)
        showCustomAlert("Error", "No se pudo reprogramar el trabajo")
      }
    }
  }

  const openPhotoModal = (index) => {
    setSelectedPhotoIndex(index)
    setModalVisible(true)
  }

  const navigatePhoto = (direction) => {
    if (direction === "next" && selectedPhotoIndex < photoUris.length - 1) {
      setSelectedPhotoIndex(selectedPhotoIndex + 1)
    } else if (direction === "prev" && selectedPhotoIndex > 0) {
      setSelectedPhotoIndex(selectedPhotoIndex - 1)
    }
  }

  const handleAddMaterial = async () => {
    const rawCantidad = newMaterial.cantidad.replace(/\./g, "")
    const rawPrecio = newMaterial.precio.replace(/\./g, "")

    if (!newMaterial.descripcion || !rawCantidad || !rawPrecio) {
      showCustomAlert("Error", "Por favor, completa todos los campos del material.")
      return
    }

    const materialToAdd = {
      descripcion: newMaterial.descripcion,
      cantidad: Number(rawCantidad),
      precio: Number(rawPrecio),
    }

    const nuevosMateriales = [...(trabajo.materiales || []), materialToAdd]

    // Recalcular el costo de materiales
    const nuevoCostoMateriales = nuevosMateriales.reduce(
      (sum, item) => sum + Number(item.cantidad) * parseCurrencyAmount(item.precio),
      0,
    )

    const trabajoActualizado = {
      ...trabajo,
      materiales: nuevosMateriales,
      costoMateriales: nuevoCostoMateriales,
      costoTotal: nuevoCostoMateriales + parseCurrencyAmount(trabajo.costoManoDeObra),
    }

    // Actualizar el estado local
    setTrabajo(trabajoActualizado)
    // Cerrar el modal y resetear los campos
    setShowAddMaterialModal(false)
    setNewMaterial({ descripcion: "", cantidad: "", precio: "" })

    try {
      // Guardar el trabajo actualizado en AsyncStorage
      const trabajosJSON = await AsyncStorage.getItem("trabajos")
      const trabajos = trabajosJSON ? JSON.parse(trabajosJSON) : []
      const trabajosGuardados = trabajos.map((t) => (t.id === trabajo.id ? trabajoActualizado : t))
      await AsyncStorage.setItem("trabajos", JSON.stringify(trabajosGuardados))
      showCustomAlert("Éxito", "Material agregado correctamente y costos actualizados.")
    } catch (error) {
      console.error("Error al agregar material:", error)
      showCustomAlert("Error", "No se pudo agregar el material.")
    }
  }

  const handleDeleteMaterial = async (indexToDelete) => {
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
          const nuevosMateriales = trabajo.materiales.filter((_, index) => index !== indexToDelete)

          const nuevoCostoMateriales = nuevosMateriales.reduce(
            (sum, item) => sum + Number(item.cantidad) * parseCurrencyAmount(item.precio),
            0,
          )

          const trabajoActualizado = {
            ...trabajo,
            materiales: nuevosMateriales,
            costoMateriales: nuevoCostoMateriales,
            costoTotal: nuevoCostoMateriales + parseCurrencyAmount(trabajo.costoManoDeObra),
          }

          setTrabajo(trabajoActualizado)

          try {
            const trabajosJSON = await AsyncStorage.getItem("trabajos")
            const trabajos = trabajosJSON ? JSON.parse(trabajosJSON) : []
            const trabajosGuardados = trabajos.map((t) => (t.id === trabajo.id ? trabajoActualizado : t))
            await AsyncStorage.setItem("trabajos", JSON.stringify(trabajosGuardados))
            showCustomAlert("Éxito", "Material eliminado correctamente y costos actualizados.")
          } catch (error) {
            console.error("Error al eliminar material y actualizar el trabajo:", error)
            showCustomAlert("Error", "No se pudo eliminar el material.")
          }
        }
      }
    )
  }

  // NUEVO: Función para guardar el domicilio editado
  const handleSaveAddress = async () => {
    try {
      const trabajosJSON = await AsyncStorage.getItem("trabajos")
      const trabajos = trabajosJSON ? JSON.parse(trabajosJSON) : []
      const trabajoActualizado = { ...trabajo, domicilio: editedAddress }
      const trabajosGuardados = trabajos.map((t) => (t.id === trabajo.id ? trabajoActualizado : t))
      await AsyncStorage.setItem("trabajos", JSON.stringify(trabajosGuardados))
      setTrabajo(trabajoActualizado)
      setIsEditingAddress(false)
      showCustomAlert("Éxito", "Domicilio actualizado correctamente.")
    } catch (error) {
      console.error("Error al actualizar el domicilio:", error)
      showCustomAlert("Error", "No se pudo actualizar el domicilio.")
    }
  }

  const handleToggleAddressEdit = async () => {
    if (isEditingAddress) {
      await handleSaveAddress()
      return
    }
    setEditedAddress(trabajo.domicilio || "")
    setIsEditingAddress(true)
  }

  const savePhotoToWork = async (sourceUri) => {
    try {
      const fileName = `${trabajo.id || "trabajo"}_${Date.now()}_${sourceUri.split("/").pop()}`
      const photosDirectory = `${FileSystem.documentDirectory}photos/`
      const savedUri = `${photosDirectory}${fileName}`
      await FileSystem.makeDirectoryAsync(photosDirectory, { intermediates: true })
      await FileSystem.copyAsync({ from: sourceUri, to: savedUri })

      const updatedWork = { ...trabajo, photos: [...(trabajo.photos || []), savedUri] }
      const worksJson = await AsyncStorage.getItem("trabajos")
      const works = worksJson ? JSON.parse(worksJson) : []
      await AsyncStorage.setItem("trabajos", JSON.stringify(works.map((item) => item.id === trabajo.id ? updatedWork : item)))
      setTrabajo(updatedWork)
      setPhotoUris((currentUris) => [...currentUris, savedUri])
    } catch (error) {
      console.error("Error al agregar foto al trabajo:", error)
      showCustomAlert("Error", "No se pudo agregar la foto al trabajo.")
    }
  }

  const handleAddPhoto = () => setShowPhotoSourceModal(true)

  const handleChoosePhotoSource = (source) => {
    setShowPhotoSourceModal(false)
    setTimeout(async () => {
      try {
        const isCamera = source === "camera"
        const permission = isCamera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (permission.status !== "granted") {
          showCustomAlert("Permiso denegado", isCamera ? "Necesitamos permiso para usar la cámara." : "Necesitamos permiso para acceder a tus fotos.")
          return
        }

        const result = isCamera
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75 })
        if (!result.canceled && result.assets?.[0]?.uri) await savePhotoToWork(result.assets[0].uri)
      } catch (error) {
        console.error("Error al seleccionar foto del trabajo:", error)
        showCustomAlert("Error", "No se pudo abrir la cámara o la galería.")
      }
    }, 300)
  }

  // NUEVO: Función para llamar al número de teléfono
  const handleCall = () => {
    if (trabajo.telefono) {
      Linking.openURL(`tel:${trabajo.telefono}`)
    }
  }

  // NUEVO: Función para abrir WhatsApp
  const handleWhatsApp = () => {
    if (trabajo.telefono) {
      const whatsappURL = `whatsapp://send?phone=${trabajo.telefono}`
      Linking.canOpenURL(whatsappURL).then((supported) => {
        if (supported) {
          Linking.openURL(whatsappURL)
        } else {
          showCustomAlert("Error", "WhatsApp no está instalado en este dispositivo.")
        }
      })
    }
  }

  const handleUpdateWorkPrice = async () => {
    const rawPrice = newWorkPrice.replace(/\./g, "")
    if (rawPrice === "" || isNaN(Number(rawPrice))) {
      showCustomAlert("Error", "Por favor, ingrese un precio válido.")
      return
    }
    const costoManoDeObraActualizado = Number(rawPrice)

    const trabajoActualizado = {
      ...trabajo,
      costoManoDeObra: costoManoDeObraActualizado,
      costoTotal: parseCurrencyAmount(trabajo.costoMateriales) + costoManoDeObraActualizado,
    }

    setTrabajo(trabajoActualizado)
    setShowEditPriceModal(false)

    try {
      const trabajosJSON = await AsyncStorage.getItem("trabajos")
      const trabajos = trabajosJSON ? JSON.parse(trabajosJSON) : []
      const trabajosGuardados = trabajos.map((t) => (t.id === trabajo.id ? trabajoActualizado : t))
      await AsyncStorage.setItem("trabajos", JSON.stringify(trabajosGuardados))
      showCustomAlert("Éxito", "Precio del trabajo actualizado correctamente.")
    } catch (error) {
      console.error("Error al actualizar el precio del trabajo:", error)
      showCustomAlert("Error", "No se pudo actualizar el precio del trabajo.")
    }
  }

  const renderPhotoItem = ({ item, index }) => (
    <TouchableOpacity key={`${item}-${index}`} style={styles.photoPreviewContainer} onPress={() => openPhotoModal(index)} activeOpacity={0.8}>
      <Image
        source={{ uri: item }}
        style={styles.photoPreview}
        onError={(error) => console.log("Error al cargar la imagen:", error)}
      />
      <View style={styles.photoOverlay}>
        <Ionicons name="expand-outline" size={24} color="white" />
      </View>
    </TouchableOpacity>
  )

  const renderMaterialItem = ({ item, index }) => (
    <View style={styles.materialItem}>
      <View style={styles.materialCopy}>
        <Text style={styles.materialDescription} numberOfLines={2}>{String(item?.descripcion || "Material")}</Text>
        <Text style={styles.materialQuantity}>Cant. {String(item?.cantidad ?? "—")} · Unitario: ${formatCurrency(item?.precio)}</Text>
      </View>
      <Text style={styles.materialSubtotal}>${formatCurrency(Number(item?.cantidad) * parseCurrencyAmount(item?.precio))}</Text>
      <TouchableOpacity style={styles.deleteMaterialButton} onPress={() => handleDeleteMaterial(index)} accessibilityLabel={`Eliminar ${item?.descripcion || "material"}`}>
        <Ionicons name="trash-outline" size={17} color="#9AA7A1" />
      </TouchableOpacity>
    </View>
  )

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={21} color="#1A1C1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalle del trabajo</Text>
        <TouchableOpacity onPress={handleExportPdf} style={styles.moreButton} accessibilityRole="button" accessibilityLabel="Generar PDF del trabajo" disabled={isExportingPdf}>
          <Ionicons name={isExportingPdf ? "hourglass-outline" : "document-text-outline"} size={19} color="#087F75" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setReprogramModalVisible(true)} style={styles.moreButton} accessibilityLabel="Más acciones">
          <Ionicons name="ellipsis-horizontal" size={21} color="#3D4947" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <Text style={styles.workTypeBadge}>{(trabajo.tipoTrabajo || "TRABAJO").toLocaleUpperCase("es-AR")}</Text>
            <View style={[styles.paymentBadge, { backgroundColor: `${getEstadoPagoColor(trabajo.estadoPago)}18` }]}>
              <Ionicons name={getEstadoPagoIcon(trabajo.estadoPago)} size={14} color={getEstadoPagoColor(trabajo.estadoPago)} />
              <Text style={[styles.paymentBadgeText, { color: getEstadoPagoColor(trabajo.estadoPago) }]}>{trabajo.estadoPago || "Pendiente"}</Text>
            </View>
          </View>
          <Text style={styles.workTitle}>{trabajo.trabajo || trabajo.tipoTrabajo || "Trabajo programado"}</Text>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryMetaRow}>
            <Ionicons name="business-outline" size={18} color="#087F75" />
            <Text style={styles.summaryMetaText} numberOfLines={1}>{trabajo.clienteNombre || "Cliente"}</Text>
          </View>
          <View style={styles.summaryMetaRow}>
            <Ionicons name="time-outline" size={18} color="#087F75" />
            <Text style={styles.summaryMetaText}>{format(new Date(trabajo.fecha), "EEEE d MMM · HH:mm 'hs'", { locale: es })}</Text>
          </View>
          <View style={styles.summaryMetaRow}>
            <Ionicons name="construct-outline" size={18} color="#087F75" />
            <Text style={styles.summaryProgressText}>{trabajo.estadoPago === "Pagado" ? "Trabajo cobrado" : trabajo.estadoPago === "Cancelado" ? "Trabajo cancelado" : "Trabajo programado"}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <View style={styles.cardTitleGroup}><Ionicons name="person-circle-outline" size={21} color="#00685F" /><Text style={styles.cardTitle}>Cliente y ubicación</Text></View>
            <TouchableOpacity onPress={handleToggleAddressEdit} style={[styles.iconButton, isEditingAddress && styles.iconButtonActive]} accessibilityRole="button" accessibilityLabel={isEditingAddress ? "Guardar dirección" : "Editar dirección"}>
              <Ionicons name={isEditingAddress ? "checkmark" : "create-outline"} size={18} color={isEditingAddress ? "#FFFFFF" : "#087F75"} />
            </TouchableOpacity>
          </View>
          <View style={styles.clientDetailsBox}>
            <Text style={styles.detailLabel}>CLIENTE</Text>
            <Text style={styles.clientValue}>{trabajo.clienteNombre || "Cliente"}</Text>
            <Text style={styles.detailLabel}>TELÉFONO</Text>
            <Text style={styles.clientValue}>{trabajo.telefono || "Sin teléfono registrado"}</Text>
            <Text style={styles.detailLabel}>DIRECCIÓN DE OBRA</Text>
            {isEditingAddress ? (
              <TextInput style={styles.addressInput} value={editedAddress} onChangeText={setEditedAddress} placeholder="Ingresá la dirección del trabajo" placeholderTextColor="#89968F" multiline />
            ) : (
              <Text style={styles.clientValue}>{trabajo.domicilio || "Sin dirección registrada"}</Text>
            )}
          </View>
          <View style={styles.contactActions}>
            <TouchableOpacity onPress={handleCall} style={styles.contactAction}>
              <Ionicons name="call-outline" size={18} color="#00685F" /><Text style={styles.contactActionText}>Llamar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleWhatsApp} style={styles.contactAction}>
              <Ionicons name="logo-whatsapp" size={18} color="#087F75" /><Text style={styles.contactActionText}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <View style={styles.cardTitleGroup}><Ionicons name="calendar-outline" size={20} color="#00685F" /><Text style={styles.cardTitle}>Fecha y horario</Text></View>
          </View>
          <View style={styles.scheduleDetails}>
            <Ionicons name="calendar-outline" size={19} color="#596578" />
            <View style={styles.scheduleCopy}>
              <Text style={styles.scheduleDate}>{format(new Date(trabajo.fecha), "EEEE d 'de' MMMM", { locale: es })}</Text>
              <Text style={styles.scheduleTime}>{format(new Date(trabajo.fecha), "HH:mm 'hs'", { locale: es })}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.rescheduleButton} onPress={handleReprogramar}>
            <Ionicons name="calendar-clear-outline" size={17} color="#596578" /><Text style={styles.rescheduleButtonText}>Reprogramar cita</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <View style={styles.cardTitleGroup}><Ionicons name="file-tray-stacked-outline" size={20} color="#00685F" /><Text style={styles.cardTitle}>Materiales e insumos ({trabajo.materiales?.length || 0})</Text></View>
            <TouchableOpacity style={styles.inlineAddButton} onPress={() => setShowAddMaterialModal(true)}><Ionicons name="add" size={18} color="#00685F" /><Text style={styles.inlineAddText}>Agregar</Text></TouchableOpacity>
          </View>
          {trabajo.materiales?.length ? (
            <FlatList data={trabajo.materiales} renderItem={renderMaterialItem} keyExtractor={(_, index) => `material-${index}`} scrollEnabled={false} />
          ) : (
            <View style={styles.emptyMaterials}><Text style={styles.emptyText}>Todavía no hay materiales agregados.</Text><TouchableOpacity onPress={() => setShowAddMaterialModal(true)}><Text style={styles.inlineAddText}>Agregar el primero</Text></TouchableOpacity></View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}><View style={styles.cardTitleGroup}><Ionicons name="receipt-outline" size={20} color="#00685F" /><Text style={styles.cardTitle}>Resumen de costos</Text></View></View>
          <View style={styles.costRow}><Text style={styles.costLabel}>Materiales</Text><Text style={styles.costValue}>${formatCurrency(trabajo.costoMateriales)}</Text></View>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Mano de obra</Text>
            <View style={styles.costValueGroup}>
              <TouchableOpacity onPress={openEditPriceModal} style={styles.editPriceButton} accessibilityRole="button" accessibilityLabel="Editar mano de obra"><Ionicons name="pencil" size={14} color="#087F75" /></TouchableOpacity>
              <Text style={styles.costValue}>${formatCurrency(trabajo.costoManoDeObra)}</Text>
            </View>
          </View>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>TOTAL ESTIMADO</Text><View style={styles.totalAmountGroup}><Text style={styles.totalValue}>${formatCurrency(costoTotal)}</Text><Text style={styles.currencyLabel}>ARS</Text></View></View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <View style={styles.cardTitleGroup}><Ionicons name="camera-outline" size={20} color="#00685F" /><Text style={styles.cardTitle}>Fotos de obra y taller ({photoUris.length})</Text></View>
            <Text style={styles.photoSectionNote}>Inspección técnica</Text>
          </View>
          {photoUris.length ? (
            <View style={styles.photoGrid}>{photoUris.map((uri, index) => <View key={`${uri}-${index}`} style={styles.photoGridItem}>{renderPhotoItem({ item: uri, index })}</View>)}
              {photoUris.length % 2 === 1 && <View style={styles.photoGridSpacer} />}
            </View>
          ) : (
            <Text style={styles.noPhotosText}>{trabajo.photos?.length ? "Las fotos guardadas no están disponibles." : "No hay fotos adjuntas a este trabajo."}</Text>
          )}
          <TouchableOpacity style={styles.addPhotoButton} onPress={handleAddPhoto}>
            <Ionicons name="camera-outline" size={19} color="#596578" /><Text style={styles.addPhotoText}>Añadir foto del montaje</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomActions}>
        {trabajo.estadoPago === "Cancelado" ? (
          <TouchableOpacity style={styles.primaryAction} onPress={handleReprogramar}><Ionicons name="calendar-outline" size={19} color="#FFFFFF" /><Text style={styles.primaryActionText}>Reprogramar trabajo</Text></TouchableOpacity>
        ) : trabajo.estadoPago === "Pagado" ? (
          <View style={styles.paidState}><Ionicons name="checkmark-circle" size={19} color="#087F75" /><Text style={styles.paidStateText}>Trabajo pagado</Text></View>
        ) : (
          <TouchableOpacity style={styles.primaryAction} onPress={trabajo.estadoPago === "Terminado, falta pago" ? handleMarcarPagado : handleTerminarTrabajo}>
            <Ionicons name="checkmark-circle-outline" size={19} color="#FFFFFF" /><Text style={styles.primaryActionText}>{trabajo.estadoPago === "Terminado, falta pago" ? "Marcar como pagado" : "Marcar terminado"}</Text>
          </TouchableOpacity>
        )}
        {trabajo.estadoPago !== "Cancelado" && trabajo.estadoPago !== "Pagado" && trabajo.estadoPago !== "Terminado, falta pago" && (
          <TouchableOpacity style={styles.cancelWorkButton} onPress={handleMarcarCancelado}><Ionicons name="close-circle-outline" size={17} color="#3D4947" /><Text style={styles.cancelWorkText}>Cancelar trabajo</Text></TouchableOpacity>
        )}
      </View>
      {/* Modal de confirmación para reprogramar/eliminar */}
      <Modal visible={reprogramModalVisible} transparent={true} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setReprogramModalVisible(false)}>
        <View style={styles.modalContainerReprogramar}>
          <View style={styles.modalContentReprogramar}>
             <Text style={styles.modalTitleReprogramar}>{trabajo.estadoPago === "Cancelado" ? "Trabajo cancelado" : "Opciones del trabajo"}</Text>
            <TouchableOpacity style={styles.confirmButtonReprogramar} onPress={handleReprogramar}>
              <Ionicons name="calendar-outline" size={24} color="white" />
              <Text style={styles.confirmButtonTextReprogrmar}>Reprogramar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButtonReprogramar} onPress={handleEliminarTrabajo}>
               <Ionicons name="trash-outline" size={24} color="white" />
              <Text style={styles.deleteButtonTextEliminar}>Eliminar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setReprogramModalVisible(false)}>
               <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
       {/* Modal para agregar un material */}
      <Modal visible={showAddMaterialModal} transparent={true} animationType="fade" onRequestClose={() => setShowAddMaterialModal(false)} >
        <View style={styles.modalContainer}>
          <View style={styles.addMaterialModalContent}>
            <Text style={styles.modalTitle}>Agregar Material</Text>
            <TextInput style={styles.input} placeholder="Descripción del material" value={newMaterial.descripcion} onChangeText={(text) => setNewMaterial({ ...newMaterial, descripcion: text })} />
            <TextInput style={styles.input} placeholder="Cantidad" value={newMaterial.cantidad} onChangeText={(text) => setNewMaterial({ ...newMaterial, cantidad: formatCurrency(text.replace(/\D/g, '')) })} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="Precio por unidad" value={newMaterial.precio} onChangeText={(text) => setNewMaterial({ ...newMaterial, precio: formatCurrency(text.replace(/\D/g, '')) })} keyboardType="numeric"/>
            <TouchableOpacity style={styles.addButtonModal} onPress={handleAddMaterial}>
               <Ionicons name="add-circle" size={24} color="white" /> 
              <Text style={styles.addButtonModalText}>Guardar Material</Text> 
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelModalButton} onPress={() => setShowAddMaterialModal(false)}>
              <Text style={styles.cancelModalButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    
      <Modal visible={showEditPriceModal} transparent={true} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setShowEditPriceModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.addMaterialModalContent}>
            <View style={styles.priceModalIcon}><Ionicons name="cash-outline" size={22} color="#087F75" /></View>
            <Text style={styles.modalTitle}>Editar mano de obra</Text>
            <Text style={styles.modalHint}>Importe en pesos argentinos</Text>
            <View style={styles.currencyInputShell}>
              <Text style={styles.currencyInputPrefix}>$</Text>
              <TextInput style={styles.currencyInput} placeholder="0" placeholderTextColor="#89968F" value={newWorkPrice} onChangeText={(text) => setNewWorkPrice(formatCurrency(text.replace(/\D/g, "")))} keyboardType="numeric" accessibilityLabel="Precio de mano de obra en pesos" />
              <Text style={styles.currencyInputSuffix}>ARS</Text>
            </View>
            <TouchableOpacity style={styles.addButtonModal} onPress={handleUpdateWorkPrice}>
              <Ionicons name="checkmark-circle-outline" size={19} color="white" />
              <Text style={styles.addButtonModalText}>Guardar precio</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelModalButton} onPress={() => setShowEditPriceModal(false)}>
               <Text style={styles.cancelModalButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showPhotoSourceModal} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setShowPhotoSourceModal(false)}>
        <View style={styles.photoSourceOverlay}>
          <TouchableOpacity style={styles.photoSourceBackdrop} activeOpacity={1} onPress={() => setShowPhotoSourceModal(false)} accessibilityLabel="Cerrar opciones de foto" />
          <View style={styles.photoSourceSheet}>
            <View style={styles.photoSourceHandle} />
            <View style={styles.photoSourceHeading}>
              <View style={styles.photoSourceHeadingIcon}><Ionicons name="camera-outline" size={21} color="#087F75" /></View>
              <View style={styles.photoSourceHeadingCopy}>
                <Text style={styles.photoSourceTitle}>Añadir foto del montaje</Text>
                <Text style={styles.photoSourceSubtitle}>Elegí cómo querés adjuntarla al trabajo.</Text>
              </View>
              <TouchableOpacity style={styles.photoSourceClose} onPress={() => setShowPhotoSourceModal(false)} accessibilityRole="button" accessibilityLabel="Cerrar">
                <Ionicons name="close" size={20} color="#596578" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.photoSourceOption} onPress={() => handleChoosePhotoSource("camera")} accessibilityRole="button">
              <View style={styles.photoSourceOptionIcon}><Ionicons name="camera" size={20} color="#087F75" /></View>
              <View style={styles.photoSourceOptionCopy}>
                <Text style={styles.photoSourceOptionTitle}>Tomar una foto</Text>
                <Text style={styles.photoSourceOptionDescription}>Abrir la cámara del dispositivo</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#89968F" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoSourceOption} onPress={() => handleChoosePhotoSource("library")} accessibilityRole="button">
              <View style={styles.photoSourceOptionIcon}><Ionicons name="images-outline" size={20} color="#087F75" /></View>
              <View style={styles.photoSourceOptionCopy}>
                <Text style={styles.photoSourceOptionTitle}>Elegir de la galería</Text>
                <Text style={styles.photoSourceOptionDescription}>Seleccionar una imagen guardada</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#89968F" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoSourceCancel} onPress={() => setShowPhotoSourceModal(false)}>
              <Text style={styles.photoSourceCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {showDatePicker && (
        <DateTimePicker
          value={newDate}
          mode="date"
          display="default"
          onValueChange={onDateValueChange}
          onDismiss={() => setShowDatePicker(false)}
          minimumDate={new Date()}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={newDate}
          mode="time"
          display="default"
          onValueChange={onTimeValueChange}
          onDismiss={() => setShowTimePicker(false)}
        />
      )}
    
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.imageModalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseButton}>
               <Ionicons name="close" size={30} color="white" />
            </TouchableOpacity>
            <Text style={styles.imageModalTitle}>
               {selectedPhotoIndex + 1} de {photoUris.length}
            </Text>
          </View>
          <View style={styles.modalImageContainer}>
            {photoUris.length > 0 && (
              <Image source={{ uri: photoUris[selectedPhotoIndex] }} style={styles.modalImage} contentFit="contain" />
            )}
            {photoUris.length > 1 && (
              <>
                {selectedPhotoIndex > 0 && (
                  <TouchableOpacity style={[styles.navButton, styles.prevButton]} onPress={() => navigatePhoto("prev")}>
                     <Ionicons name="chevron-back" size={30} color="white" />
                  </TouchableOpacity>
                )}
                {selectedPhotoIndex < photoUris.length - 1 && (
                  <TouchableOpacity style={[styles.navButton, styles.nextButton]} onPress={() => navigatePhoto("next")}>
                    <Ionicons name="chevron-forward" size={30} color="white" />
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* CUSTOM ALERT MODAL */}
      <Modal visible={alertConfig.visible} transparent={true} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={hideCustomAlert}>
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>{alertConfig.title}</Text>
            <Text style={styles.alertMessage}>{alertConfig.message}</Text>
            <View style={styles.alertButtons}>
              {alertConfig.cancelText && (
                <TouchableOpacity style={[styles.alertButton, styles.alertCancelButton]} onPress={alertConfig.onCancel}>
                  <Text style={styles.alertCancelText}>{alertConfig.cancelText}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.alertButton,
                  alertConfig.destructive ? styles.alertDestructiveButton : styles.alertConfirmButton,
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
  container: { flex: 1, backgroundColor: "#FAF9F6" },
  header: { minHeight: 54, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#EAE7E1", backgroundColor: "#FAF9F6" },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  headerTitle: { flex: 1, textAlign: "center", color: "#1A1C1A", fontSize: 16, fontWeight: "700" },
  moreButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 20 },
  summaryCard: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#EAE7E1", padding: 16, marginBottom: 13, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  summaryTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 },
  workTypeBadge: { color: "#3D4947", backgroundColor: "#EFEEEB", borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: "700", overflow: "hidden" },
  paymentBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#E9CFAE", borderRadius: 18, paddingHorizontal: 9, paddingVertical: 5 },
  paymentBadgeText: { fontSize: 10, fontWeight: "700" },
  workTitle: { color: "#1A1C1A", fontSize: 21, lineHeight: 27, letterSpacing: -0.4, fontWeight: "800" },
  summaryDivider: { height: 1, backgroundColor: "#EFEEEB", marginTop: 13, marginBottom: 11 },
  summaryMetaRow: { flexDirection: "row", alignItems: "center", gap: 9, marginVertical: 4 },
  summaryMetaText: { flex: 1, color: "#3D4947", fontSize: 13 },
  summaryProgressText: { flex: 1, color: "#087F75", fontSize: 13, fontWeight: "700" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#EAE7E1", padding: 16, marginBottom: 13, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.035, shadowRadius: 3, elevation: 1 },
  cardHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28, marginBottom: 13 },
  cardTitleGroup: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  cardTitle: { color: "#1A1C1A", fontSize: 15, fontWeight: "700" },
  iconButton: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#EAF5F2", borderWidth: 1, borderColor: "#CEE5DF", alignItems: "center", justifyContent: "center" },
  iconButtonActive: { backgroundColor: "#087F75", borderColor: "#087F75" },
  clientDetailsBox: { backgroundColor: "#F8F7F4", borderRadius: 12, borderWidth: 1, borderColor: "#EAE7E1", padding: 13 },
  detailLabel: { color: "#596578", fontSize: 10, fontWeight: "700", letterSpacing: 0.5, marginBottom: 3, marginTop: 8 },
  clientValue: { color: "#1A1C1A", fontSize: 14, lineHeight: 20 },
  addressInput: { minHeight: 45, borderWidth: 1, borderColor: "#D9DFDC", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, color: "#1A1C1A", fontSize: 13, backgroundColor: "#FFFFFF", textAlignVertical: "top" },
  contactActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  contactAction: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#D9DFDC", borderRadius: 10, backgroundColor: "#FAF9F6" },
  contactActionText: { color: "#1A1C1A", fontSize: 12, fontWeight: "700" },
  scheduleDetails: { flexDirection: "row", alignItems: "flex-start", gap: 11, marginBottom: 14 },
  scheduleCopy: { flex: 1 },
  scheduleDate: { color: "#1A1C1A", fontSize: 15, fontWeight: "700", textTransform: "capitalize" },
  scheduleTime: { color: "#3D4947", fontSize: 13, marginTop: 4 },
  rescheduleButton: { minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#D9DFDC", borderRadius: 9, backgroundColor: "#FFFFFF" },
  rescheduleButtonText: { color: "#1A1C1A", fontSize: 12, fontWeight: "700" },
  inlineAddButton: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 5 },
  inlineAddText: { color: "#00685F", fontSize: 12, fontWeight: "700" },
  materialItem: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: 1, borderBottomColor: "#EFEEEB", paddingVertical: 10 },
  materialCopy: { flex: 1 },
  materialDescription: { color: "#1A1C1A", fontSize: 13, fontWeight: "600", lineHeight: 18 },
  materialQuantity: { color: "#596578", fontSize: 10, fontWeight: "600", marginTop: 3 },
  materialSubtotal: { color: "#1A1C1A", fontSize: 14, fontWeight: "800" },
  deleteMaterialButton: { width: 28, height: 32, alignItems: "center", justifyContent: "center" },
  emptyMaterials: { alignItems: "center", paddingVertical: 12, gap: 7 },
  emptyText: { color: "#6D7A77", fontSize: 12 },
  costRow: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  costLabel: { color: "#3D4947", fontSize: 13 },
  costValueGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
  costValue: { color: "#1A1C1A", fontSize: 14, fontWeight: "600" },
  editPriceButton: { width: 29, height: 29, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#EAF5F2", borderWidth: 1, borderColor: "#CEE5DF", marginRight: 2 },
  totalRow: { minHeight: 61, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#EFEEEB", marginTop: 7, paddingTop: 10 },
  totalLabel: { color: "#596578", fontSize: 12, fontWeight: "700" },
  totalAmountGroup: { alignItems: "flex-end" },
  totalValue: { color: "#00685F", fontSize: 24, lineHeight: 29, fontWeight: "800" },
  currencyLabel: { color: "#596578", fontSize: 10, fontWeight: "700", marginTop: 1 },
  photoSectionNote: { color: "#596578", fontSize: 10, fontWeight: "600" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 9 },
  photoGridItem: { width: "48.5%", borderRadius: 11, overflow: "hidden", borderWidth: 1, borderColor: "#D9DFDC" },
  photoGridSpacer: { width: "48.5%" },
  photoPreviewContainer: { width: "100%", aspectRatio: 1.4, position: "relative" },
  photoPreview: { width: "100%", height: "100%", backgroundColor: "#EFEEEB" },
  photoOverlay: { position: "absolute", right: 7, bottom: 7, width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,23,42,0.48)" },
  noPhotosText: { color: "#6D7A77", fontSize: 12, paddingVertical: 7 },
  addPhotoButton: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderStyle: "dashed", borderColor: "#BCC9C6", borderRadius: 9, marginTop: 11, backgroundColor: "#FFFFFF" },
  addPhotoText: { color: "#596578", fontSize: 12, fontWeight: "700" },
  bottomActions: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 7 : 11, backgroundColor: "rgba(250,249,246,0.98)", borderTopWidth: 1, borderTopColor: "#EAE7E1", gap: 8 },
  primaryAction: { minHeight: 49, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#00685F", borderRadius: 9, paddingHorizontal: 12 },
  primaryActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  cancelWorkButton: { minHeight: 39, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: "#D9DFDC", backgroundColor: "#FFFFFF", borderRadius: 9 },
  cancelWorkText: { color: "#3D4947", fontSize: 12, fontWeight: "600" },
  paidState: { minHeight: 49, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 9, backgroundColor: "#E7F5F1" },
  paidStateText: { color: "#087F75", fontSize: 14, fontWeight: "700" },
  modalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(15,23,42,0.45)", padding: 20 },
  addMaterialModalContent: { width: "100%", maxWidth: 430, backgroundColor: "#FFFFFF", borderRadius: 18, padding: 20, elevation: 8 },
  modalTitle: { color: "#1A1C1A", fontSize: 17, fontWeight: "700", textAlign: "center", marginBottom: 15 },
  priceModalIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#EAF5F2", alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  modalHint: { color: "#6D7A77", fontSize: 12, textAlign: "center", marginTop: -7, marginBottom: 16 },
  currencyInputShell: { minHeight: 56, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#CEE5DF", backgroundColor: "#F8FBFA", borderRadius: 11, paddingHorizontal: 14, marginBottom: 13 },
  currencyInputPrefix: { color: "#087F75", fontSize: 20, fontWeight: "700", marginRight: 9 },
  currencyInput: { flex: 1, minWidth: 0, paddingVertical: 10, color: "#1A1C1A", fontSize: 19, fontWeight: "700" },
  currencyInputSuffix: { color: "#6D7A77", fontSize: 11, fontWeight: "700", marginLeft: 9 },
  input: { minHeight: 46, borderWidth: 1, borderColor: "#EAE7E1", backgroundColor: "#FAF9F6", color: "#1A1C1A", borderRadius: 9, paddingHorizontal: 12, marginBottom: 10, fontSize: 13 },
  addButtonModal: { minHeight: 46, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, backgroundColor: "#087F75", borderRadius: 9, marginTop: 3 },
  addButtonModalText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  cancelModalButton: { minHeight: 42, alignItems: "center", justifyContent: "center", marginTop: 7 },
  cancelModalButtonText: { color: "#596578", fontSize: 13, fontWeight: "600" },
  modalContainerReprogramar: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" },
  modalContentReprogramar: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: Platform.OS === "ios" ? 30 : 20 },
  modalTitleReprogramar: { color: "#1A1C1A", fontSize: 17, fontWeight: "700", marginBottom: 15 },
  confirmButtonReprogramar: { minHeight: 46, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: "#087F75", borderRadius: 9 },
  confirmButtonTextReprogrmar: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  deleteButtonReprogramar: { minHeight: 44, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#E8D1CD", backgroundColor: "#FFF9F8", borderRadius: 9, marginTop: 9 },
  deleteButtonTextEliminar: { color: "#A64238", fontSize: 13, fontWeight: "700" },
  cancelButton: { minHeight: 43, justifyContent: "center", alignItems: "center", marginTop: 4 },
  cancelButtonText: { color: "#596578", fontSize: 13, fontWeight: "600" },
  photoSourceOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.48)" },
  photoSourceBackdrop: { ...StyleSheet.absoluteFillObject },
  photoSourceSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 30 : 20, elevation: 12 },
  photoSourceHandle: { width: 38, height: 4, borderRadius: 3, backgroundColor: "#D9DFDC", alignSelf: "center", marginBottom: 18 },
  photoSourceHeading: { flexDirection: "row", alignItems: "center", marginBottom: 17, gap: 11 },
  photoSourceHeadingIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: "#EAF5F2", alignItems: "center", justifyContent: "center" },
  photoSourceHeadingCopy: { flex: 1 },
  photoSourceTitle: { color: "#1A1C1A", fontSize: 16, fontWeight: "700" },
  photoSourceSubtitle: { color: "#6D7A77", fontSize: 12, marginTop: 3 },
  photoSourceClose: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#F5F6F4", alignItems: "center", justifyContent: "center" },
  photoSourceOption: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: "#EAEFED", borderRadius: 13, backgroundColor: "#FCFDFC", marginBottom: 9 },
  photoSourceOptionIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#EAF5F2", alignItems: "center", justifyContent: "center" },
  photoSourceOptionCopy: { flex: 1 },
  photoSourceOptionTitle: { color: "#1A1C1A", fontSize: 14, fontWeight: "700" },
  photoSourceOptionDescription: { color: "#6D7A77", fontSize: 11, marginTop: 3 },
  photoSourceCancel: { minHeight: 45, alignItems: "center", justifyContent: "center", marginTop: 2 },
  photoSourceCancelText: { color: "#596578", fontSize: 13, fontWeight: "700" },
  imageModalContainer: { flex: 1, backgroundColor: "rgba(0,0,0,0.96)" },
  modalHeader: { height: 55, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  imageModalTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  modalCloseButton: { position: "absolute", left: 13, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  modalImageContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  modalImage: { width: Dimensions.get("window").width - 24, height: Dimensions.get("window").height * 0.76 },
  navButton: { position: "absolute", top: "48%", width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", zIndex: 1 },
  prevButton: { left: 9 },
  nextButton: { right: 9 },
  alertOverlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: "rgba(15,23,42,0.46)" },
  alertBox: { width: "90%", maxWidth: 420, backgroundColor: "#FFFFFF", borderRadius: 17, padding: 20, elevation: 8 },
  alertTitle: { color: "#1A1C1A", fontSize: 17, fontWeight: "700", textAlign: "center", marginBottom: 9 },
  alertMessage: { color: "#596578", fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: 16 },
  alertButtons: { flexDirection: "row", justifyContent: "space-around", gap: 9 },
  alertButton: { flex: 1, minHeight: 46, justifyContent: "center", alignItems: "center", borderRadius: 9, paddingHorizontal: 6, paddingVertical: 7 },
  alertCancelButton: { backgroundColor: "#F8F7F4", borderWidth: 1, borderColor: "#EAE7E1" },
  alertConfirmButton: { backgroundColor: "#087F75" },
  alertDestructiveButton: { backgroundColor: "#A64238" },
  alertCancelText: { color: "#596578", fontSize: 13, fontWeight: "600", textAlign: "center", lineHeight: 17, flexShrink: 1 },
  alertConfirmText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 17, flexShrink: 1 },
})
export default WorkDetailScreen
