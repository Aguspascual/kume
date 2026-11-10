"use client"

import { useState, useMemo } from "react"
import {
  ScrollView,
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from "react-native"
import { SafeAreaView as SafeAreaContainer } from "react-native-safe-area-context"
import AsyncStorage from "../lib/backendStorage"
import { useRouter, useLocalSearchParams } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as Contacts from "expo-contacts"
import { FlatList, Modal } from "react-native"

const NewClientScreen = () => {
  const params = useLocalSearchParams()
  const fromContact = params.fromContact === "true"

  // Estados para almacenar los datos del formulario
  const [nombre, setNombre] = useState(fromContact ? params.nombre ?? "" : "")
  const [apellido, setApellido] = useState(fromContact ? params.apellido ?? "" : "")
  const [telefono, setTelefono] = useState(fromContact ? params.telefono ?? "" : "")
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
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"))

  const [contacts, setContacts] = useState([])
  const [showContactsModal, setShowContactsModal] = useState(false)
  const [contactSearchText, setContactSearchText] = useState("")

  const filteredContacts = useMemo(() => {
    const normalizedSearch = contactSearchText.toLowerCase()
    return contacts.filter(
      (contact) =>
        contact.name.toLowerCase().includes(normalizedSearch) ||
        (contact.phoneNumbers && contact.phoneNumbers.some((phone) => phone.number.includes(contactSearchText))),
    )
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
      <Ionicons name="person-outline" size={22} color="#00685F" />
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>{item.name}</Text>
        <Text style={styles.contactPhone}>{item.phoneNumbers[0]?.number || "Sin teléfono"}</Text>
      </View>
      <Ionicons name="add-circle-outline" size={20} color="#00685F" />
    </TouchableOpacity>
  )

  // Función para guardar el nuevo cliente
  const handleSaveClient = async () => {
    // Nombre y teléfono son los datos obligatorios de la ficha.
    if (!nombre.trim() || !telefono.trim()) {
      showCustomAlert("Error", "El nombre y el teléfono son obligatorios.")
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
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        telefono: telefonoFormateado,
        domicilio: domicilio.trim(),
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
          goBack()
        }
      })
    } catch (error) {
      console.error("Error al guardar el cliente:", error)
      showCustomAlert("Error", "No se pudo guardar el cliente.")
    }
  }

  return (
    <SafeAreaContainer style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.innerContainer}>
            <View style={styles.header}>
              <TouchableOpacity onPress={goBack} style={styles.backButton} accessibilityLabel="Volver">
                <Ionicons name="arrow-back" size={21} color="#183D38" />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Agregar cliente</Text>
                <Text style={styles.headerSubtitle}>Guardá sus datos para tus próximos trabajos</Text>
              </View>
            </View>
            <View style={styles.headerDivider} />

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentInsetAdjustmentBehavior="never"
            >
              <View>
                <View style={styles.importCard}>
                  <View style={styles.importIcon}><Ionicons name="people-outline" size={20} color="#246B5C" /></View>
                  <View style={styles.importCopy}>
                    <Text style={styles.importTitle}>Importar desde contactos</Text>
                    <Text style={styles.importDescription}>Cargar nombre y teléfono automáticamente</Text>
                  </View>
                  <TouchableOpacity style={styles.importButton} onPress={importContacts} accessibilityLabel="Importar contactos">
                    <Text style={styles.importButtonText}>Importar</Text>
                  </TouchableOpacity>
                </View>

                {fromContact && <View style={styles.importedNotice}><Ionicons name="checkmark-circle" size={17} color="#397263" /><Text style={styles.importedNoticeText}>Datos importados del contacto. Podés editarlos.</Text></View>}

                <View style={styles.formCard}>
                  <View style={styles.cardHeading}>
                    <Ionicons name="person-outline" size={20} color="#00685F" />
                    <Text style={styles.cardTitle}>Información personal</Text>
                  </View>
                  <Text style={styles.label}>Nombre <Text style={styles.required}>*</Text></Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="id-card-outline" size={19} color="#7B8982" />
                    <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Ej.: Juan" placeholderTextColor="#89968F" returnKeyType="next" autoCapitalize="words" />
                  </View>
                  <Text style={styles.label}>Apellido</Text>
                  <TextInput style={styles.standaloneInput} value={apellido} onChangeText={setApellido} placeholder="Ej.: Pérez" placeholderTextColor="#89968F" returnKeyType="next" autoCapitalize="words" />
                </View>

                <View style={styles.formCard}>
                  <View style={styles.cardHeading}>
                    <Ionicons name="people-outline" size={20} color="#00685F" />
                    <Text style={styles.cardTitle}>Contacto</Text>
                  </View>
                  <Text style={styles.label}>Teléfono <Text style={styles.required}>*</Text></Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="call-outline" size={19} color="#7B8982" />
                    <TextInput style={styles.input} value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" placeholder="Ej.: 2396 123456" placeholderTextColor="#89968F" returnKeyType="next" />
                  </View>
                  <Text style={styles.phoneHint}>Código de área sin 0 y número sin 15</Text>
                  <Text style={styles.label}>Domicilio</Text>
                  <View style={[styles.inputWrap, styles.lastInputWrap]}>
                    <Ionicons name="location-outline" size={19} color="#7B8982" />
                    <TextInput style={styles.input} value={domicilio} onChangeText={setDomicilio} placeholder="Ej.: Av. Balcarce 123" placeholderTextColor="#89968F" returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
                  </View>
                </View>
                <View style={styles.privacyNote}><Ionicons name="lock-closed-outline" size={15} color="#6D7A77" /><Text style={styles.privacyNoteText}>Los datos se guardan en tu dispositivo</Text></View>
              </View>
            </ScrollView>
            <View style={styles.footer}>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveClient}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
                <Text style={styles.saveButtonText}>Guardar cliente</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <Modal visible={showContactsModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaContainer style={styles.modalContainer} edges={["top", "left", "right", "bottom"]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowContactsModal(false)} style={styles.closeButton}>
              <Ionicons name="close-outline" size={26} color="#1A1C1A" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Seleccionar Contacto</Text>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={20} color="#00685F" style={styles.searchIcon} />
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
        </SafeAreaContainer>
      </Modal>

      {/* Custom Alert Modal */}
      <Modal
          transparent={true}
          visible={alertConfig.visible}
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
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
    </SafeAreaContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAF9F6" },
  keyboardAvoidingView: { flex: 1 },
  innerContainer: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 7, paddingBottom: 9, gap: 11 },
  headerDivider: { height: 1, backgroundColor: "#EAE7E1" },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#E9EEE7", alignItems: "center", justifyContent: "center", marginRight: 13 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: "700", color: "#1A1C1A", letterSpacing: -0.15 },
  headerSubtitle: { color: "#3D4947", fontSize: 11, marginTop: 2 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 116 },
  importCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#EAE7E1", padding: 13, marginBottom: 13, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  importIcon: { width: 36, height: 36, borderRadius: 9, backgroundColor: "#EFEEEB", alignItems: "center", justifyContent: "center", marginRight: 10 },
  importCopy: { flex: 1 },
  importTitle: { color: "#1A1C1A", fontSize: 12, fontWeight: "700" },
  importDescription: { color: "#3D4947", fontSize: 10, lineHeight: 14, marginTop: 3 },
  importButton: { minHeight: 34, borderRadius: 8, borderWidth: 1, borderColor: "#00685F", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 11, marginLeft: 7 },
  importButtonText: { fontSize: 11, color: "#00685F", fontWeight: "700" },
  importedNotice: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 3, paddingBottom: 13 },
  importedNoticeText: { color: "#397263", fontSize: 11, fontWeight: "600" },
  formCard: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#EAE7E1", padding: 16, marginBottom: 13, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.035, shadowRadius: 3, elevation: 1 },
  cardHeading: { flexDirection: "row", alignItems: "center", marginBottom: 13, gap: 9, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#EFEEEB" },
  cardTitle: { color: "#1A1C1A", fontSize: 15, fontWeight: "700" },
  label: { color: "#3D4947", fontSize: 11, fontWeight: "700", marginBottom: 6, marginTop: 1 },
  required: { color: "#00685F", fontWeight: "800" },
  inputWrap: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#FFFFFF", borderRadius: 8, borderWidth: 1, borderColor: "#D9DFDC", paddingHorizontal: 12, marginBottom: 13 },
  input: { minHeight: 44, flex: 1, backgroundColor: "#FFFFFF", borderRadius: 8, paddingHorizontal: 0, paddingVertical: 0, fontSize: 14, color: "#1A1C1A" },
  standaloneInput: { height: 44, backgroundColor: "#FFFFFF", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 0, fontSize: 14, color: "#1A1C1A", marginBottom: 13, borderWidth: 1, borderColor: "#D9DFDC" },
  lastInputWrap: { marginBottom: 0 },
  phoneHint: { color: "#5E6A66", fontSize: 10, marginTop: -7, marginBottom: 13, paddingLeft: 2 },
  privacyNote: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 5 },
  privacyNoteText: { color: "#3D4947", fontSize: 11 },
  footer: { paddingHorizontal: 16, paddingTop: 11, paddingBottom: Platform.OS === "ios" ? 8 : 12, backgroundColor: "rgba(250,249,246,0.98)", borderTopWidth: 1, borderTopColor: "#EAE7E1" },
  saveButton: { minHeight: 48, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9, backgroundColor: "#0D9488", paddingHorizontal: 18, borderRadius: 8, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  saveButtonText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  modalContainer: { flex: 1, backgroundColor: "#FAF9F6" },
  modalHeader: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: "#FAF9F6", flexDirection: "row", alignItems: "center", justifyContent: "center", position: "relative" },
  closeButton: { position: "absolute", left: 18, width: 38, height: 38, borderRadius: 8, backgroundColor: "#EFEEEB", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#1A1C1A" },
  modalContent: { flex: 1, backgroundColor: "#FFFFFF", borderTopLeftRadius: 23, borderTopRightRadius: 23, padding: 18, paddingTop: 21 },
  searchContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#F7F9F6", borderRadius: 13, paddingHorizontal: 13, marginBottom: 15, borderWidth: 1, borderColor: "#E6EAE4" },
  searchIcon: { marginRight: 9 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: "#1F4039" },
  contactsList: { flex: 1 },
  contactItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", padding: 13, borderRadius: 14, marginBottom: 9, borderWidth: 1, borderColor: "#E9EDE7" },
  contactInfo: { flex: 1, marginLeft: 12 },
  contactName: { fontSize: 14, fontWeight: "700", color: "#294A41" },
  contactPhone: { fontSize: 12, color: "#75847C", marginTop: 3 },
  emptyListText: { textAlign: "center", marginTop: 40, fontSize: 13, color: "#89968F" },
  alertOverlay: { flex: 1, backgroundColor: "rgba(18, 40, 35, 0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  alertBox: { backgroundColor: "#FFF", borderRadius: 18, padding: 21, width: "90%", maxWidth: 400, elevation: 5 },
  alertTitle: { fontSize: 17, fontWeight: "800", color: "#1A3D37", marginBottom: 9, textAlign: "center" },
  alertMessage: { fontSize: 14, color: "#64736B", marginBottom: 18, textAlign: "center", lineHeight: 21 },
  alertButtons: { flexDirection: "row", justifyContent: "space-around", gap: 9 },
  alertButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  alertCancelButton: { backgroundColor: "#F5F7F2", borderWidth: 1, borderColor: "#E6EAE4" },
  alertConfirmButton: { backgroundColor: "#216454" },
  alertDestructiveButton: { backgroundColor: "#A64238" },
  alertCancelText: { fontSize: 14, fontWeight: "700", color: "#52645B" },
  alertConfirmText: { fontSize: 14, fontWeight: "700", color: "#FFF" },
})
export default NewClientScreen
