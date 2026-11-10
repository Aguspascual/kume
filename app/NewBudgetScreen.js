"use client"

import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "../lib/backendStorage"
import DateTimePicker from "@react-native-community/datetimepicker"
import * as FileSystem from "expo-file-system/legacy"
import * as ImagePicker from "expo-image-picker"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useMemo, useState } from "react"
import { SafeAreaView } from "react-native-safe-area-context"
import {
    FlatList,
    Image,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"

const FORM_COLORS = {
    primary: "#0D9488",
    secondary: "#697976",
    danger: "#C1473D",
}

const NewBudgetScreen = () => {
    const [clientes, setClientes] = useState([])
    const [searchText, setSearchText] = useState("")
    const [selectedClient, setSelectedClient] = useState(null)
    const [direccionPresupuesto, setDireccionPresupuesto] = useState("")
    const [descripcionTrabajo, setDescripcionTrabajo] = useState("")
    const [materiales, setMateriales] = useState([{ descripcion: "", cantidad: "", precio: "" }])
    const [costoManoDeObra, setCostoManoDeObra] = useState("")
    const [fechaValidez, setFechaValidez] = useState(new Date())
    const [showDatePicker, setShowDatePicker] = useState(false)
    const [isClientModalVisible, setClientModalVisible] = useState(false)
    const [tipoTrabajo, setTipoTrabajo] = useState(null)
    const [isWorkTypeModalVisible, setWorkTypeModalVisible] = useState(false)
    const [photos, setPhotos] = useState([]) // Estado para las fotos

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

    // useFocusEffect para cargar clientes y tipos de trabajo
    useFocusEffect(
        useCallback(() => {
            fetchClients()
            fetchWorkTypes()
        }, []),
    )

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
        setDireccionPresupuesto(cliente.domicilio || "")
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
               setWorkTypeModalVisible(false) // Solo cierra si no es edición o podrías esperar al guardado
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
        setOpenWorkTypeMenuIndex(null)
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
            // Falta opción extra para galería que requiere un botón extra, pero lo hacemos simple aquí.
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

    const formatCurrencyInput = (value) => {
        const digits = String(value ?? "").replace(/\D/g, "")
        return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    }

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
        return Math.round(Number(amount) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }

    // Calcular el total general
    const calculateTotal = () => {
        const materialsTotal = calculateMaterialsTotal()
        const laborCost = parseCurrencyInput(costoManoDeObra)
        return materialsTotal + laborCost
    }

    // Función para enviar presupuesto por WhatsApp
    const sendBudgetWhatsApp = (budgetData) => {
        if (!selectedClient?.telefono) {
            showCustomAlert("Error", "El cliente no tiene número de teléfono registrado.")
            return
        }

        const materialsText = budgetData.materiales
            .map(
                (m) =>
                    `• ${m.descripcion} - Cant: ${m.cantidad} - $${formatCurrency(Number.parseFloat(m.cantidad) * parseCurrencyInput(m.precio))}`,
            )
            .join("\n")

        const message = `🔧 *PRESUPUESTO DE TRABAJO*

👤 *Cliente:* ${budgetData.clienteNombre}
🏠 *Dirección:* ${budgetData.direccion}
📋 *Tipo:* ${budgetData.tipoTrabajo}
📝 *Descripción:* ${budgetData.descripcionTrabajo}

💰 *DETALLE DE COSTOS:*

🛠️ *Materiales:*
${materialsText}

👷 *Mano de Obra:* $${formatCurrency(budgetData.costoManoDeObra)}

💵 *TOTAL:* $${formatCurrency(budgetData.total)}`

        const phoneNumber = selectedClient.telefono.replace(/\D/g, "")
        const whatsappUrl = `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`

        Linking.canOpenURL(whatsappUrl).then((supported) => {
            if (supported) {
                Linking.openURL(whatsappUrl)
            } else {
                showCustomAlert("Error", "WhatsApp no está instalado en este dispositivo.")
            }
        })
    }

    // Manejador para guardar un nuevo presupuesto
    const handleSaveBudget = async () => {
        // Validar que los campos obligatorios estén llenos
        if (!selectedClient || !descripcionTrabajo || !tipoTrabajo) {
            showCustomAlert("Error", "El cliente, tipo y descripción del trabajo son obligatorios.")
            return
        }

        // Validar que al menos un material tenga datos
        const validMaterials = materiales.filter((m) => m.descripcion.trim() !== "")
        if (validMaterials.length === 0) {
            showCustomAlert("Error", "Debe agregar al menos un material.")
            return
        }

        try {
            // Mover las fotos a un directorio persistente
            const persistentPhotos = await Promise.all(
                photos.map(async (photo) => {
                    const fileName = photo.uri.split("/").pop()
                    const newUri = `${FileSystem.documentDirectory}photos/${fileName}`
                    try {
                        await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}photos/`, { intermediates: true })
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

            // Crear el objeto del nuevo presupuesto
            const newBudget = {
                // La acción del usuario crea el presupuesto; el ID no se genera durante el render.
                // eslint-disable-next-line react-hooks/purity -- ID is created only after the user saves the budget.
                id: Date.now().toString(),
                clienteId: selectedClient.id,
                clienteNombre: `${selectedClient.nombre} ${selectedClient.apellido}`,
                telefono: selectedClient.telefono,
                direccion: direccionPresupuesto,
                tipoTrabajo: tipoTrabajo,
                descripcionTrabajo: descripcionTrabajo,
                materiales: validMaterials.map((material) => ({
                    ...material,
                    precio: String(parseCurrencyInput(material.precio)),
                })),
                costoManoDeObra: parseCurrencyInput(costoManoDeObra),
                totalMateriales: calculateMaterialsTotal(),
                total: calculateTotal(),
                fechaValidez: fechaValidez.toISOString(),
                fechaCreacion: new Date().toISOString(),
                estado: "Pendiente",
                photos: persistentPhotos.filter((uri) => uri !== null),
            }

            // Obtener presupuestos existentes y agregar el nuevo
            const existingBudgetsJSON = await AsyncStorage.getItem("presupuestos")
            const existingBudgets = existingBudgetsJSON ? JSON.parse(existingBudgetsJSON) : []
            const updatedBudgets = [...existingBudgets, newBudget]
            await AsyncStorage.setItem("presupuestos", JSON.stringify(updatedBudgets))

            // Mostrar opciones después de guardar
            showCustomAlert("Presupuesto Guardado", "¿Desea enviar el presupuesto por WhatsApp?", {
                confirmText: "Enviar por WhatsApp",
                cancelText: "Solo Guardar",
                onCancel: () => {
                    hideCustomAlert()
                    resetForm()
                    router.replace("/")
                },
                onConfirm: () => {
                    hideCustomAlert()
                    sendBudgetWhatsApp(newBudget)
                    resetForm()
                    router.replace("/")
                }
            })
        } catch (error) {
            console.error("Error al guardar el presupuesto:", error)
            showCustomAlert("Error", "No se pudo guardar el presupuesto.")
        }
    }

    // Función para limpiar el formulario
    const resetForm = () => {
        setSelectedClient(null)
        setDireccionPresupuesto("")
        setDescripcionTrabajo("")
        setMateriales([{ descripcion: "", cantidad: "", precio: "" }])
        setCostoManoDeObra("")
        setFechaValidez(new Date())
        setSearchText("")
        setTipoTrabajo(null)
        setPhotos([])
    }

    // Renderiza cada item de la lista de clientes en el modal
    const renderClientItem = ({ item }) => (
        <TouchableOpacity style={styles.modalItem} onPress={() => handleClientSelect(item)}>
            <Text style={styles.modalItemText}>
                {item?.nombre || ""} {item?.apellido || ""}
            </Text>
        </TouchableOpacity>
    )

    // Renderiza cada material en la lista
    const renderMaterialItem = ({ item, index }) => (
        <View style={styles.materialContainer}>
            <View style={styles.materialHeader}>
                <Text style={styles.materialTitle}>Material {index + 1}</Text>
                {materiales.length > 1 && (
                    <TouchableOpacity onPress={() => removeMaterial(index)} style={styles.removeMaterialButton}>
                        <Ionicons name="trash-outline" size={20} color="#C42A2A" />
                    </TouchableOpacity>
                )}
            </View>

            <TextInput
                style={styles.input}
                value={item.descripcion}
                onChangeText={(value) => updateMaterial(index, "descripcion", value)}
                placeholder="Descripción del material"
                placeholderTextColor="#999"
            />

            <View style={styles.materialRow}>
                <View style={[styles.input, styles.quantityInputWrap]}>
                    <TextInput style={styles.quantityInput} value={item.cantidad} onChangeText={(value) => updateMaterial(index, "cantidad", value)} placeholder="Cantidad" placeholderTextColor="#9AA9A3" keyboardType="numeric" />
                    <Text style={styles.inputUnit}>un.</Text>
                </View>
                <View style={[styles.input, styles.moneyInputWrap, styles.materialMoneyInput]}>
                    <Text style={styles.currencyPrefix}>$</Text>
                    <TextInput style={styles.moneyInput} value={item.precio ? formatCurrencyInput(item.precio) : ""} onChangeText={(value) => updateMaterial(index, "precio", formatCurrencyInput(value))} placeholder="Precio c/u" placeholderTextColor="#9AA9A3" keyboardType="numeric" />
                </View>
            </View>

            {item.cantidad !== "" && item.precio !== "" && (
                <Text style={styles.subtotalText}>
                    Subtotal: ${formatCurrency(Number.parseFloat(item.cantidad) * parseCurrencyInput(item.precio))}
                </Text>
            )}
        </View>
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

    return (
        <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.replace("/")} style={styles.backButton} accessibilityLabel="Volver">
                        <Ionicons name="arrow-back" size={22} color="#183D38" />
                    </TouchableOpacity>
                    <View style={styles.headerCopy}>
                        <Text style={styles.title}>Cotizar</Text>
                        <Text style={styles.headerSubtitle}>Armá un presupuesto claro y detallado</Text>
                    </View>
                    <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>NUEVO</Text></View>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <View style={styles.card}>
                        <View style={styles.cardHeading}>
                            <View style={styles.iconBadge}><Ionicons name="person-outline" size={19} color="#246B5C" /></View>
                            <View><Text style={styles.cardTitle}>Cliente</Text><Text style={styles.cardSubtitle}>¿Para quién es este presupuesto?</Text></View>
                        </View>
                        <Text style={styles.label}>Cliente asignado</Text>
                        <TouchableOpacity style={styles.selectButton} onPress={() => setClientModalVisible(true)}>
                            <View style={styles.selectCopy}>
                                <Text style={[styles.selectButtonText, !selectedClient && styles.placeholderText]}>
                                    {selectedClient ? `${selectedClient.nombre || ""} ${selectedClient.apellido || ""}` : "Seleccionar cliente"}
                                </Text>
                                {selectedClient && <Text style={styles.selectHint}>Tocá para cambiar</Text>}
                            </View>
                            <Ionicons name="chevron-down" size={19} color="#678078" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.inlineAction} onPress={() => { setClientModalVisible(false); router.push("NewClientScreen") }}>
                            <Ionicons name="add-circle-outline" size={18} color="#246B5C" />
                            <Text style={styles.inlineActionText}>Crear nuevo cliente</Text>
                        </TouchableOpacity>
                        {selectedClient && <View style={styles.clientDetails}>
                            <View style={styles.fieldBlock}>
                                <Text style={styles.label}>Domicilio del trabajo</Text>
                                <TextInput style={styles.input} value={direccionPresupuesto} onChangeText={setDireccionPresupuesto} placeholder="Calle y número" placeholderTextColor="#9AA9A3" />
                            </View>
                            <View style={styles.fieldBlock}>
                                <Text style={styles.label}>Teléfono de contacto</Text>
                                <View style={styles.readOnlyField}><Ionicons name="call-outline" size={17} color="#75877F" /><Text style={styles.readOnlyText}>{selectedClient?.telefono || "Sin teléfono registrado"}</Text></View>
                            </View>
                        </View>}
                    </View>

                    <View style={styles.card}>
                        <View style={styles.cardHeading}>
                            <View style={styles.iconBadge}><Ionicons name="document-text-outline" size={19} color="#246B5C" /></View>
                            <View><Text style={styles.cardTitle}>Trabajo</Text><Text style={styles.cardSubtitle}>Describí qué servicio vas a realizar</Text></View>
                        </View>
                        <Text style={styles.label}>Tipo de trabajo</Text>
                        <TouchableOpacity style={styles.selectButton} onPress={() => setWorkTypeModalVisible(true)}>
                            <Text style={[styles.selectButtonText, !tipoTrabajo && styles.placeholderText]}>{tipoTrabajo || "Elegir tipo de trabajo"}</Text>
                            <Ionicons name="chevron-down" size={19} color="#678078" />
                        </TouchableOpacity>
                        <Text style={styles.label}>Descripción</Text>
                        <TextInput style={[styles.input, styles.textArea]} value={descripcionTrabajo} onChangeText={setDescripcionTrabajo} placeholder="Contá brevemente qué trabajo hay que hacer..." placeholderTextColor="#9AA9A3" multiline />
                        <Text style={styles.label}>Válido hasta</Text>
                        <TouchableOpacity style={styles.selectButton} onPress={() => setShowDatePicker(true)}>
                            <View style={styles.dateSelectCopy}><Ionicons name="calendar-outline" size={18} color="#246B5C" /><Text style={styles.selectButtonText}>{fechaValidez.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}</Text></View>
                            <Ionicons name="chevron-down" size={19} color="#678078" />
                        </TouchableOpacity>
                        {showDatePicker && <DateTimePicker value={fechaValidez} mode="date" display={Platform.OS === "ios" ? "spinner" : "default"} onValueChange={(event, selectedDate) => { setShowDatePicker(false); if (selectedDate) setFechaValidez(selectedDate) }} onDismiss={() => setShowDatePicker(false)} />}
                    </View>

                    <View style={styles.card}>
                        <View style={styles.cardHeadingRow}>
                            <View style={styles.cardHeading}>
                                <View style={styles.iconBadge}><Ionicons name="cube-outline" size={19} color="#246B5C" /></View>
                                <View><Text style={styles.cardTitle}>Materiales</Text><Text style={styles.cardSubtitle}>Agregá insumos y cantidades</Text></View>
                            </View>
                            <View style={styles.countBadge}><Text style={styles.countBadgeText}>{materiales.length}</Text></View>
                        </View>
                        <FlatList data={materiales} renderItem={renderMaterialItem} keyExtractor={(item, index) => index.toString()} scrollEnabled={false} />
                        <TouchableOpacity onPress={addMaterial} style={styles.addMaterialButton}>
                            <Ionicons name="add" size={19} color="#246B5C" /><Text style={styles.addMaterialText}>Agregar material</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.card}>
                        <View style={styles.cardHeading}>
                            <View style={styles.iconBadge}><Ionicons name="calculator-outline" size={19} color="#246B5C" /></View>
                            <View><Text style={styles.cardTitle}>Costos</Text><Text style={styles.cardSubtitle}>Revisá el resumen del presupuesto</Text></View>
                        </View>
                        <Text style={styles.label}>Mano de obra</Text>
                        <View style={styles.moneyInputWrap}>
                            <Text style={styles.currencyPrefix}>$</Text>
                            <TextInput style={styles.moneyInput} value={costoManoDeObra ? formatCurrencyInput(costoManoDeObra) : ""} onChangeText={(value) => setCostoManoDeObra(formatCurrencyInput(value))} placeholder="0" placeholderTextColor="#9AA9A3" keyboardType="numeric" />
                        </View>
                        <View style={styles.totalContainer}>
                            <View style={styles.totalRow}><Text style={styles.totalLabel}>Materiales</Text><Text style={styles.totalValue}>${formatCurrency(calculateMaterialsTotal())}</Text></View>
                            <View style={styles.totalRow}><Text style={styles.totalLabel}>Mano de obra</Text><Text style={styles.totalValue}>${formatCurrency(parseCurrencyInput(costoManoDeObra))}</Text></View>
                            <View style={[styles.totalRow, styles.finalTotal]}><Text style={styles.finalTotalLabel}>Total estimado</Text><Text style={styles.finalTotalValue}>${formatCurrency(calculateTotal())}</Text></View>
                        </View>
                    </View>

                    <View style={styles.card}>
                        <View style={styles.cardHeading}>
                            <View style={styles.iconBadge}><Ionicons name="images-outline" size={19} color="#246B5C" /></View>
                            <View><Text style={styles.cardTitle}>Fotos y planos</Text><Text style={styles.cardSubtitle}>Opcional · Sumá referencias del trabajo</Text></View>
                        </View>
                        <TouchableOpacity style={styles.imageButton} onPress={handlePickImage}>
                            <Ionicons name="cloud-upload-outline" size={23} color="#246B5C" />
                            <Text style={styles.imageButtonText}>Agregar fotos</Text>
                            <Text style={styles.uploadHint}>JPG o PNG</Text>
                        </TouchableOpacity>
                        {photos.length > 0 && <FlatList data={photos} renderItem={renderPhotoItem} keyExtractor={(item, index) => index.toString()} horizontal showsHorizontalScrollIndicator={false} style={styles.photoList} />}
                    </View>
                    <View style={styles.bottomNote}><Ionicons name="shield-checkmark-outline" size={16} color="#648078" /><Text style={styles.bottomNoteText}>Revisá los datos antes de guardar el presupuesto.</Text></View>
                </ScrollView>
                <View style={styles.footer}>
                    <TouchableOpacity style={styles.saveButton} onPress={handleSaveBudget}>
                        <Text style={styles.saveButtonText}>Guardar presupuesto</Text>
                        <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
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
                                            <TouchableOpacity style={styles.workTypeDropdownOption} onPress={() => startEditingWorkType(index)}>
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

// Estilos del componente
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#F6F5EF" },
    screen: { flex: 1 },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18, backgroundColor: "#F6F5EF" },
    backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#E9EEE7", alignItems: "center", justifyContent: "center", marginRight: 13 },
    headerCopy: { flex: 1 },
    title: { fontSize: 23, fontWeight: "800", color: "#183D38", letterSpacing: -0.4 },
    headerSubtitle: { color: "#75847C", fontSize: 12, marginTop: 2 },
    headerBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: "#E3EEE7" },
    headerBadgeText: { fontSize: 9, fontWeight: "800", color: "#397263", letterSpacing: 0.8 },
    scrollContent: { paddingHorizontal: 18, paddingBottom: 26 },
    sectionHeading: { paddingTop: 6, paddingBottom: 18 },
    eyebrow: { color: "#618176", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 6 },
    pageHeading: { color: "#183D38", fontSize: 25, fontWeight: "800", letterSpacing: -0.6 },
    pageDescription: { color: "#75847C", fontSize: 13, marginTop: 5 },
    card: { backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#E8E9E1", padding: 17, marginBottom: 14, shadowColor: "#183D38", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.035, shadowRadius: 10, elevation: 1 },
    cardHeading: { flexDirection: "row", alignItems: "center", marginBottom: 17, gap: 11 },
    cardHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
    iconBadge: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#EAF2EC", alignItems: "center", justifyContent: "center" },
    cardTitle: { color: "#1A3D37", fontSize: 16, fontWeight: "750" },
    cardSubtitle: { color: "#84918A", fontSize: 11, marginTop: 3 },
    label: { color: "#53665E", fontSize: 11, fontWeight: "700", marginBottom: 7, marginTop: 3 },
    selectButton: { minHeight: 52, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#FBFCFA", borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 12, borderWidth: 1, borderColor: "#E6EAE4" },
    selectCopy: { flex: 1 },
    selectButtonText: { fontSize: 13, color: "#1F4039", fontWeight: "600" },
    selectHint: { color: "#8A9890", fontSize: 10, marginTop: 3 },
    placeholderText: { color: "#A0AAA4", fontWeight: "400" },
    inlineAction: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, paddingVertical: 3, marginBottom: 5 },
    inlineActionText: { color: "#246B5C", fontSize: 12, fontWeight: "700" },
    clientDetails: { borderTopWidth: 1, borderTopColor: "#EDF0EB", marginTop: 14, paddingTop: 13 },
    fieldBlock: { marginBottom: 8 },
    input: { minHeight: 48, backgroundColor: "#FBFCFA", borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, fontSize: 13, marginBottom: 12, color: "#1F4039", borderWidth: 1, borderColor: "#E6EAE4" },
    readOnlyField: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, backgroundColor: "#F4F6F2", borderRadius: 12 },
    readOnlyText: { color: "#718078", fontSize: 13 },
    textArea: { height: 96, textAlignVertical: "top" },
    dateSelectCopy: { flexDirection: "row", alignItems: "center", gap: 9 },
    countBadge: { width: 27, height: 27, borderRadius: 9, backgroundColor: "#EFF3ED", alignItems: "center", justifyContent: "center" },
    countBadgeText: { fontSize: 12, fontWeight: "800", color: "#58766A" },
    materialContainer: { backgroundColor: "#FBFCFA", borderRadius: 15, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: "#E9EDE7" },
    materialHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    materialTitle: { fontSize: 12, fontWeight: "700", color: "#53665E" },
    removeMaterialButton: { padding: 3 },
    materialRow: { flexDirection: "row", gap: 8 },
    quantityInputWrap: { flex: 0.83, flexDirection: "row", alignItems: "center", paddingHorizontal: 11, paddingVertical: 0, minHeight: 45, marginBottom: 9 },
    quantityInput: { flex: 1, paddingVertical: 10, fontSize: 12, color: "#1F4039" },
    inputUnit: { fontSize: 10, color: "#8C9992" },
    moneyInputWrap: { flexDirection: "row", alignItems: "center", minHeight: 45, paddingHorizontal: 11, paddingVertical: 0, marginBottom: 9 },
    materialMoneyInput: { flex: 1.17 },
    currencyPrefix: { fontSize: 13, color: "#658076", fontWeight: "700", marginRight: 7 },
    moneyInput: { flex: 1, minWidth: 0, paddingVertical: 10, fontSize: 13, color: "#1F4039", fontWeight: "600" },
    subtotalText: { fontSize: 11, fontWeight: "700", color: "#5C776C", textAlign: "right", marginTop: 1 },
    addMaterialButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 42, gap: 6, borderWidth: 1, borderStyle: "dashed", borderColor: "#A9C2B3", borderRadius: 12, marginTop: 1 },
    addMaterialText: { color: "#397263", fontSize: 12, fontWeight: "700" },
    totalContainer: { backgroundColor: "#F5F7F2", borderRadius: 15, padding: 15, marginTop: 9, marginBottom: 1 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
    totalLabel: { fontSize: 12, color: "#74827A" },
    totalValue: { fontSize: 12, fontWeight: "650", color: "#38574D" },
    finalTotal: { borderTopWidth: 1, borderTopColor: "#DCE4DA", paddingTop: 12, marginTop: 2, marginBottom: 0 },
    finalTotalLabel: { fontSize: 14, fontWeight: "800", color: "#1D433B" },
    finalTotalValue: { fontSize: 19, fontWeight: "800", color: "#1D6253" },
    imageButton: { minHeight: 66, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAF7", borderWidth: 1, borderStyle: "dashed", borderColor: "#A9C2B3", borderRadius: 14, gap: 8, marginBottom: 4 },
    imageButtonText: { color: "#397263", fontSize: 12, fontWeight: "700" },
    uploadHint: { color: "#95A199", fontSize: 10 },
    photoList: { marginTop: 12, marginBottom: 2 },
    photoPreviewContainer: { marginRight: 10, position: "relative" },
    photoPreview: { width: 88, height: 88, borderRadius: 12 },
    removePhotoButton: { position: "absolute", top: -5, right: -5, backgroundColor: "#FFF", borderRadius: 12 },
    bottomNote: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 5 },
    bottomNoteText: { color: "#75847C", fontSize: 10 },
    footer: { paddingHorizontal: 18, paddingTop: 11, paddingBottom: Platform.OS === "ios" ? 8 : 12, backgroundColor: "#F6F5EF", borderTopWidth: 1, borderTopColor: "#E8E9E1" },
    saveButton: { minHeight: 53, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, backgroundColor: "#216454", paddingHorizontal: 18, borderRadius: 15 },
    saveButtonText: { color: "#FFF", fontSize: 14, fontWeight: "800" },
    modalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(18, 40, 35, 0.48)", padding: 20 },
    modalContent: { backgroundColor: "#FFF", borderRadius: 20, padding: 21, width: "100%", maxWidth: 460, maxHeight: "78%", elevation: 8 },
    modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
    modalTitle: { fontSize: 19, fontWeight: "800", color: "#1A3D37", textAlign: "center" },
    addNewClientButton: { padding: 5 },
    searchContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#F5F7F2", borderRadius: 12, paddingHorizontal: 13, marginBottom: 13, borderWidth: 1, borderColor: "#E6EAE4" },
    searchIcon: { marginRight: 9 },
    searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: "#1F4039" },
    modalItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: "#EDF0EB" },
    workTypeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#EDF0EB", paddingVertical: 9 },
    modalItemTouchable: { flex: 1, paddingVertical: 5 },
    actionButton: { padding: 8, marginLeft: 8, backgroundColor: "#F2F5F0", borderRadius: 8 },
    modalItemText: { fontSize: 14, color: "#294A41" },
    closeModalButton: { backgroundColor: "#216454", padding: 13, borderRadius: 12, marginTop: 16, alignItems: "center" },
    closeModalButtonText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
    emptyListText: { textAlign: "center", marginTop: 20, fontSize: 13, color: "#8A9890" },
    subModalTitle: { fontSize: 13, fontWeight: "700", color: "#53665E", marginTop: 13, marginBottom: 5 },
    addTypeContainer: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
    addTypeInput: { flex: 1, backgroundColor: "#FBFCFA", borderRadius: 12, padding: 12, fontSize: 14, color: "#1F4039", borderWidth: 1, borderColor: "#E6EAE4", marginRight: 9 },
    addTypeButton: { backgroundColor: "#216454", padding: 12, borderRadius: 12, justifyContent: "center", alignItems: "center" },
    workTypesList: { maxHeight: 200 },
    alertOverlay: { flex: 1, backgroundColor: "rgba(18, 40, 35, 0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
    alertBox: { backgroundColor: "#FFF", borderRadius: 18, padding: 21, width: "90%", maxWidth: 400, elevation: 5 },
    alertTitle: { fontSize: 17, fontWeight: "800", color: "#1A3D37", marginBottom: 9, textAlign: "center" },
    alertMessage: { fontSize: 14, color: "#64736B", marginBottom: 18, textAlign: "center", lineHeight: 21 },
    alertButtons: { flexDirection: "row", justifyContent: "space-around", gap: 9 },
    alertButton: { flex: 1, minHeight: 46, paddingHorizontal: 6, paddingVertical: 7, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    alertCancelButton: { backgroundColor: "#F5F7F2", borderWidth: 1, borderColor: "#E6EAE4" },
    alertConfirmButton: { backgroundColor: "#216454" },
    alertDestructiveButton: { backgroundColor: "#A64238" },
    alertCancelText: { fontSize: 14, fontWeight: "700", color: "#52645B", textAlign: "center", lineHeight: 17, flexShrink: 1 },
    alertConfirmText: { fontSize: 14, fontWeight: "700", color: "#FFF", textAlign: "center", lineHeight: 17, flexShrink: 1 },
});

export default NewBudgetScreen;
