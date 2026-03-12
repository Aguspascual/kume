"use client"

import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Contacts from "expo-contacts"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { Alert, FlatList, Modal, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"

const UsersScreen = () => {
  const [users, setUsers] = useState([])
  const [filteredUsers, setFilteredUsers] = useState([])
  const [searchText, setSearchText] = useState("")
  const [contacts, setContacts] = useState([])
  const [showContactsModal, setShowContactsModal] = useState(false)
  const [filteredContacts, setFilteredContacts] = useState([])
  const [contactSearchText, setContactSearchText] = useState("")

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

  const router = useRouter()

  const fetchUsers = async () => {
    try {
      const usersJSON = await AsyncStorage.getItem("clientes")
      const usersArray = usersJSON ? JSON.parse(usersJSON) : []
      setUsers(usersArray)
      setFilteredUsers(usersArray)
    } catch (error) {
      console.error("Error al cargar los usuarios:", error)
      showCustomAlert("Error", "No se pudieron cargar los usuarios.")
    }
  }

  useFocusEffect(
    useCallback(() => {
      fetchUsers()
    }, []),
  )

  useEffect(() => {
    if (searchText === "") {
      setFilteredUsers(users)
    } else {
      const filtered = users.filter(
        (user) =>
          user.nombre.toLowerCase().includes(searchText.toLowerCase()) ||
          user.apellido.toLowerCase().includes(searchText.toLowerCase()),
      )
      setFilteredUsers(filtered)
    }
  }, [searchText, users])

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

    router.push({
      pathname: "/NewClientScreen",
      params: {
        fromContact: "true",
        nombre: firstName,
        apellido: lastName,
        telefono: phoneNumber,
      },
    })
  }

  const deleteUser = async (userId) => {
    try {
      const usersJSON = await AsyncStorage.getItem("clientes")
      const usersArray = usersJSON ? JSON.parse(usersJSON) : []

      const updatedUsers = usersArray.filter((user) => user.id !== userId)

      await AsyncStorage.setItem("clientes", JSON.stringify(updatedUsers))
      setUsers(updatedUsers)
      setFilteredUsers(updatedUsers)

      showCustomAlert("Eliminado", "El cliente ha sido eliminado correctamente.")
    } catch (error) {
      console.error("Error al eliminar el cliente:", error)
      showCustomAlert("Error", "No se pudo eliminar el cliente.")
    }
  }

  const confirmDelete = (user) => {
    showCustomAlert(
      "Confirmar Eliminación",
      `¿Estás seguro de que quieres eliminar a ${user.nombre} ${user.apellido}?`,
      {
        cancelText: "Cancelar",
        confirmText: "Eliminar",
        destructive: true,
        onCancel: hideCustomAlert,
        onConfirm: () => {
          hideCustomAlert()
          deleteUser(user.id)
        }
      }
    )
  }

  const renderUserItem = ({ item }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => {
        router.push({
          pathname: "ClientDetailScreen",
          params: { cliente: JSON.stringify(item) },
        })
      }}
    >
      <Ionicons name="person-circle-outline" size={30} color="#003366" />
      <View style={styles.userInfo}>
        <Text style={styles.userName}>
          {item.nombre} {item.apellido}
        </Text>
        <Text style={styles.userPhone}>{item.telefono}</Text>
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => confirmDelete(item)}
      >
        <Ionicons name="trash-outline" size={24} color="#f44336" />
      </TouchableOpacity>
    </TouchableOpacity>
  )

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace("/")} style={styles.backButton}>
          <Ionicons name="home-outline" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Usuarios</Text>
      </View>

      <View style={styles.formContainer}>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color="#003366" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Buscar usuario"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.buttonsContainer}>
          <TouchableOpacity style={styles.newUserButton} onPress={() => router.push("NewClientScreen")}>
            <Ionicons name="add-circle-outline" size={24} color="#fff" />
            <Text style={styles.newUserButtonText}>Nuevo Usuario</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.importContactsButton} onPress={importContacts}>
            <Ionicons name="phone-portrait-outline" size={24} color="#fff" />
            <Text style={styles.importContactsButtonText}>Importar Contactos</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderUserItem}
          ListEmptyComponent={() => <Text style={styles.emptyListText}>No hay usuarios registrados.</Text>}
          style={styles.list}
        />
      </View>

      <Modal visible={showContactsModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowContactsModal(false)} style={styles.closeButton}>
              <Ionicons name="close-outline" size={28} color="#003366" />
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
    color: "#fff",
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
  buttonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 10,
  },
  newUserButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    padding: 18,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
  },
  newUserButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  importContactsButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    padding: 18,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
  },
  importContactsButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  list: {
    flex: 1,
  },
  userItem: {
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
    justifyContent: "space-between",
  },
  userInfo: {
    flex: 1,
    marginLeft: 15,
  },
  userName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  userPhone: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#fff",
    marginLeft: 10,
  },
  emptyListText: {
    textAlign: "center",
    marginTop: 50,
    fontSize: 16,
    color: "#999",
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

export default UsersScreen