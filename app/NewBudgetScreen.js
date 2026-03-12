"use client"

import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import DateTimePicker from "@react-native-community/datetimepicker"
import * as FileSystem from "expo-file-system"
import * as ImagePicker from "expo-image-picker"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import {
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"

const NewBudgetScreen = () => {
    const [clientes, setClientes] = useState([])
    const [filteredClientes, setFilteredClientes] = useState([])
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
            setFilteredClientes(clientesArray)
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

    // useEffect para filtrar los clientes cuando el texto de búsqueda cambia
    useEffect(() => {
        if (searchText === "") {
            setFilteredClientes(clientes)
        } else {
            const filtered = clientes.filter(
                (cliente) =>
                    cliente.nombre.toLowerCase().includes(searchText.toLowerCase()) ||
                    cliente.apellido.toLowerCase().includes(searchText.toLowerCase()),
            )
            setFilteredClientes(filtered)
        }
    }, [searchText, clientes])

    // Manejador para seleccionar un cliente de la lista modal
    const handleClientSelect = (cliente) => {
        setSelectedClient(cliente)
        setDireccionPresupuesto(cliente.domicilio || "")
        setClientModalVisible(false)
    }

    // Manejador para seleccionar un tipo de trabajo
    const handleWorkTypeSelect = (type) => {
        setTipoTrabajo(type)
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

    // Calcular el total de materiales
    const calculateMaterialsTotal = () => {
        return materiales.reduce((total, material) => {
            const cantidad = Number.parseFloat(material.cantidad) || 0
            const precio = Number.parseFloat(material.precio) || 0
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
        const laborCost = Number.parseFloat(costoManoDeObra) || 0
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
                    `• ${m.descripcion} - Cant: ${m.cantidad} - $${formatCurrency(Number.parseFloat(m.cantidad) * Number.parseFloat(m.precio))}`,
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
                id: Date.now().toString(),
                clienteId: selectedClient.id,
                clienteNombre: `${selectedClient.nombre} ${selectedClient.apellido}`,
                telefono: selectedClient.telefono,
                direccion: direccionPresupuesto,
                tipoTrabajo: tipoTrabajo,
                descripcionTrabajo: descripcionTrabajo,
                materiales: validMaterials,
                costoManoDeObra: Number.parseFloat(costoManoDeObra) || 0,
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
                <TextInput
                    style={[styles.input, styles.materialInput]}
                    value={item.cantidad}
                    onChangeText={(value) => updateMaterial(index, "cantidad", value)}
                    placeholder="Cantidad"
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                />
                <TextInput
                    style={[styles.input, styles.materialInput]}
                    value={item.precio}
                    onChangeText={(value) => updateMaterial(index, "precio", value)}
                    placeholder="Precio c/u"
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                />
            </View>

            {item.cantidad !== "" && item.precio !== "" && (
                <Text style={styles.subtotalText}>
                    Subtotal: ${formatCurrency(Number.parseFloat(item.cantidad) * Number.parseFloat(item.precio))}
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
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.replace("/")} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={28} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.title}>Nuevo Presupuesto</Text>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.formContainer}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.label}>Cliente</Text>
                    <TouchableOpacity style={styles.selectButton} onPress={() => setClientModalVisible(true)}>
                        <Text style={styles.selectButtonText}>
                            {selectedClient
                                ? `${selectedClient.nombre || ""} ${selectedClient.apellido || ""}`
                                : "Seleccionar cliente"}
                        </Text>
                        <Ionicons name="chevron-down" size={20} color="#2F4550" />
                    </TouchableOpacity>

                    {selectedClient && (
                        <View>
                            <Text style={styles.label}>Dirección del Trabajo</Text>
                            <TextInput
                                style={styles.input}
                                value={direccionPresupuesto}
                                onChangeText={setDireccionPresupuesto}
                                placeholder="Dirección donde se realizará el trabajo"
                                placeholderTextColor="#999"
                            />
                            <Text style={styles.label}>Teléfono</Text>
                            <TextInput
                                style={styles.input}
                                value={selectedClient?.telefono || ""}
                                editable={false}
                                placeholderTextColor="#999"
                            />
                        </View>
                    )}

                    <Text style={styles.label}>Tipo de Trabajo</Text>
                    <TouchableOpacity style={styles.selectButton} onPress={() => setWorkTypeModalVisible(true)}>
                        <Text style={styles.selectButtonText}>{tipoTrabajo || "Seleccionar tipo de trabajo"}</Text>
                        <Ionicons name="chevron-down" size={20} color="#2F4550" />
                    </TouchableOpacity>

                    <Text style={styles.label}>Descripción del Trabajo</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        value={descripcionTrabajo}
                        onChangeText={setDescripcionTrabajo}
                        placeholder="Describe detalladamente el trabajo a realizar"
                        placeholderTextColor="#999"
                        multiline
                    />

                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Materiales</Text>
                        <TouchableOpacity onPress={addMaterial} style={styles.addButton}>
                            <Ionicons name="add-circle" size={28} color="#2F4550" />
                        </TouchableOpacity>
                    </View>

                    <FlatList
                        data={materiales}
                        renderItem={renderMaterialItem}
                        keyExtractor={(item, index) => index.toString()}
                        scrollEnabled={false}
                    />

                    <Text style={styles.label}>Costo de Mano de Obra</Text>
                    <TextInput
                        style={styles.input}
                        value={costoManoDeObra}
                        onChangeText={setCostoManoDeObra}
                        placeholder="Costo de la mano de obra"
                        placeholderTextColor="#999"
                        keyboardType="numeric"
                    />
                    <Text style={styles.label}>Válido hasta</Text>
                    <TouchableOpacity style={styles.selectButton} onPress={() => setShowDatePicker(true)}>
                        <Text style={styles.selectButtonText}>{fechaValidez.toLocaleDateString()}</Text>
                        <Ionicons name="calendar" size={20} color="#2F4550" />
                    </TouchableOpacity>

                    {showDatePicker && (
                        <DateTimePicker
                            value={fechaValidez}
                            mode="date"
                            display={Platform.OS === "ios" ? "spinner" : "default"}
                            onChange={(event, selectedDate) => {
                                setShowDatePicker(false)
                                if (selectedDate) setFechaValidez(selectedDate)
                            }}
                        />
                    )}

                    {/* Resumen de totales */}
                    <View style={styles.totalContainer}>
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>Materiales:</Text>
                            <Text style={styles.totalValue}>${formatCurrency(calculateMaterialsTotal())}</Text>
                        </View>
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>Mano de Obra:</Text>
                            <Text style={styles.totalValue}>${formatCurrency(costoManoDeObra)}</Text>
                        </View>
                        <View style={[styles.totalRow, styles.finalTotal]}>
                            <Text style={styles.finalTotalLabel}>TOTAL:</Text>
                            <Text style={styles.finalTotalValue}>${formatCurrency(calculateTotal())}</Text>
                        </View>
                    </View>

                    {/* Sección de fotos */}
                    <Text style={styles.label}>Fotos</Text>
                    <TouchableOpacity style={styles.imageButton} onPress={handlePickImage}>
                        <Ionicons name="image" size={24} color="#fff" />
                        <Text style={styles.imageButtonText}>Agregar Fotos</Text>
                    </TouchableOpacity>

                    {photos.length > 0 && (
                        <FlatList
                            data={photos}
                            renderItem={renderPhotoItem}
                            keyExtractor={(item, index) => index.toString()}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.photoList}
                        />
                    )}

                    <TouchableOpacity style={styles.saveButton} onPress={handleSaveBudget}>
                        <Text style={styles.saveButtonText}>Guardar Presupuesto</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Modal para seleccionar clientes */}
            <Modal
                animationType="slide"
                transparent={true}
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
                visible={isWorkTypeModalVisible}
                onRequestClose={() => setWorkTypeModalVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Tipo de Trabajo</Text>
                        
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
                                <View style={styles.workTypeRow}>
                                    <TouchableOpacity style={styles.modalItemTouchable} onPress={() => handleWorkTypeSelect(item)}>
                                        <Text style={styles.modalItemText}>{item}</Text>
                                    </TouchableOpacity>
                                    <View style={styles.workTypeActions}>
                                        <TouchableOpacity onPress={() => startEditingWorkType(index)} style={styles.actionButton}>
                                            <Ionicons name="pencil" size={20} color="#2196F3" />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => handleDeleteWorkType(index)} style={styles.actionButton}>
                                            <Ionicons name="trash" size={20} color="#F44336" />
                                        </TouchableOpacity>
                                    </View>
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
    container: {
        flex: 1,
        backgroundColor: "#F8F9FA",
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 30,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#2F4550",
        paddingHorizontal: 20,
        paddingVertical: 15,
        paddingBottom: 40,
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
        marginRight: 15,
    },
    title: {
        fontSize: 24,
        fontWeight: "700",
        color: "#FFF",
        flex: 1,
        textAlign: "center",
        marginRight: 40,
    },
    formContainer: {
        flex: 1,
        backgroundColor: "#FFF",
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: 25,
        marginTop: -20,
    },
    label: {
        fontSize: 16,
        fontWeight: "600",
        color: "#2F4550",
        marginBottom: 8,
        marginTop: 5,
    },
    input: {
        backgroundColor: "#F5F7FA",
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        marginBottom: 20,
        color: "#2F4550",
        borderWidth: 1,
        borderColor: "#E1E5EA",
    },
    textArea: {
        height: 100,
        textAlignVertical: "top",
    },
    selectButton: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#F5F7FA",
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: "#E1E5EA",
    },
    selectButtonText: {
        fontSize: 16,
        color: "#2F4550",
    },
    saveButton: {
        backgroundColor: "#2F4550",
        padding: 18,
        borderRadius: 12,
        alignItems: "center",
        marginTop: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
    },
    saveButtonText: {
        color: "#FFF",
        fontSize: 18,
        fontWeight: "600",
    },
    modalContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    modalContent: {
        backgroundColor: "#FFF",
        borderRadius: 20,
        padding: 25,
        width: "85%",
        maxHeight: "70%",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 15,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: "700",
        color: "#2F4550",
        textAlign: "center",
    },
    addNewClientButton: {
        padding: 5,
    },
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F5F7FA",
        borderRadius: 12,
        paddingHorizontal: 15,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: "#E1E5EA",
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 12,
        fontSize: 16,
        color: "#2F4550",
    },
    modalItem: {
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: "#E1E5EA",
    },
    workTypeRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: "#E1E5EA",
        paddingVertical: 10,
    },
    modalItemTouchable: {
        flex: 1,
        paddingVertical: 5,
    },
    workTypeActions: {
        flexDirection: "row",
        alignItems: "center",
    },
    actionButton: {
        padding: 8,
        marginLeft: 10,
        backgroundColor: "#F5F7FA",
        borderRadius: 8,
    },
    modalItemText: {
        fontSize: 16,
        color: "#2F4550",
    },
    closeModalButton: {
        backgroundColor: "#2F4550",
        padding: 15,
        borderRadius: 12,
        marginTop: 20,
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 5,
    },
    closeModalButtonText: {
        color: "#FFF",
        fontSize: 16,
        fontWeight: "600",
    },
    emptyListText: {
        textAlign: "center",
        marginTop: 20,
        fontSize: 16,
        color: "#999",
    },
    sectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 15,
        marginTop: 10,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#2F4550",
    },
    addButton: {
        padding: 5,
    },
    materialContainer: {
        backgroundColor: "#F8F9FA",
        borderRadius: 12,
        padding: 15,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: "#E1E5EA",
    },
    materialHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },
    materialTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#2F4550",
    },
    removeMaterialButton: {
        padding: 5,
    },
    materialRow: {
        flexDirection: "row",
        justifyContent: "space-between",
    },
    materialInput: {
        width: "48%",
        marginBottom: 10,
    },
    subtotalText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#2F4550",
        textAlign: "right",
        marginTop: -10,
    },
    totalContainer: {
        backgroundColor: "#F8F9FA",
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
        borderWidth: 2,
        borderColor: "#E1E5EA",
    },
    totalRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 8,
    },
    totalLabel: {
        fontSize: 16,
        color: "#2F4550",
    },
    totalValue: {
        fontSize: 16,
        fontWeight: "600",
        color: "#2F4550",
    },
    finalTotal: {
        borderTopWidth: 2,
        borderTopColor: "#2F4550",
        paddingTop: 10,
        marginTop: 10,
    },
    finalTotalLabel: {
        fontSize: 18,
        fontWeight: "700",
        color: "#2F4550",
    },
    finalTotalValue: {
        fontSize: 18,
        fontWeight: "700",
        color: "#2F4550",
    },
    imageButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#2F4550",
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        marginBottom: 15,
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 5,
    },
    imageButtonText: {
        color: "#FFF",
        fontSize: 16,
        fontWeight: "600",
        marginLeft: 10,
    },
    photoList: {
        marginBottom: 20,
    },
    photoPreviewContainer: {
        marginRight: 10,
        position: "relative",
    },
    photoPreview: {
        width: 100,
        height: 100,
        borderRadius: 8,
    },
    removePhotoButton: {
        position: "absolute",
        top: -5,
        right: -5,
        backgroundColor: "#FFF",
        borderRadius: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 3,
    },
    subModalTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#2F4550",
        marginTop: 15,
        marginBottom: 5,
    },
    addTypeContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
    },
    addTypeInput: {
        flex: 1,
        backgroundColor: "#F5F7FA",
        borderRadius: 12,
        padding: 12,
        fontSize: 16,
        color: "#2F4550",
        borderWidth: 1,
        borderColor: "#E1E5EA",
        marginRight: 10,
    },
    addTypeButton: {
        backgroundColor: "#2196F3",
        padding: 12,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
    },
    workTypesList: {
        maxHeight: 200,
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

export default NewBudgetScreen;