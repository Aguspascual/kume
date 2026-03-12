"use client"

import { useState, useEffect } from "react"
import {
  ScrollView,
  StyleSheet,
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter, useLocalSearchParams } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as Contacts from "expo-contacts"
import { FlatList, Modal } from "react-native"

const NewClientScreen = () => {
  // Estados para almacenar los datos del formulario
  const [nombre, setNombre] = useState("")
  const [apellido, setApellido] = useState("")
  const [telefono, setTelefono] = useState("")
  const [domicilio, setDomicilio] = useState("")

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

  // Se usa useRouter para la navegación en Expo Router
  const router = useRouter()
  const params = useLocalSearchParams()

  const [contacts, setContacts] = useState([])
  const [showContactsModal, setShowContactsModal] = useState(false)
  const [filteredContacts, setFilteredContacts] = useState([])
  const [contactSearchText, setContactSearchText] = useState("")

  useEffect(() => {
    if (contactSearchText === "") {
      setFilteredContacts(contacts)
    } else {
      const filtered = contacts.filter(
        (contact) =>
          contact.name.toLowerCase().includes(contactSearchText.toLowerCase()) ||
          (contact.phoneNumbers && contact.phoneNumbers.some((phone) => phone.number.includes(contactSearchText))),
      )
      setFilteredContacts(filtered)
    }
  }, [contactSearchText, contacts])

  const importContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync()
      if (status === "granted") {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        })

        if (data.length > 0) {
          const validContacts = data.filter(
            (contact) => contact.name && contact.phoneNumbers && contact.phoneNumbers.length > 0,
          )
          setContacts(validContacts)
          setFilteredContacts(validContacts)
          setShowContactsModal(true)
        } else {
          showCustomAlert("Sin contactos", "No se encontraron contactos en el dispositivo.")
        }
      } else {
        showCustomAlert("Permisos denegados", "Se necesitan permisos para acceder a los contactos.")
      }
    } catch (error) {
      console.error("Error al importar contactos:", error)
      showCustomAlert("Error", "No se pudieron importar los contactos.")
    }
  }

  const selectContact = (contact) => {
    const fullName = contact.name || contact.displayName || ""
    const nameParts = fullName.split(" ")
    const firstName = nameParts[0] || ""
    const lastName = nameParts.slice(1).join(" ") || ""

    let phoneNumber = ""
    if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
      phoneNumber = contact.phoneNumbers[0].number || ""
      phoneNumber = phoneNumber.replace(/[\s\-\(\)]/g, "")
      if (!phoneNumber.startsWith("+54") && !phoneNumber.startsWith("+")) {
        phoneNumber = "+54" + phoneNumber
      }
    }

    setNombre(firstName)
    setApellido(lastName)
    setTelefono(phoneNumber)
    setShowContactsModal(false)
  }

  const renderContactItem = ({ item }) => (
    <TouchableOpacity style={styles.contactItem} onPress={() => selectContact(item)}>
      <Ionicons name="person-outline" size={24} color="#003366" />
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>{item.name}</Text>
        <Text style={styles.contactPhone}>{item.phoneNumbers[0]?.number || "Sin teléfono"}</Text>
      </View>
      <Ionicons name="add-circle-outline" size={20} color="#2196F3" />
    </TouchableOpacity>
  )

  useEffect(() => {
    if (params.fromContact === "true") {
      if (params.nombre) setNombre(params.nombre)
      if (params.apellido) setApellido(params.apellido)
      if (params.telefono) setTelefono(params.telefono)
    }
  }, [params])

  // Función para guardar el nuevo cliente
  const handleSaveClient = async () => {
    // Validar que todos los campos obligatorios estén llenos
    if (!nombre || !apellido || !telefono || !domicilio) {
      showCustomAlert("Error", "Todos los campos son obligatorios.")
      return
    }

    // Formatear el número de teléfono con el prefijo +54
    let telefonoFormateado = telefono.trim()
    if (!telefonoFormateado.startsWith("+54")) {
      telefonoFormateado = "+54" + telefonoFormateado
    }

    try {
      // Crear el objeto del nuevo cliente
      const newClient = {
        id: Date.now().toString(),
        nombre,
        apellido,
        telefono: telefonoFormateado,
        domicilio,
      }

      // Obtener clientes existentes, agregar el nuevo y guardar
      const existingClientsJSON = await AsyncStorage.getItem("clientes")
      const existingClients = existingClientsJSON ? JSON.parse(existingClientsJSON) : []
      const updatedClients = [...existingClients, newClient]
      await AsyncStorage.setItem("clientes", JSON.stringify(updatedClients))

      // Mostrar mensaje de éxito
      showCustomAlert("Éxito", "Cliente guardado correctamente.", {
        onConfirm: () => {
          hideCustomAlert()
          // Limpiar los campos del formulario
          setNombre("")
          setApellido("")
          setTelefono("")
          setDomicilio("")
          // Redirigir a la pantalla de inicio usando Expo Router
          router.replace("/")
        }
      })
    } catch (error) {
      console.error("Error al guardar el cliente:", error)
      showCustomAlert("Error", "No se pudo guardar el cliente.")
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.innerContainer}>
            <View style={styles.header}>
              {/* Se usa router.replace para navegar a la ruta raíz ('/') */}
              <TouchableOpacity onPress={() => router.replace("/")} style={styles.backButton}>
                <Ionicons name="home-outline" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.title}>Nuevo Cliente</Text>
            </View>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={styles.formContainer}>
                <TouchableOpacity style={styles.importContactsButton} onPress={importContacts}>
                  <Ionicons name="phone-portrait-outline" size={24} color="#fff" />
                  <Text style={styles.importContactsButtonText}>Importar desde Contactos</Text>
                </TouchableOpacity>

                <Text style={styles.label}>Nombre</Text>
                <TextInput
                  style={styles.input}
                  value={nombre}
                  onChangeText={setNombre}
                  placeholder="Ej: Juan"
                  placeholderTextColor="#999"
                  returnKeyType="next"
                />

                <Text style={styles.label}>Apellido</Text>
                <TextInput
                  style={styles.input}
                  value={apellido}
                  onChangeText={setApellido}
                  placeholder="Ej: Pérez"
                  placeholderTextColor="#999"
                  returnKeyType="next"
                />

                <Text style={styles.label}>Teléfono</Text>
                <TextInput
                  style={styles.input}
                  value={telefono}
                  onChangeText={setTelefono}
                  keyboardType="phone-pad"
                  placeholder="Ej: 2396-123456"
                  placeholderTextColor="#999"
                  returnKeyType="next"
                />

                <Text style={styles.label}>Domicilio</Text>
                <TextInput
                  style={styles.input}
                  value={domicilio}
                  onChangeText={setDomicilio}
                  placeholder="Ej: Av. Balcarce 123"
                  placeholderTextColor="#999"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <TouchableOpacity style={styles.saveButton} onPress={handleSaveClient}>
                  <Text style={styles.saveButtonText}>Guardar Cliente</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <Modal visible={showContactsModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowContactsModal(false)} style={styles.closeButton}>
              <Ionicons name="close-outline" size={28} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Seleccionar Contacto</Text>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={20} color="#003366" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={contactSearchText}
                onChangeText={setContactSearchText}
                placeholder="Buscar contacto"
                placeholderTextColor="#999"
              />
            </View>

            <FlatList
              data={filteredContacts}
              keyExtractor={(item) => item.id}
              renderItem={renderContactItem}
              ListEmptyComponent={() => <Text style={styles.emptyListText}>No se encontraron contactos.</Text>}
              style={styles.contactsList}
            />
          </View>
        </SafeAreaView>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#2F4550",
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 30,
    backgroundColor: "#2F4550",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  backButton: {
    position: "absolute",
    left: 20,
    paddingTop: 22,
    paddingLeft: 10,
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
    padding: 30,
    paddingTop: 40,
    marginTop: -20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#003366",
    marginBottom: 5,
  },
  input: {
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 20,
    color: "#333",
  },
  saveButton: {
    backgroundColor: "#2196F3",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 10,
  },
  importContactsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  importContactsButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#FFEB3B",
  },
  modalHeader: {
    padding: 20,
    backgroundColor: "#2F4550",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    left: 20,
    top: 25,
    color: "#FFF",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 30,
  },
  modalContent: {
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
  contactsList: {
    flex: 1,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  contactInfo: {
    flex: 1,
    marginLeft: 15,
  },
  contactName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  contactPhone: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  emptyListText: {
    textAlign: "center",
    marginTop: 50,
    fontSize: 16,
    color: "#999",
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
})

export default NewClientScreen
