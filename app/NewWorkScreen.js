import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "../lib/backendStorage"
import DateTimePicker from "@react-native-community/datetimepicker"
import * as FileSystem from "expo-file-system/legacy"
import * as ImagePicker from "expo-image-picker"
import * as Linking from "expo-linking"
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Picker } from "@react-native-picker/picker"
import { FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

const NewWorkScreen = () => {
  const { clienteId: clientIdParam } = useLocalSearchParams()
  const clientId = Array.isArray(clientIdParam) ? clientIdParam[0] : clientIdParam
  // Estados para almacenar los datos del formulario y la UI
  const [clientes, setClientes] = useState([])
  const [searchText, setSearchText] = useState("")
  const [selectedClient, setSelectedClient] = useState(null)
  const [trabajo, setTrabajo] = useState("")
  const [domicilioTrabajo, setDomicilioTrabajo] = useState("")
  const [materiales, setMateriales] = useState([{ descripcion: "", cantidad: "", precio: "" }])
  const [costoManoDeObra, setCostoManoDeObra] = useState("")
  const [fecha, setFecha] = useState(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [selectedHour, setSelectedHour] = useState(() => new Date().getHours())
  const [selectedMinute, setSelectedMinute] = useState(0)
  const [isClientModalVisible, setClientModalVisible] = useState(false)
  const [tipoTrabajo, setTipoTrabajo] = useState(null)
  const [isWorkTypeModalVisible, setWorkTypeModalVisible] = useState(false)
  const [photos, setPhotos] = useState([]) // Nuevo estado para las fotos

  // Estado y opciones para el tipo de trabajo
  const [workTypes, setWorkTypes] = useState([])
  const [newWorkType, setNewWorkType] = useState("")
  const [editingWorkTypeIndex, setEditingWorkTypeIndex] = useState(null)
  const [openWorkTypeMenuIndex, setOpenWorkTypeMenuIndex] = useState(null)

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

  // Hook de navegación de expo-router
  const router = useRouter()

  const openTimePicker = () => {
    const roundedMinutes = Math.round((fecha.getHours() * 60 + fecha.getMinutes()) / 15) * 15 % (24 * 60)
    setSelectedHour(Math.floor(roundedMinutes / 60))
    setSelectedMinute(roundedMinutes % 60)
    setShowTimePicker(true)
  }

  const confirmSelectedTime = () => {
    const updatedDate = new Date(fecha)
    updatedDate.setHours(selectedHour, selectedMinute, 0, 0)
    setFecha(updatedDate)
    setShowTimePicker(false)
  }

  // Función para obtener los clientes de AsyncStorage
  const fetchClients = async () => {
    try {
      const clientesJSON = await AsyncStorage.getItem("clientes")
      const clientesArray = clientesJSON ? JSON.parse(clientesJSON) : []
      setClientes(clientesArray)
    } catch (error) {
      console.error("Error al cargar clientes:", error)
      showCustomAlert("Error", "No se pudieron cargar los clientes.")
    }
  }

  // Función para obtener los tipos de trabajo de AsyncStorage
  const fetchWorkTypes = async () => {
    try {
      const workTypesJSON = await AsyncStorage.getItem("tiposTrabajo")
      if (workTypesJSON) {
        setWorkTypes(JSON.parse(workTypesJSON))
      }
    } catch (error) {
      console.error("Error al cargar tipos de trabajo:", error)
    }
  }

  // useFocusEffect para cargar clientes y tipos de trabajo cada vez que la pantalla esté enfocada
  useFocusEffect(
    useCallback(() => {
      fetchClients()
      fetchWorkTypes()
    }, []),
  )

  useEffect(() => {
    if (clientId == null || !clientes.length) return
    const client = clientes.find((item) => String(item.id) === String(clientId))
    if (client) {
      setSelectedClient(client)
      setDomicilioTrabajo(client.domicilio || "")
    }
  }, [clientId, clientes])

  const filteredClientes = useMemo(() => {
    const normalizedSearch = searchText.toLowerCase()
    return clientes.filter((cliente) =>
      cliente.nombre.toLowerCase().includes(normalizedSearch) ||
      cliente.apellido.toLowerCase().includes(normalizedSearch),
    )
  }, [clientes, searchText])

  // Manejador para seleccionar un cliente de la lista modal
  const handleClientSelect = (cliente) => {
    setSelectedClient(cliente)
    setDomicilioTrabajo(cliente.domicilio || "")
    setClientModalVisible(false)
  }

  // Manejador para seleccionar un tipo de trabajo
  const handleWorkTypeSelect = (type) => {
    setTipoTrabajo(type)
    setOpenWorkTypeMenuIndex(null)
    setWorkTypeModalVisible(false)
  }

  // Manejador para agregar o editar un tipo de trabajo
  const handleAddWorkType = async () => {
    const typeToAdd = newWorkType.trim()
    if (typeToAdd === "") {
      showCustomAlert("Error", "Por favor ingresa un nombre para el tipo de trabajo.")
      return
    }

    if (editingWorkTypeIndex === null && workTypes.includes(typeToAdd)) {
      showCustomAlert("Aviso", "Este tipo de trabajo ya existe.")
      return
    }

    try {
      let updatedWorkTypes = [...workTypes]
      if (editingWorkTypeIndex !== null) {
        updatedWorkTypes[editingWorkTypeIndex] = typeToAdd
      } else {
        updatedWorkTypes.push(typeToAdd)
      }

      setWorkTypes(updatedWorkTypes)
      await AsyncStorage.setItem("tiposTrabajo", JSON.stringify(updatedWorkTypes))
      setNewWorkType("")
      setEditingWorkTypeIndex(null)
      
      // Si el cliente estaba seleccionando el tipo que ahora fue editado
      if (editingWorkTypeIndex !== null && tipoTrabajo === workTypes[editingWorkTypeIndex]) {
          setTipoTrabajo(typeToAdd)
      } else if (editingWorkTypeIndex === null) {
          setTipoTrabajo(typeToAdd)
          setWorkTypeModalVisible(false) // Solo cierra si no es edición
      }

    } catch (error) {
      console.error("Error al guardar tipo de trabajo:", error)
      showCustomAlert("Error", "No se pudo guardar el tipo de trabajo.")
    }
  }

  // Manejador para preparar la edicién de un tipo de trabajo
  const startEditingWorkType = (index) => {
    setNewWorkType(workTypes[index])
    setEditingWorkTypeIndex(index)
  }

  // Manejador para eliminar un tipo de trabajo
  const handleDeleteWorkType = (index) => {
    showCustomAlert(
      "Eliminar Tipo de Trabajo",
      "¿Estás seguro que deseas eliminar este tipo de trabajo?",
      {
        cancelText: "Cancelar",
        confirmText: "Eliminar",
        destructive: true,
        onCancel: hideCustomAlert,
        onConfirm: async () => {
          try {
            const updatedWorkTypes = workTypes.filter((_, i) => i !== index)
            setWorkTypes(updatedWorkTypes)
            await AsyncStorage.setItem("tiposTrabajo", JSON.stringify(updatedWorkTypes))
            
            // Si se eliminó el que el usuario ya tenía marcado:
            if (tipoTrabajo === workTypes[index]) {
              setTipoTrabajo(null)
            }
            hideCustomAlert()
          } catch (error) {
            console.error("Error al eliminar tipo de trabajo:", error)
            hideCustomAlert()
            setTimeout(() => showCustomAlert("Error", "No se pudo eliminar el tipo de trabajo."), 500)
          }
        }
      }
    )
  }

  // Función para abrir la galería o la cámara y seleccionar una imagen
  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== "granted") {
      showCustomAlert("Permiso denegado", "Necesitamos permiso para acceder a la galería de fotos.")
      return
    }

    showCustomAlert("Seleccionar Foto", "¿Deseas tomar una foto o seleccionar una de la galería?", {
        confirmText: "Tomar Foto",
        cancelText: "Cerrar",
        onCancel: hideCustomAlert,
        onConfirm: async () => {
            hideCustomAlert()
            const cameraPermission = await ImagePicker.requestCameraPermissionsAsync()
            if (cameraPermission.status !== "granted") {
                setTimeout(() => showCustomAlert("Permiso denegado", "Necesitamos permiso para usar la cámara."), 500)
                return
            }
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.5,
            })
            if (!result.canceled) {
                setPhotos((prevPhotos) => [...prevPhotos, ...result.assets])
            }
        }
    })
  }

  // Función para eliminar una foto de la vista previa
  const handleRemovePhoto = (uriToRemove) => {
    setPhotos((prevPhotos) => prevPhotos.filter((photo) => photo.uri !== uriToRemove))
  }

  // Función para agregar un nuevo material
  const addMaterial = () => {
    setMateriales([...materiales, { descripcion: "", cantidad: "", precio: "" }])
  }

  // Función para eliminar un material
  const removeMaterial = (index) => {
    if (materiales.length > 1) {
      const newMateriales = materiales.filter((_, i) => i !== index)
      setMateriales(newMateriales)
    }
  }

  // Función para actualizar un material específico
  const updateMaterial = (index, field, value) => {
    const newMateriales = [...materiales]
    newMateriales[index][field] = value
    setMateriales(newMateriales)
  }

  const parseCurrencyInput = (value) => Number(String(value ?? "").replace(/\D/g, "")) || 0
  const formatCurrencyInput = (value) => String(value ?? "").replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".")

  // Calcular el total de materiales
  const calculateMaterialsTotal = () => {
    return materiales.reduce((total, material) => {
      const cantidad = Number.parseFloat(material.cantidad) || 0
      const precio = parseCurrencyInput(material.precio)
      return total + cantidad * precio
    }, 0)
  }

  // formatCurrency: quita los decimales y agrega separador de miles con punto
  const formatCurrency = (amount) => {
    const numericAmount = typeof amount === "string" ? parseCurrencyInput(amount) : Number(amount) || 0
    return Math.round(numericAmount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  }

  // Calcular el total general
  const calculateTotal = () => {
    const materialsTotal = calculateMaterialsTotal()
    const laborCost = parseCurrencyInput(costoManoDeObra)
    return materialsTotal + laborCost
  }

  // Manejador para guardar un nuevo trabajo en AsyncStorage
  const handleSaveWork = async () => {
    // Validar que los campos obligatorios estén llenos
    if (!selectedClient || !trabajo || !domicilioTrabajo || !tipoTrabajo) {
      showCustomAlert("Error", "El cliente, domicilio, tipo y descripción del trabajo son obligatorios.")
      return
    }

    // Validar que al menos un material tenga datos
    const validMaterials = materiales
      .filter((m) => m.descripcion.trim() !== "")
      .map((material) => ({ ...material, precio: String(parseCurrencyInput(material.precio)) }))
    if (validMaterials.length === 0) {
      showCustomAlert("Error", "Debe agregar al menos un material.")
      return
    }

    try {
      // Obtener trabajos existentes para verificar conflictos de horario
      const existingWorksJSON = await AsyncStorage.getItem("trabajos")
      const existingWorks = existingWorksJSON ? JSON.parse(existingWorksJSON) : []

      // Verificar si ya existe un trabajo en la misma fecha y hora
      const selectedDateTime = fecha.getTime()
      const conflictingWork = existingWorks.find((work) => {
        const workDateTime = new Date(work.fecha).getTime()
        // Verificar si hay conflicto (mismo tiempo con tolerancia de 1 minuto)
        const timeDifference = Math.abs(selectedDateTime - workDateTime)
        return timeDifference < 60000 // 60000 ms = 1 minuto
      })

      if (conflictingWork) {
        const conflictDate = new Date(conflictingWork.fecha)
        showCustomAlert(
          "Horario Ocupado",
          `Ya existe un trabajo programado para el ${conflictDate.toLocaleDateString()} a las ${conflictDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.\n\nCliente: ${conflictingWork.clienteNombre}\nTrabajo: ${conflictingWork.trabajo}\n\nPor favor selecciona otro horario.`,
        )
        return
      }

      // Mover las fotos a un directorio persistente
      const photosDirectory = `${FileSystem.documentDirectory}photos/`
      await FileSystem.makeDirectoryAsync(photosDirectory, { intermediates: true })
      const persistentPhotos = await Promise.all(
        photos.map(async (photo, index) => {
          const extension = photo.uri.split(".").pop()?.split(/[?#]/)[0] || "jpg"
          const fileName = `work_${Date.now()}_${index}.${extension}`
          const newUri = `${photosDirectory}${fileName}`
          try {
            await FileSystem.copyAsync({
              from: photo.uri,
              to: newUri,
            })
            return newUri
          } catch (e) {
            console.error("Error al copiar el archivo:", e)
            return null
          }
        }),
      )

      // Crear el objeto del nuevo trabajo
      const newWork = {
        id: Date.now().toString(),
        clienteId: selectedClient.id,
        clienteNombre: `${selectedClient.nombre} ${selectedClient.apellido}`,
        domicilio: domicilioTrabajo,
        telefono: selectedClient.telefono,
        tipoTrabajo: tipoTrabajo,
        trabajo: trabajo,
        materiales: validMaterials,
        costoMateriales: calculateMaterialsTotal(),
        costoManoDeObra: parseCurrencyInput(costoManoDeObra),
        total: calculateTotal(),
        fecha: fecha.toISOString(),
        photos: persistentPhotos.filter((uri) => uri !== null),
        estadoPago: "Pendiente",
      }

      // Agregar el nuevo trabajo a los existentes y guardarlos
      const updatedWorks = [...existingWorks, newWork]
      await AsyncStorage.setItem("trabajos", JSON.stringify(updatedWorks))

      showCustomAlert(
        "Trabajo Guardado",
        "El trabajo se guardó correctamente. ¿Deseas enviar un comprobante al cliente por WhatsApp?",
        {
          cancelText: "No",
          confirmText: "Sí, Enviar",
          onCancel: () => {
            hideCustomAlert()
            // Limpiar formulario y navegar
            setSelectedClient(null)
            setTrabajo("")
            setDomicilioTrabajo("")
            setMateriales([{ descripcion: "", cantidad: "", precio: "" }])
            setCostoManoDeObra("")
            setFecha(new Date())
            setSearchText("")
            setTipoTrabajo(null)
            setPhotos([])
            router.replace("/")
          },
          onConfirm: () => {
            hideCustomAlert()
            // Crear mensaje de WhatsApp
            const fechaFormateada = new Date(newWork.fecha).toLocaleDateString("es-ES", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })
            const horaFormateada = new Date(newWork.fecha).toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            })

            const materialesTexto = newWork.materiales
              .map(
                (m) =>
                  `• ${m.descripcion} - Cant: ${m.cantidad} - $${formatCurrency(Number.parseFloat(m.cantidad) * parseCurrencyInput(m.precio))}`,
              )
              .join("\n")

            const mensaje = `🔧 *COMPROBANTE DE TRABAJO PROGRAMADO*\n\n👤 *Cliente:* ${newWork.clienteNombre}\n📍 *Domicilio:* ${newWork.domicilio}\n🗓️ *Fecha:* ${fechaFormateada}\n⏰ *Hora:* ${horaFormateada}\n⚡ *Tipo:* ${newWork.tipoTrabajo}\n\n📝 *Descripción del trabajo:*\n${newWork.trabajo}\n\n🛠️ *Materiales:*\n${materialesTexto}\n\n💰 *Costos:*\n• Materiales: $${formatCurrency(newWork.costoMateriales)}\n• Mano de obra: $${formatCurrency(newWork.costoManoDeObra)}\n• *TOTAL: $${formatCurrency(newWork.total)}*\n\n✅ Estado: ${newWork.estadoPago}\n\n¡Nos vemos el día programado!`

            const phoneNumber = selectedClient.telefono.replace(/\D/g, "")
            const whatsappUrl = `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(mensaje)}`

            // Intenta abrir WhatsApp directamente con el objeto Linking
            Linking.canOpenURL(whatsappUrl).then((supported) => {
              if (supported) {
                Linking.openURL(whatsappUrl)
              } else {
                setTimeout(() => showCustomAlert("Error", "No se pudo abrir WhatsApp. Asegúrate de tenerlo instalado."), 500)
              }
            })
            router.replace("/")
          }
        }
      )
    } catch (error) {
      console.error("Error al guardar el trabajo:", error)
      hideCustomAlert()
      setTimeout(() => showCustomAlert("Error", "No se pudo guardar el trabajo."), 500)
    }
  }

  // Renderiza cada item de la lista de clientes en el modal
  const renderClientItem = ({ item }) => (
    <TouchableOpacity style={styles.modalItem} onPress={() => handleClientSelect(item)}>
      <Text style={styles.modalItemText}>
        {item?.nombre || ""} {item?.apellido || ""}
      </Text>
    </TouchableOpacity>
  )

  // Renderiza cada item de la lista de fotos
  const renderPhotoItem = ({ item }) => (
    <View style={styles.photoPreviewContainer}>
      <Image source={{ uri: item.uri }} style={styles.photoPreview} />
      <TouchableOpacity onPress={() => handleRemovePhoto(item.uri)} style={styles.removePhotoButton}>
        <Ionicons name="close-circle-sharp" size={24} color="#C42A2A" />
      </TouchableOpacity>
    </View>
  )

  // Renderiza cada material en la lista
  const renderMaterialItem = ({ item, index }) => (
    <View style={styles.materialContainer}>
      <View style={styles.materialHeader}>
        <Text style={styles.materialTitle}>Ítem #{index + 1}</Text>
        {materiales.length > 1 && (
          <TouchableOpacity onPress={() => removeMaterial(index)} style={styles.removeMaterialButton}>
            <Ionicons name="trash-outline" size={18} color={FORM_COLORS.danger} />
          </TouchableOpacity>
        )}
      </View>

      <TextInput
        style={[styles.input, styles.materialDescriptionInput]}
        value={item.descripcion}
        onChangeText={(value) => updateMaterial(index, "descripcion", value)}
        placeholder="Descripción del material"
        placeholderTextColor={FORM_COLORS.placeholder}
      />

      <View style={styles.materialRow}>
        <View style={styles.materialField}>
          <Text style={styles.fieldLabel}>Cantidad</Text>
          <TextInput
            style={[styles.input, styles.materialInput]}
            value={item.cantidad}
            onChangeText={(value) => updateMaterial(index, "cantidad", value)}
            placeholder="0"
            placeholderTextColor={FORM_COLORS.placeholder}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.materialField}>
          <Text style={styles.fieldLabel}>Precio unitario</Text>
          <View style={[styles.currencyField, styles.materialInput]}>
            <Text style={styles.currencySymbol}>$</Text>
            <TextInput
              style={styles.currencyFieldInput}
              value={item.precio}
              onChangeText={(value) => updateMaterial(index, "precio", formatCurrencyInput(value))}
              placeholder="0"
              placeholderTextColor={FORM_COLORS.placeholder}
              keyboardType="numeric"
            />
          </View>
        </View>
      </View>

      {item.cantidad && item.precio && (
        <View style={styles.subtotalRow}>
          <Text style={styles.subtotalLabel}>Subtotal ítem</Text>
          <Text style={styles.subtotalText}>${formatCurrency(Number.parseFloat(item.cantidad) * parseCurrencyInput(item.precio))}</Text>
        </View>
      )}
    </View>
  )

  const materialCount = materiales.filter((item) => item.descripcion.trim()).length

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace("/")} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Volver al inicio">
          <Ionicons name="arrow-back" size={22} color={FORM_COLORS.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Nuevo trabajo</Text>
        <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1 de 3</Text></View>
      </View>

      <View style={styles.formIntro}>
        <Text style={styles.introText}>Organizá los detalles del trabajo</Text>
        <View style={styles.progressTrack}><View style={styles.progressFill} /></View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.formContainer}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.formContent}>
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionIcon}><Ionicons name="person-outline" size={19} color={FORM_COLORS.primary} /></View>
                <Text style={styles.sectionTitle}>Cliente</Text>
                <TouchableOpacity style={styles.addClientAction} onPress={() => router.push("NewClientScreen")}>
                  <Ionicons name="add" size={17} color={FORM_COLORS.primary} />
                  <Text style={styles.addClientText}>Nuevo cliente</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldLabel}>Nombre o Razón Social</Text>
              <TouchableOpacity style={styles.selectButton} onPress={() => setClientModalVisible(true)}>
                <Ionicons name="person-outline" size={18} color={FORM_COLORS.secondary} />
                <Text style={[styles.selectButtonText, !selectedClient && styles.placeholderText]} numberOfLines={1}>
                  {selectedClient ? `${selectedClient.nombre || ""} ${selectedClient.apellido || ""}`.trim() : "Seleccionar cliente"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={FORM_COLORS.secondary} />
              </TouchableOpacity>
              {selectedClient && (
                <View style={styles.selectedClientFields}>
                  <Text style={styles.fieldLabel}>Domicilio del trabajo</Text>
                  <TextInput
                    style={styles.input}
                    value={domicilioTrabajo || ""}
                    onChangeText={setDomicilioTrabajo}
                    placeholder="Calle y número, localidad"
                    placeholderTextColor={FORM_COLORS.placeholder}
                  />
                  <Text style={styles.fieldLabel}>Teléfono de contacto</Text>
                  <View style={[styles.input, styles.readOnlyField]}>
                    <Ionicons name="call-outline" size={17} color={FORM_COLORS.secondary} />
                    <Text style={styles.readOnlyText}>{selectedClient.telefono || "Sin teléfono"}</Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionIcon}><Ionicons name="calendar-outline" size={19} color={FORM_COLORS.primary} /></View>
                <Text style={styles.sectionTitle}>Programación</Text>
              </View>
              <View style={styles.dateFieldsRow}>
                <View style={styles.dateFieldGroup}>
                  <Text style={styles.fieldLabel}>Fecha pactada</Text>
                  <TouchableOpacity style={styles.dateField} onPress={() => setShowDatePicker(true)}>
                    <Ionicons name="calendar-outline" size={17} color={FORM_COLORS.secondary} />
                    <Text style={styles.dateFieldText}>{fecha ? fecha.toLocaleDateString("es-AR") : "Elegir fecha"}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.dateFieldGroup}>
                  <Text style={styles.fieldLabel}>Hora estimada</Text>
                  <TouchableOpacity style={styles.dateField} onPress={openTimePicker}>
                    <Ionicons name="time-outline" size={17} color={FORM_COLORS.secondary} />
                    <Text style={styles.dateFieldText}>{fecha ? fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "Elegir hora"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {showDatePicker && (
                <DateTimePicker value={fecha} mode="date" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={(event, selectedDate) => {
                  setShowDatePicker(false)
                  if (selectedDate) setFecha(selectedDate)
                }} />
              )}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionIcon}><Ionicons name="construct-outline" size={19} color={FORM_COLORS.primary} /></View>
                <Text style={styles.sectionTitle}>Trabajo</Text>
              </View>
              <Text style={styles.fieldLabel}>Tipo de trabajo</Text>
              <TouchableOpacity style={styles.selectButton} onPress={() => setWorkTypeModalVisible(true)}>
                <Text style={[styles.selectButtonText, !tipoTrabajo && styles.placeholderText]} numberOfLines={1}>{tipoTrabajo || "Seleccionar tipo de trabajo"}</Text>
                <Ionicons name="chevron-down" size={18} color={FORM_COLORS.secondary} />
              </TouchableOpacity>
              <Text style={styles.fieldLabel}>Descripción del trabajo</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={trabajo || ""}
                onChangeText={setTrabajo}
                placeholder="Detalle de tareas a realizar, medidas preliminares o especificaciones técnicas..."
                placeholderTextColor={FORM_COLORS.placeholder}
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionIcon}><Ionicons name="file-tray-stacked-outline" size={19} color={FORM_COLORS.primary} /></View>
                <Text style={styles.sectionTitle}>Materiales</Text>
                <View style={styles.countBadge}><Text style={styles.countBadgeText}>{materialCount} {materialCount === 1 ? "ítem" : "ítems"}</Text></View>
              </View>
              <FlatList data={materiales} renderItem={renderMaterialItem} keyExtractor={(item, index) => index.toString()} scrollEnabled={false} />
              <TouchableOpacity onPress={addMaterial} style={styles.addMaterialAction}>
                <Ionicons name="add-circle-outline" size={19} color={FORM_COLORS.primary} />
                <Text style={styles.addMaterialText}>Agregar material</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionIcon}><Ionicons name="wallet-outline" size={19} color={FORM_COLORS.primary} /></View>
                <Text style={styles.sectionTitle}>Costos</Text>
              </View>
              <Text style={styles.fieldLabel}>Mano de obra estimada</Text>
              <View style={styles.currencyInputWrap}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.currencyInput}
                  value={costoManoDeObra || ""}
                  onChangeText={(value) => setCostoManoDeObra(formatCurrencyInput(value))}
                  placeholder="0"
                  placeholderTextColor={FORM_COLORS.placeholder}
                  keyboardType="numeric"
                />
                <Text style={styles.currencyCode}>ARS</Text>
              </View>
              <View style={styles.totalContainer}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Materiales ({materialCount} ítems)</Text>
                  <Text style={styles.totalValue}>${formatCurrency(calculateMaterialsTotal())}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Mano de obra estimada</Text>
                  <Text style={styles.totalValue}>${formatCurrency(costoManoDeObra)}</Text>
                </View>
                <View style={[styles.totalRow, styles.finalTotal]}>
                  <View>
                    <Text style={styles.finalTotalLabel}>TOTAL ESTIMADO</Text>
                  </View>
                  <Text style={styles.finalTotalValue}>${formatCurrency(calculateTotal())}</Text>
                </View>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionIcon}><Ionicons name="camera-outline" size={19} color={FORM_COLORS.primary} /></View>
                <Text style={styles.sectionTitle}>Fotos del trabajo</Text>
                <View style={styles.optionalBadge}><Text style={styles.optionalBadgeText}>Opcional</Text></View>
              </View>
              <TouchableOpacity style={styles.photoDropZone} onPress={handlePickImage} activeOpacity={0.8}>
                <View style={styles.photoDropIcon}><Ionicons name="camera" size={24} color={FORM_COLORS.primary} /></View>
                <Text style={styles.photoDropTitle}>Tocá para subir fotos del sitio o planos</Text>
                <Text style={styles.photoDropSubtitle}>PNG o JPG</Text>
              </TouchableOpacity>
              {photos.length > 0 && (
                <FlatList data={photos} renderItem={renderPhotoItem} keyExtractor={(item, index) => index.toString()} horizontal showsHorizontalScrollIndicator={false} style={styles.photoList} />
              )}
            </View>
          </View>
        </ScrollView>
        <View style={styles.bottomActionBar}>
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveWork} activeOpacity={0.85}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>Guardar trabajo</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Modal para seleccionar clientes */}
      <Modal
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        navigationBarTranslucent
        visible={isClientModalVisible}
        onRequestClose={() => setClientModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Cliente</Text>
              <TouchableOpacity
                onPress={() => {
                  setClientModalVisible(false)
                  router.push("NewClientScreen")
                }}
                style={styles.addNewClientButton}
              >
                <Ionicons name="add-circle" size={30} color="#2F4550" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#2F4550" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Buscar por nombre"
                placeholderTextColor="#999"
              />
            </View>

            <FlatList
              data={filteredClientes}
              keyExtractor={(item) => item.id}
              renderItem={renderClientItem}
              style={styles.clientList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={() => <Text style={styles.emptyListText}>No se encontraron clientes.</Text>}
            />

            <TouchableOpacity onPress={() => setClientModalVisible(false)} style={styles.closeModalButton}>
              <Text style={styles.closeModalButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal para seleccionar tipo de trabajo */}
      <Modal
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        navigationBarTranslucent
        visible={isWorkTypeModalVisible}
        onRequestClose={() => setWorkTypeModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, styles.workTypeModalTitle]}>Tipo de Trabajo</Text>

            <View style={styles.addTypeContainer}>
              <TextInput
                style={styles.addTypeInput}
                value={newWorkType}
                onChangeText={setNewWorkType}
                placeholder={editingWorkTypeIndex !== null ? "Editar tipo de trabajo..." : "Nuevo tipo de trabajo..."}
                placeholderTextColor="#999"
              />
              <TouchableOpacity style={styles.addTypeButton} onPress={handleAddWorkType}>
                <Ionicons name={editingWorkTypeIndex !== null ? "checkmark" : "add"} size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.subModalTitle}>Seleccionar Existente</Text>
            <FlatList
              data={workTypes}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item, index }) => (
                <View style={styles.workTypeItem}>
                  <View style={styles.workTypeRow}>
                    <TouchableOpacity style={styles.modalItemTouchable} onPress={() => handleWorkTypeSelect(item)}>
                      <Text style={styles.modalItemText}>{item || ""}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setOpenWorkTypeMenuIndex((current) => current === index ? null : index)}
                      style={styles.actionButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Opciones para ${item}`}
                      accessibilityState={{ expanded: openWorkTypeMenuIndex === index }}
                    >
                      <Ionicons name="ellipsis-vertical" size={20} color={FORM_COLORS.secondary} />
                    </TouchableOpacity>
                  </View>
                  {openWorkTypeMenuIndex === index && (
                    <View style={styles.workTypeDropdown}>
                      <TouchableOpacity style={styles.workTypeDropdownOption} onPress={() => { setOpenWorkTypeMenuIndex(null); startEditingWorkType(index) }}>
                        <Ionicons name="pencil-outline" size={17} color={FORM_COLORS.primary} />
                        <Text style={styles.workTypeDropdownText}>Editar</Text>
                      </TouchableOpacity>
                      <View style={styles.workTypeDropdownDivider} />
                      <TouchableOpacity style={styles.workTypeDropdownOption} onPress={() => { setOpenWorkTypeMenuIndex(null); handleDeleteWorkType(index) }}>
                        <Ionicons name="trash-outline" size={17} color={FORM_COLORS.danger} />
                        <Text style={[styles.workTypeDropdownText, styles.workTypeDeleteText]}>Eliminar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
              style={styles.workTypesList}
              ListEmptyComponent={() => <Text style={styles.emptyListText}>No hay tipos de trabajo guardados.</Text>}
            />

            <TouchableOpacity onPress={() => setWorkTypeModalVisible(false)} style={styles.closeModalButton}>
              <Text style={styles.closeModalButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        visible={showTimePicker}
        onRequestClose={() => setShowTimePicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.timePickerModalContent}>
            <View style={styles.timePickerHeading}>
              <Text style={styles.modalTitle}>Elegir hora</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)} accessibilityLabel="Cerrar selector de hora">
                <Ionicons name="close" size={22} color={FORM_COLORS.secondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.timeSelectRow}>
              <View style={styles.timeSelectColumn}>
                <Text style={styles.timeSelectLabel}>Hora</Text>
                <View style={styles.timePickerSelect}>
                  <Picker selectedValue={selectedHour} onValueChange={(value) => setSelectedHour(Number(value))} mode="dialog" style={styles.nativeTimePicker} dropdownIconColor={FORM_COLORS.secondary}>
                    {Array.from({ length: 24 }, (_, hour) => <Picker.Item key={hour} label={String(hour).padStart(2, "0")} value={hour} />)}
                  </Picker>
                </View>
              </View>
              <View style={styles.timeSelectColumn}>
                <Text style={styles.timeSelectLabel}>Minutos</Text>
                <View style={styles.timePickerSelect}>
                  <Picker selectedValue={selectedMinute} onValueChange={(value) => setSelectedMinute(Number(value))} mode="dialog" style={styles.nativeTimePicker} dropdownIconColor={FORM_COLORS.secondary}>
                    {[0, 15, 30, 45].map((minute) => <Picker.Item key={minute} label={String(minute).padStart(2, "0")} value={minute} />)}
                  </Picker>
                </View>
              </View>
            </View>
            <View style={styles.timePickerActions}>
              <TouchableOpacity style={styles.timeCancelButton} onPress={() => setShowTimePicker(false)}><Text style={styles.timeCancelText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={styles.timeConfirmButton} onPress={confirmSelectedTime}><Text style={styles.timeConfirmText}>Confirmar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

const FORM_COLORS = {
  background: "#FAF9F6",
  surface: "#FFFFFF",
  ink: "#182320",
  secondary: "#697976",
  placeholder: "#A3AEAA",
  border: "#E3E9E6",
  primary: "#0D9488",
  primaryDark: "#006A61",
  pale: "#F5F7F4",
  mint: "#E2F6F2",
  amber: "#A86407",
  danger: "#C1473D",
}

// Estilos del componente
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FORM_COLORS.background },
  header: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: FORM_COLORS.background,
  },
  backButton: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  title: { color: FORM_COLORS.ink, fontSize: 17, fontWeight: "700", flex: 1, textAlign: "center" },
  stepBadge: { minWidth: 48, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 14, backgroundColor: FORM_COLORS.mint, alignItems: "center" },
  stepBadgeText: { color: FORM_COLORS.primaryDark, fontSize: 11, fontWeight: "700" },
  formIntro: { paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: FORM_COLORS.border },
  introText: { color: FORM_COLORS.secondary, fontSize: 13, marginBottom: 11 },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: "#E8ECE9", overflow: "hidden" },
  progressFill: { width: "34%", height: "100%", borderRadius: 3, backgroundColor: FORM_COLORS.primary },
  formContainer: { flex: 1 },
  scrollContent: { paddingBottom: 18 },
  formContent: { padding: 16, gap: 12 },
  sectionCard: {
    padding: 14,
    backgroundColor: FORM_COLORS.surface,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: FORM_COLORS.border,
    shadowColor: "#17201F",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.035,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionHeading: { flexDirection: "row", alignItems: "center", marginBottom: 13, gap: 9 },
  sectionIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: FORM_COLORS.mint, alignItems: "center", justifyContent: "center" },
  sectionTitle: { color: FORM_COLORS.ink, fontSize: 16, fontWeight: "700", flex: 1 },
  addClientAction: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 6, paddingLeft: 5 },
  addClientText: { color: FORM_COLORS.primaryDark, fontSize: 11, fontWeight: "700" },
  fieldLabel: { color: FORM_COLORS.secondary, fontSize: 11, fontWeight: "600", marginBottom: 6 },
  label: { color: FORM_COLORS.secondary, fontSize: 11, fontWeight: "600", marginBottom: 6, marginTop: 4 },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#FCFCFA",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: FORM_COLORS.border,
    color: FORM_COLORS.ink,
    fontSize: 14,
    marginBottom: 10,
  },
  selectedClientFields: { marginTop: 11 },
  readOnlyField: { flexDirection: "row", alignItems: "center", gap: 9 },
  readOnlyText: { color: FORM_COLORS.secondary, fontSize: 14 },
  textArea: { minHeight: 92, textAlignVertical: "top", lineHeight: 20 },
  selectButton: {
    minHeight: 47,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#FCFCFA",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: FORM_COLORS.border,
  },
  selectButtonText: { flex: 1, fontSize: 14, color: FORM_COLORS.ink },
  placeholderText: { color: FORM_COLORS.placeholder },
  dateFieldsRow: { flexDirection: "row", gap: 10 },
  dateFieldGroup: { flex: 1 },
  dateField: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    backgroundColor: "#FCFCFA",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: FORM_COLORS.border,
  },
  dateFieldText: { color: FORM_COLORS.ink, fontSize: 13, flexShrink: 1 },
  dateTimeContainer: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  selectDateTimeButton: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: FORM_COLORS.pale, borderRadius: 10, padding: 12, width: "48%", borderWidth: 1, borderColor: FORM_COLORS.border },
  countBadge: { backgroundColor: FORM_COLORS.pale, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 },
  countBadgeText: { color: FORM_COLORS.secondary, fontSize: 10, fontWeight: "700" },
  materialContainer: { backgroundColor: FORM_COLORS.pale, borderRadius: 13, padding: 11, marginBottom: 9, borderWidth: 1, borderColor: FORM_COLORS.border },
  materialHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 9 },
  materialTitle: { fontSize: 11, fontWeight: "700", color: FORM_COLORS.secondary, textTransform: "uppercase", letterSpacing: 0.4 },
  removeMaterialButton: { padding: 4 },
  materialDescriptionInput: { backgroundColor: FORM_COLORS.surface, minHeight: 42, marginBottom: 10 },
  materialRow: { flexDirection: "row", gap: 9 },
  materialField: { flex: 1 },
  materialInput: { flex: 1, marginBottom: 5 },
  currencyField: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, backgroundColor: FORM_COLORS.surface, borderRadius: 10, borderWidth: 1, borderColor: FORM_COLORS.border },
  currencyFieldInput: { flex: 1, minWidth: 0, paddingVertical: 9, color: FORM_COLORS.ink, fontSize: 13 },
  subtotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 5 },
  subtotalLabel: { color: FORM_COLORS.secondary, fontSize: 11, fontWeight: "600" },
  subtotalText: { color: FORM_COLORS.primaryDark, backgroundColor: FORM_COLORS.mint, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, fontSize: 11, fontWeight: "700" },
  addMaterialAction: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 11, borderWidth: 1, borderStyle: "dashed", borderColor: "#9CCFC8", backgroundColor: "#F5FAF8" },
  addMaterialText: { color: FORM_COLORS.primaryDark, fontSize: 12, fontWeight: "700" },
  currencyInputWrap: { minHeight: 47, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: FORM_COLORS.border, backgroundColor: "#FCFCFA", borderRadius: 10, marginBottom: 12 },
  currencySymbol: { color: FORM_COLORS.secondary, fontSize: 15, fontWeight: "600", marginRight: 7 },
  currencyInput: { flex: 1, paddingVertical: 10, color: FORM_COLORS.ink, fontSize: 14 },
  currencyCode: { color: FORM_COLORS.secondary, fontSize: 10, fontWeight: "700" },
  totalContainer: { backgroundColor: FORM_COLORS.pale, borderRadius: 13, padding: 12, marginBottom: 0, borderWidth: 1, borderColor: FORM_COLORS.border },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  totalLabel: { fontSize: 12, color: FORM_COLORS.secondary },
  totalValue: { fontSize: 12, fontWeight: "600", color: FORM_COLORS.ink },
  finalTotal: { borderTopWidth: 1, borderTopColor: FORM_COLORS.border, paddingTop: 10, marginTop: 3, marginBottom: 0 },
  finalTotalLabel: { fontSize: 12, fontWeight: "800", color: FORM_COLORS.ink },
  finalTotalValue: { fontSize: 19, fontWeight: "800", color: FORM_COLORS.primaryDark },
  optionalBadge: { backgroundColor: FORM_COLORS.pale, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  optionalBadgeText: { color: FORM_COLORS.secondary, fontSize: 10, fontWeight: "600" },
  photoDropZone: { minHeight: 128, alignItems: "center", justifyContent: "center", padding: 14, backgroundColor: "#FCFCFA", borderRadius: 13, borderWidth: 1, borderStyle: "dashed", borderColor: "#CAD8D4" },
  photoDropIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: FORM_COLORS.mint, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  photoDropTitle: { color: FORM_COLORS.ink, fontSize: 12, fontWeight: "600", textAlign: "center" },
  photoDropSubtitle: { color: FORM_COLORS.secondary, fontSize: 10, marginTop: 4 },
  photoList: { marginTop: 12 },
  photoPreviewContainer: { marginRight: 10, position: "relative" },
  photoPreview: { width: 84, height: 84, borderRadius: 11 },
  removePhotoButton: { position: "absolute", top: -5, right: -5, backgroundColor: FORM_COLORS.surface, borderRadius: 12, elevation: 3 },
  bottomActionBar: { backgroundColor: FORM_COLORS.surface, borderTopWidth: 1, borderTopColor: FORM_COLORS.border, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  saveButton: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: FORM_COLORS.primary, paddingHorizontal: 16, borderRadius: 13 },
  saveButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  imageButton: { flexDirection: "row", alignItems: "center", backgroundColor: FORM_COLORS.primary, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, marginBottom: 15, justifyContent: "center" },
  imageButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600", marginLeft: 10 },
  modalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(15, 23, 42, 0.42)", padding: 18 },
  modalContent: { backgroundColor: FORM_COLORS.surface, borderRadius: 20, padding: 20, width: "100%", maxWidth: 440, maxHeight: "84%", borderWidth: 1, borderColor: FORM_COLORS.border, elevation: 8 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 19, fontWeight: "700", color: FORM_COLORS.ink, textAlign: "center" },
  workTypeModalTitle: { marginBottom: 18 },
  addNewClientButton: { padding: 5 },
  searchContainer: { flexDirection: "row", alignItems: "center", backgroundColor: FORM_COLORS.pale, borderRadius: 11, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: FORM_COLORS.border },
  searchIcon: { marginRight: 9 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: FORM_COLORS.ink },
  clientList: { flexGrow: 0, flexShrink: 1, minHeight: 80, maxHeight: 360 },
  modalItem: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: FORM_COLORS.border },
  workTypeItem: { borderBottomWidth: 1, borderBottomColor: FORM_COLORS.border, paddingVertical: 3 },
  workTypeRow: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalItemTouchable: { flex: 1, paddingVertical: 5 },
  actionButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: FORM_COLORS.pale },
  workTypeDropdown: { width: 156, alignSelf: "flex-end", backgroundColor: FORM_COLORS.surface, borderRadius: 11, borderWidth: 1, borderColor: FORM_COLORS.border, paddingHorizontal: 5, marginBottom: 7, shadowColor: "#17201F", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 7, elevation: 4 },
  workTypeDropdownOption: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 9 },
  workTypeDropdownText: { color: FORM_COLORS.ink, fontSize: 13, fontWeight: "600" },
  workTypeDeleteText: { color: FORM_COLORS.danger },
  workTypeDropdownDivider: { height: 1, backgroundColor: FORM_COLORS.border, marginHorizontal: 8 },
  modalItemText: { fontSize: 14, color: FORM_COLORS.ink },
  closeModalButton: { backgroundColor: FORM_COLORS.primary, paddingVertical: 12, borderRadius: 11, marginTop: 12, alignItems: "center" },
  closeModalButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  emptyListText: { textAlign: "center", marginTop: 18, fontSize: 14, color: FORM_COLORS.secondary },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, marginTop: 8 },
  addButton: { padding: 5 },
  subModalTitle: { fontSize: 14, fontWeight: "600", color: FORM_COLORS.ink, marginTop: 14, marginBottom: 5 },
  addTypeContainer: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  addTypeInput: { flex: 1, backgroundColor: FORM_COLORS.pale, borderRadius: 10, padding: 12, fontSize: 14, color: FORM_COLORS.ink, borderWidth: 1, borderColor: FORM_COLORS.border, marginRight: 9 },
  addTypeButton: { backgroundColor: FORM_COLORS.primary, padding: 12, borderRadius: 11, justifyContent: "center", alignItems: "center" },
  workTypesList: { flexGrow: 0, flexShrink: 1, maxHeight: 240 },
  timePickerModalContent: { width: "100%", maxWidth: 410, maxHeight: "90%", backgroundColor: FORM_COLORS.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: FORM_COLORS.border, elevation: 8 },
  timePickerHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  timeSelectRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  timeSelectColumn: { flex: 1, minWidth: 0 },
  timeSelectLabel: { color: FORM_COLORS.secondary, fontSize: 11, fontWeight: "700", marginBottom: 6 },
  timePickerSelect: { minHeight: 50, justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: FORM_COLORS.border, backgroundColor: FORM_COLORS.pale, overflow: "hidden" },
  nativeTimePicker: { width: "100%", height: Platform.OS === "ios" ? 130 : 50, color: FORM_COLORS.ink },
  timePickerActions: { flexDirection: "row", gap: 9 },
  timeCancelButton: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: FORM_COLORS.pale },
  timeCancelText: { color: FORM_COLORS.secondary, fontSize: 13, fontWeight: "700" },
  timeConfirmButton: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: FORM_COLORS.primary },
  timeConfirmText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  alertOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.45)", justifyContent: "center", alignItems: "center", padding: 20 },
  alertBox: { backgroundColor: FORM_COLORS.surface, borderRadius: 16, padding: 20, width: "90%", maxWidth: 400, elevation: 5 },
  alertTitle: { fontSize: 18, fontWeight: "700", color: FORM_COLORS.ink, marginBottom: 10, textAlign: "center" },
  alertMessage: { fontSize: 14, color: FORM_COLORS.secondary, marginBottom: 20, textAlign: "center", lineHeight: 21 },
  alertButtons: { flexDirection: "row", justifyContent: "space-around", gap: 10 },
  alertButton: { flex: 1, paddingVertical: 12, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  alertCancelButton: { backgroundColor: FORM_COLORS.pale, borderWidth: 1, borderColor: FORM_COLORS.border },
  alertConfirmButton: { backgroundColor: FORM_COLORS.primary },
  alertDestructiveButton: { backgroundColor: FORM_COLORS.danger },
  alertCancelText: { fontSize: 14, fontWeight: "600", color: FORM_COLORS.secondary },
  alertConfirmText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
})

export default NewWorkScreen
