import { useState } from "react"
import { ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../lib/auth"

const green = "#00685F"

export default function LoginScreen() {
  const { signIn, register } = useAuth()
  const [isRegistering, setIsRegistering] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const submit = async () => {
    setError("")
    setBusy(true)
    try {
      if (isRegistering) await register(name.trim(), phone.trim(), email.trim(), password)
      else await signIn(email.trim(), password)
    } catch (e) {
      setError(e.message || "Ocurrió un error. Intentá de nuevo.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.content}>
          <View style={styles.brandMark}><Text style={styles.brandLetter}>K</Text></View>
          <Text style={styles.brand}>KÜME</Text>
          <Text style={styles.title}>{isRegistering ? "Crear cuenta" : "Bienvenido"}</Text>
          <Text style={styles.subtitle}>{isRegistering ? "Registrate para empezar a organizar tu taller." : "Iniciá sesión para continuar."}</Text>

          {isRegistering && <TextInput value={name} onChangeText={setName} placeholder="Nombre del responsable" placeholderTextColor="#8B9692" style={styles.input} autoCapitalize="words" returnKeyType="next" />}
          {isRegistering && <TextInput value={phone} onChangeText={setPhone} placeholder="Teléfono de contacto" placeholderTextColor="#8B9692" style={styles.input} keyboardType="phone-pad" autoComplete="tel" returnKeyType="next" />}
          <TextInput value={email} onChangeText={setEmail} placeholder="Correo electrónico" placeholderTextColor="#8B9692" style={styles.input} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
          <View style={styles.passwordField}>
            <TextInput value={password} onChangeText={setPassword} placeholder="Contraseña" placeholderTextColor="#8B9692" style={styles.passwordInput} secureTextEntry={!showPassword} returnKeyType="done" onSubmitEditing={submit} />
            <TouchableOpacity
              onPress={() => setShowPassword((visible) => !visible)}
              style={styles.passwordVisibilityButton}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              accessibilityState={{ selected: showPassword }}
              hitSlop={8}
            >
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color="#6A7773" />
            </TouchableOpacity>
          </View>

          {isRegistering && <Text style={styles.hint}>Ingresá el teléfono con código de área y usá al menos 8 caracteres para la contraseña.</Text>}
          {!!error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity disabled={busy} onPress={submit} style={[styles.submit, busy && styles.disabled]} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{isRegistering ? "Crear cuenta" : "Iniciar sesión"}</Text>}
          </TouchableOpacity>
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>{isRegistering ? "¿Ya tenés cuenta?" : "¿Todavía no tenés cuenta?"}</Text>
            <TouchableOpacity onPress={() => { setIsRegistering(!isRegistering); setError("") }}><Text style={styles.switchAction}>{isRegistering ? "Iniciar sesión" : "Registrarme"}</Text></TouchableOpacity>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F7F3" },
  flex: { flex: 1, justifyContent: "center" },
  scrollContent: { flexGrow: 1, justifyContent: "center", paddingVertical: 24 },
  content: { paddingHorizontal: 26, width: "100%", maxWidth: 480, alignSelf: "center" },
  brandMark: { width: 52, height: 52, borderRadius: 16, backgroundColor: green, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 10 },
  brandLetter: { color: "white", fontSize: 26, fontWeight: "800" },
  brand: { color: green, fontSize: 14, letterSpacing: 3, fontWeight: "800", textAlign: "center", marginBottom: 38 },
  title: { color: "#192522", fontSize: 27, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#6A7773", fontSize: 14, textAlign: "center", marginTop: 8, marginBottom: 26 },
  input: { height: 54, borderWidth: 1, borderColor: "#DCE3DF", borderRadius: 12, backgroundColor: "#FFFFFF", paddingHorizontal: 16, color: "#192522", fontSize: 15, marginBottom: 12 },
  passwordField: { height: 54, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#DCE3DF", borderRadius: 12, backgroundColor: "#FFFFFF", marginBottom: 12 },
  passwordInput: { flex: 1, height: "100%", paddingHorizontal: 16, color: "#192522", fontSize: 15 },
  passwordVisibilityButton: { height: 48, minWidth: 48, alignItems: "center", justifyContent: "center", marginRight: 3 },
  hint: { color: "#6A7773", fontSize: 12, marginTop: -3, marginBottom: 12 },
  error: { color: "#AE3434", fontSize: 13, lineHeight: 19, marginVertical: 8 },
  submit: { height: 54, borderRadius: 12, backgroundColor: green, alignItems: "center", justifyContent: "center", marginTop: 8 },
  disabled: { opacity: 0.65 },
  submitText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 22 },
  switchText: { color: "#6A7773", fontSize: 13 },
  switchAction: { color: green, fontWeight: "700", fontSize: 13 },
})
