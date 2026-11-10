"use client"

import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "../lib/backendStorage"
import * as Contacts from "expo-contacts"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useMemo, useState } from "react"
import { FlatList, Modal, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useAuth } from "../lib/auth"

const COLORS = {
  canvas: "#F8F7F4",
  surface: "#FFFFFF",
  surfaceSoft: "#F1EFEA",
  line: "#EAE7E1",
  ink: "#172321",
  muted: "#64716E",
  teal: "#0D9488",
  tealSoft: "#E7F5F2",
  red: "#BA1A1A",
}

const avatarColors = [
  { backgroundColor: "#DDF4EF", color: "#08766D" },
  { backgroundColor: "#FAE8E0", color: "#A0471D" },
  { backgroundColor: "#E3EEDD", color: "#3E6B35" },
  { backgroundColor: "#FCF2D9", color: "#9C6A08" },
  { backgroundColor: "#E8EAF5", color: "#545C72" },
]

const getInitials = (user) => `${user?.nombre?.trim()?.[0] || ""}${user?.apellido?.trim()?.[0] || ""}`.toUpperCase() || "?"

const UsersScreen = () => {
  const [users, setUsers] = useState([])
  const [searchText, setSearchText] = useState("")
  const [contacts, setContacts] = useState([])
  const [showContactsModal, setShowContactsModal] = useState(false)
  const [contactSearchText, setContactSearchText] = useState("")
  const [alertConfig, setAlertConfig] = useState({ visible: false, title: "", message: "", onConfirm: null, onCancel: null, confirmText: "Aceptar", cancelText: null, destructive: false })
  const router = useRouter()
  const { syncStatus } = useAuth()

  const showCustomAlert = (title, message, options = {}) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: options.onConfirm || (() => setAlertConfig((previous) => ({ ...previous, visible: false }))),
      onCancel: options.onCancel || null,
      confirmText: options.confirmText || "Aceptar",
      cancelText: options.cancelText || null,
      destructive: options.destructive || false,
    })
  }

  const hideCustomAlert = () => setAlertConfig((previous) => ({ ...previous, visible: false }))

  const fetchUsers = async () => {
    try {
      const usersJSON = await AsyncStorage.getItem("clientes")
      setUsers(usersJSON ? JSON.parse(usersJSON) : [])
    } catch (error) {
      console.error("Error al cargar los usuarios:", error)
      showCustomAlert("Error", "No se pudieron cargar los usuarios.")
    }
  }

  useFocusEffect(useCallback(() => { fetchUsers() }, []))

  const filteredUsers = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase("es-AR")
    return users.filter((user) => !query || `${user.nombre || ""} ${user.apellido || ""} ${user.telefono || ""}`.toLocaleLowerCase("es-AR").includes(query))
  }, [searchText, users])

  const filteredContacts = useMemo(() => {
    const query = contactSearchText.trim().toLocaleLowerCase("es-AR")
    return contacts.filter((contact) => `${contact.name || ""} ${(contact.phoneNumbers || []).map((phone) => phone.number || "").join(" ")}`.toLocaleLowerCase("es-AR").includes(query))
  }, [contactSearchText, contacts])

  const importContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync()
      if (status !== "granted") {
        showCustomAlert("Permisos denegados", "Se necesitan permisos para acceder a los contactos.")
        return
      }
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers] })
      const validContacts = data.filter((contact) => contact.name && contact.phoneNumbers?.length)
      if (!validContacts.length) {
        showCustomAlert("Sin contactos", "No se encontraron contactos con teléfono en el dispositivo.")
        return
      }
      setContacts(validContacts)
      setContactSearchText("")
      setShowContactsModal(true)
    } catch (error) {
      console.error("Error al importar contactos:", error)
      showCustomAlert("Error", "No se pudieron importar los contactos.")
    }
  }

  const selectContact = (contact) => {
    const [nombre = "", ...rest] = (contact.name || "").trim().split(/\s+/)
    let telefono = (contact.phoneNumbers?.[0]?.number || "").replace(/[\s\-()]/g, "")
    if (telefono && !telefono.startsWith("+")) telefono = `+54${telefono}`
    setShowContactsModal(false)
    router.push({ pathname: "/NewClientScreen", params: { fromContact: "true", nombre, apellido: rest.join(" "), telefono } })
  }

  const deleteUser = async (userId) => {
    try {
      const usersJSON = await AsyncStorage.getItem("clientes")
      const updatedUsers = (usersJSON ? JSON.parse(usersJSON) : []).filter((user) => user.id !== userId)
      await AsyncStorage.setItem("clientes", JSON.stringify(updatedUsers))
      setUsers(updatedUsers)
      showCustomAlert("Eliminado", "El cliente se eliminó correctamente.")
    } catch (error) {
      console.error("Error al eliminar el cliente:", error)
      showCustomAlert("Error", "No se pudo eliminar el cliente.")
    }
  }

  const confirmDelete = (user) => showCustomAlert(
    "Eliminar usuario",
    `¿Querés eliminar a ${user.nombre || ""} ${user.apellido || ""}?`,
    {
      cancelText: "Cancelar",
      confirmText: "Eliminar",
      destructive: true,
      onCancel: hideCustomAlert,
      onConfirm: () => { hideCustomAlert(); deleteUser(user.id) },
    },
  )

  const openUser = (user) => router.push({ pathname: "ClientDetailScreen", params: { cliente: JSON.stringify(user) } })
  const syncNote = syncStatus.state === "synced"
    ? "Clientes sincronizados con el servidor."
    : syncStatus.state === "syncing"
      ? "Sincronizando clientes con el servidor…"
      : syncStatus.state === "pending" || syncStatus.state === "offline"
        ? "Cambios guardados en el dispositivo, pendientes de sincronización."
        : "Los clientes se guardan en el dispositivo y se sincronizan con el servidor."
  const syncIcon = syncStatus.state === "synced" ? "cloud-done-outline" : syncStatus.state === "syncing" ? "sync-outline" : "cloud-offline-outline"

  const renderUserItem = ({ item, index }) => (
    <TouchableOpacity activeOpacity={0.82} style={styles.userCard} onPress={() => openUser(item)}>
      <View style={styles.userTopRow}>
        <View style={[styles.avatar, avatarColors[index % avatarColors.length]]}>
          <Text style={[styles.avatarText, { color: avatarColors[index % avatarColors.length].color }]}>{getInitials(item)}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{`${item.nombre || ""} ${item.apellido || ""}`.trim() || "Usuario sin nombre"}</Text>
          <View style={styles.phoneLine}>
            <Ionicons name="call-outline" size={14} color={COLORS.muted} />
            <Text style={styles.userPhone} numberOfLines={1}>{item.telefono || "Sin teléfono"}</Text>
          </View>
        </View>
        <TouchableOpacity accessibilityLabel="Eliminar usuario" style={styles.moreButton} onPress={() => confirmDelete(item)}>
          <Ionicons name="ellipsis-vertical" size={18} color={COLORS.muted} />
        </TouchableOpacity>
      </View>
      <View style={styles.cardDivider} />
      <View style={styles.userFooter}>
        <View style={styles.tag}><Text style={styles.tagText}>Cliente</Text></View>
        <Text style={styles.openDetail}>Ver ficha</Text>
        <Ionicons name="chevron-forward" size={15} color={COLORS.teal} />
      </View>
    </TouchableOpacity>
  )

  const renderContactItem = ({ item }) => (
    <TouchableOpacity style={styles.contactItem} onPress={() => selectContact(item)}>
      <View style={[styles.avatar, styles.contactAvatar]}><Ionicons name="person-outline" size={21} color={COLORS.teal} /></View>
      <View style={styles.userInfo}>
        <Text style={styles.userName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.userPhone}>{item.phoneNumbers?.[0]?.number || "Sin teléfono"}</Text>
      </View>
      <Ionicons name="add-circle-outline" size={23} color={COLORS.teal} />
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Volver al inicio" onPress={() => router.replace("/")} style={styles.backButton}>
          <Ionicons name="arrow-back" size={21} color={COLORS.ink} />
        </TouchableOpacity>
        <Text style={styles.brand}>Clientes</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={filteredUsers}
        keyExtractor={(item, index) => String(item.id ?? index)}
        renderItem={renderUserItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <View style={styles.contentHeader}>
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={20} color={COLORS.muted} />
              <TextInput
                style={styles.searchInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Buscar por nombre o teléfono"
                placeholderTextColor="#89938F"
                returnKeyType="search"
                autoCorrect={false}
              />
              {!!searchText && <TouchableOpacity accessibilityLabel="Limpiar búsqueda" onPress={() => setSearchText("")}><Ionicons name="close-circle" size={19} color="#89938F" /></TouchableOpacity>}
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.newUserButton} onPress={() => router.push("NewClientScreen")}>
                <Ionicons name="person-add-outline" size={19} color="#fff" />
                <Text style={styles.newUserButtonText}>Nuevo cliente</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.importButton} onPress={importContacts}>
                <Ionicons name="people-outline" size={19} color={COLORS.teal} />
                <Text style={styles.importButtonText}>Importar</Text>
              </TouchableOpacity>
            </View>

          </View>
        )}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Ionicons name={searchText ? "search-outline" : "people-outline"} size={26} color={COLORS.teal} /></View>
            <Text style={styles.emptyTitle}>{searchText ? "No encontramos resultados" : "Todavía no hay clientes"}</Text>
            <Text style={styles.emptyText}>{searchText ? "Probá con otro nombre o teléfono." : "Agregá un cliente o importá un contacto para empezar."}</Text>
          </View>
        )}
        ListFooterComponent={filteredUsers.length ? (
          <View style={styles.syncNote}>
            <Ionicons name={syncIcon} size={17} color={COLORS.teal} />
            <Text style={styles.syncText}>{syncNote}</Text>
          </View>
        ) : null}
      />

      <Modal visible={showContactsModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowContactsModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity accessibilityLabel="Cerrar" onPress={() => setShowContactsModal(false)} style={styles.closeButton}><Ionicons name="close" size={24} color={COLORS.ink} /></TouchableOpacity>
            <Text style={styles.modalTitle}>Importar contacto</Text>
            <View style={styles.headerSpacer} />
          </View>
          <Text style={styles.modalDescription}>Elegí un contacto para cargar sus datos.</Text>
          <View style={styles.searchContainer}>
            <Ionicons name="search-outline" size={20} color={COLORS.muted} />
            <TextInput style={styles.searchInput} value={contactSearchText} onChangeText={setContactSearchText} placeholder="Buscar contacto" placeholderTextColor="#89938F" />
          </View>
          <FlatList data={filteredContacts} keyExtractor={(item, index) => String(item.id ?? index)} renderItem={renderContactItem} contentContainerStyle={styles.contactList} ListEmptyComponent={<Text style={styles.emptyText}>No se encontraron contactos.</Text>} />
        </SafeAreaView>
      </Modal>

      <Modal transparent visible={alertConfig.visible} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={hideCustomAlert}>
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>{alertConfig.title}</Text>
            <Text style={styles.alertMessage}>{alertConfig.message}</Text>
            <View style={styles.alertButtons}>
              {alertConfig.onCancel && <TouchableOpacity style={[styles.alertButton, styles.alertCancelButton]} onPress={alertConfig.onCancel}><Text style={styles.alertCancelText}>{alertConfig.cancelText}</Text></TouchableOpacity>}
              <TouchableOpacity style={[styles.alertButton, alertConfig.destructive ? styles.alertDestructiveButton : styles.alertConfirmButton]} onPress={alertConfig.onConfirm}><Text style={styles.alertConfirmText}>{alertConfig.confirmText}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },
  header: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  backButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surfaceSoft },
  brand: { marginLeft: 10, fontSize: 17, fontWeight: "800", color: COLORS.ink, letterSpacing: 0.4 },
  headerSpacer: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 28, flexGrow: 1 },
  contentHeader: { paddingTop: 4, paddingBottom: 14 },
  searchContainer: { height: 48, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, paddingHorizontal: 13 },
  searchInput: { flex: 1, height: "100%", color: COLORS.ink, fontSize: 14 },
  actionsRow: { flexDirection: "row", gap: 9, marginTop: 12 },
  newUserButton: { flex: 1.35, height: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: COLORS.teal, borderRadius: 9 },
  newUserButtonText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  importButton: { flex: 1, height: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 9 },
  importButtonText: { fontSize: 13, fontWeight: "600", color: COLORS.ink },
  userCard: { backgroundColor: COLORS.surface, padding: 13, marginBottom: 10, borderRadius: 15, borderWidth: 1, borderColor: COLORS.line },
  userTopRow: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(13,148,136,0.14)" },
  avatarText: { fontSize: 14, fontWeight: "800", letterSpacing: -0.3 },
  userInfo: { flex: 1, marginLeft: 11, minWidth: 0 },
  userName: { fontSize: 14, lineHeight: 19, fontWeight: "700", color: COLORS.ink },
  phoneLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  userPhone: { fontSize: 12, lineHeight: 17, color: COLORS.muted },
  moreButton: { width: 34, height: 36, alignItems: "center", justifyContent: "center", marginLeft: 4 },
  cardDivider: { height: 1, backgroundColor: COLORS.surfaceSoft, marginVertical: 11 },
  userFooter: { flexDirection: "row", alignItems: "center" },
  tag: { backgroundColor: COLORS.tealSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tagText: { color: COLORS.teal, fontSize: 10, fontWeight: "700" },
  openDetail: { marginLeft: "auto", fontSize: 11, color: COLORS.teal, fontWeight: "700" },
  emptyState: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 42 },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.tealSoft, marginBottom: 14 },
  emptyTitle: { color: COLORS.ink, fontSize: 16, fontWeight: "700", textAlign: "center" },
  emptyText: { marginTop: 6, color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  syncNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 10, marginTop: 5, backgroundColor: COLORS.surfaceSoft, borderRadius: 11 },
  syncText: { color: COLORS.muted, fontSize: 11, fontWeight: "600" },
  modalContainer: { flex: 1, backgroundColor: COLORS.canvas, paddingHorizontal: 16 },
  modalHeader: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  closeButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  modalTitle: { color: COLORS.ink, fontSize: 17, fontWeight: "700" },
  modalDescription: { color: COLORS.muted, fontSize: 13, marginBottom: 16 },
  contactList: { paddingTop: 12, paddingBottom: 28 },
  contactItem: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 12, marginBottom: 9 },
  contactAvatar: { backgroundColor: COLORS.tealSoft },
  alertOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "center", alignItems: "center", padding: 20 },
  alertBox: { width: "100%", maxWidth: 400, backgroundColor: COLORS.surface, borderRadius: 16, padding: 21 },
  alertTitle: { fontSize: 18, fontWeight: "700", color: COLORS.ink, marginBottom: 8 },
  alertMessage: { fontSize: 14, lineHeight: 21, color: COLORS.muted, marginBottom: 20 },
  alertButtons: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  alertButton: { minWidth: 105, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 9, alignItems: "center" },
  alertCancelButton: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line },
  alertConfirmButton: { backgroundColor: COLORS.teal },
  alertDestructiveButton: { backgroundColor: COLORS.red },
  alertCancelText: { color: COLORS.ink, fontWeight: "600", fontSize: 14 },
  alertConfirmText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
})

export default UsersScreen
