import { useState } from "react"
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"
import { useAuth } from "../lib/auth"

const primary = "#00685F"

export default function ProfileScreen() {
  const router = useRouter()
  const { session, updateProfile } = useAuth()
  const [name, setName] = useState(session?.user?.display_name || "")
  const [phone, setPhone] = useState(session?.user?.contact_phone || "")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateProfile(name.trim(), phone.trim())
      Alert.alert("Datos actualizados", "El nombre y teléfono del responsable se mostrarán en tus PDF.", [{ text: "Aceptar", onPress: () => router.back() }])
    } catch (error) {
      Alert.alert("No se pudieron guardar los datos", error.message || "Revisá el nombre y el teléfono e intentá de nuevo.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={21} color="#183D38" />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>MI CUENTA</Text>
            <Text style={styles.title}>Datos del responsable</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}><Ionicons name="document-text-outline" size={21} color={primary} /></View>
            <Text style={styles.infoText}>Estos datos aparecen en los PDF de presupuestos y trabajos que compartís con tus clientes.</Text>
          </View>

          <Text style={styles.label}>Nombre del responsable</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Tu nombre" placeholderTextColor="#8B9692" style={styles.input} autoCapitalize="words" returnKeyType="next" />

          <Text style={styles.label}>Teléfono de contacto</Text>
          <TextInput value={phone} onChangeText={setPhone} placeholder="Código de área y número" placeholderTextColor="#8B9692" style={styles.input} keyboardType="phone-pad" autoComplete="tel" returnKeyType="done" />
          <Text style={styles.hint}>Incluí el código de país y de área. Ej.: +54 9 11 1234-5678</Text>

          <Text style={styles.label}>Correo de la cuenta</Text>
          <View style={[styles.input, styles.readOnlyInput]}><Text numberOfLines={1} style={styles.email}>{session?.user?.email || ""}</Text><Ionicons name="lock-closed-outline" size={15} color="#8B9692" /></View>

          <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} onPress={handleSave} disabled={saving} accessibilityRole="button">
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name="checkmark" size={19} color="#FFFFFF" /><Text style={styles.saveText}>Guardar datos</Text></>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F5EF" },
  flex: { flex: 1 },
  header: { minHeight: 66, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingBottom: 10 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#E9EEE7", alignItems: "center", justifyContent: "center", marginRight: 13 },
  headerCopy: { flex: 1 },
  eyebrow: { color: "#618176", fontSize: 9, fontWeight: "800", letterSpacing: 1.4, marginBottom: 3 },
  title: { color: "#183D38", fontSize: 20, fontWeight: "800" },
  content: { padding: 20, paddingBottom: 36, maxWidth: 560, width: "100%", alignSelf: "center" },
  infoCard: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#EAF5F1", borderRadius: 13, padding: 14, marginBottom: 25 },
  infoIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  infoText: { flex: 1, color: "#47605A", fontSize: 13, lineHeight: 19 },
  label: { color: "#34413E", fontSize: 12, fontWeight: "700", marginBottom: 7, marginTop: 13 },
  input: { minHeight: 52, borderWidth: 1, borderColor: "#DCE3DF", borderRadius: 11, backgroundColor: "#FFFFFF", paddingHorizontal: 14, color: "#192522", fontSize: 15, justifyContent: "center" },
  readOnlyInput: { flexDirection: "row", alignItems: "center", gap: 8 },
  email: { flex: 1, color: "#697976", fontSize: 14 },
  hint: { color: "#75847C", fontSize: 11, lineHeight: 16, marginTop: 6 },
  saveButton: { minHeight: 52, borderRadius: 12, backgroundColor: primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 30 },
  saveText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.65 },
})
