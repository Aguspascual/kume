package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/mail"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"

	"github.com/aguspascual/buscapolo/backend/internal/store"
)

var dummyPasswordHash = func() []byte {
	hash, err := bcrypt.GenerateFromPassword([]byte("not-a-real-user-password"), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	return hash
}()

type credentialsRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type registerRequest struct {
	Email        string `json:"email"`
	Password     string `json:"password"`
	DisplayName  string `json:"display_name"`
	ContactPhone string `json:"contact_phone"`
}

type updateProfileRequest struct {
	DisplayName  string `json:"display_name"`
	ContactPhone string `json:"contact_phone"`
}

type authResponse struct {
	AccessToken string     `json:"access_token"`
	TokenType   string     `json:"token_type"`
	ExpiresAt   time.Time  `json:"expires_at"`
	User        store.User `json:"user"`
}

func (a *API) register(w http.ResponseWriter, r *http.Request) {
	var input registerRequest
	if err := decodeJSON(w, r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Revisá los datos enviados.")
		return
	}
	email, ok := normalizeEmail(input.Email)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_email", "Ingresá un correo electrónico válido.")
		return
	}
	if err := validatePassword(input.Password); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_password", err.Error())
		return
	}
	displayName := strings.TrimSpace(input.DisplayName)
	if displayName == "" {
		writeError(w, http.StatusBadRequest, "invalid_display_name", "Ingresá el nombre del responsable.")
		return
	}
	if utf8.RuneCountInString(displayName) > 80 {
		writeError(w, http.StatusBadRequest, "invalid_display_name", "El nombre no puede superar los 80 caracteres.")
		return
	}
	contactPhone, ok := normalizeContactPhone(input.ContactPhone)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_contact_phone", "Ingresá un teléfono válido con código de área.")
		return
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "No se pudo crear la cuenta.")
		return
	}
	token, tokenHash, expiresAt, err := newSessionToken(a.sessionTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "No se pudo crear la sesión.")
		return
	}
	user, err := a.store.CreateAccount(r.Context(), email, displayName, contactPhone, string(passwordHash), tokenHash, expiresAt)
	if err != nil {
		if errors.Is(err, store.ErrEmailTaken) {
			writeError(w, http.StatusConflict, "email_taken", "Ya existe una cuenta con ese correo.")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "No se pudo crear la cuenta.")
		return
	}
	userID := user.ID
	_ = a.store.RecordAccess(r.Context(), &userID, "password", "success", "")
	a.recordActivity(r, &userID, "account", "Cuenta creada", "", "success")
	writeJSON(w, http.StatusCreated, authResponse{AccessToken: token, TokenType: "Bearer", ExpiresAt: expiresAt, User: user})
}

func (a *API) updateMe(w http.ResponseWriter, r *http.Request) {
	var input updateProfileRequest
	if err := decodeJSON(w, r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Revisá los datos enviados.")
		return
	}
	displayName := strings.TrimSpace(input.DisplayName)
	if displayName == "" || utf8.RuneCountInString(displayName) > 80 {
		writeError(w, http.StatusBadRequest, "invalid_display_name", "Ingresá un nombre de hasta 80 caracteres.")
		return
	}
	contactPhone, ok := normalizeContactPhone(input.ContactPhone)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_contact_phone", "Ingresá un teléfono válido con código de área.")
		return
	}
	currentUser := r.Context().Value(userContextKey{}).(store.User)
	user, err := a.store.UpdateProfile(r.Context(), currentUser.ID, displayName, contactPhone)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "No se pudieron guardar los datos del responsable.")
		return
	}
	userID := user.ID
	a.recordActivity(r, &userID, "account", "Perfil actualizado", "", "success")
	writeJSON(w, http.StatusOK, map[string]store.User{"user": user})
}

func (a *API) login(w http.ResponseWriter, r *http.Request) {
	var input credentialsRequest
	if err := decodeJSON(w, r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Revisá los datos enviados.")
		return
	}
	email, ok := normalizeEmail(input.Email)
	if !ok || validatePassword(input.Password) != nil {
		_ = a.store.RecordAccess(r.Context(), nil, "password", "failure", "invalid_credentials")
		a.recordActivity(r, nil, "auth", "Intento de inicio de sesión", "Credenciales inválidas", "failure")
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Correo o contraseña incorrectos.")
		return
	}

	user, passwordHash, err := a.store.UserCredentials(r.Context(), email)
	if errors.Is(err, store.ErrUserNotFound) {
		_ = bcrypt.CompareHashAndPassword(dummyPasswordHash, []byte(input.Password))
		_ = a.store.RecordAccess(r.Context(), nil, "password", "failure", "invalid_credentials")
		a.recordActivity(r, nil, "auth", "Intento de inicio de sesión", "Credenciales inválidas", "failure")
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Correo o contraseña incorrectos.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "No se pudo iniciar sesión.")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(input.Password)) != nil {
		userID := user.ID
		_ = a.store.RecordAccess(r.Context(), &userID, "password", "failure", "invalid_credentials")
		a.recordActivity(r, &userID, "auth", "Intento de inicio de sesión", "Credenciales inválidas", "failure")
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Correo o contraseña incorrectos.")
		return
	}

	token, tokenHash, expiresAt, err := newSessionToken(a.sessionTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "No se pudo crear la sesión.")
		return
	}
	if err := a.store.CreateSession(r.Context(), user.ID, tokenHash, expiresAt); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "No se pudo crear la sesión.")
		return
	}
	userID := user.ID
	_ = a.store.RecordAccess(r.Context(), &userID, "password", "success", "")
	a.recordActivity(r, &userID, "auth", "Sesión iniciada", "", "success")
	writeJSON(w, http.StatusOK, authResponse{AccessToken: token, TokenType: "Bearer", ExpiresAt: expiresAt, User: user})
}

func (a *API) logout(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(userContextKey{}).(store.User)
	authorization := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if err := a.store.RevokeSession(r.Context(), authorization); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "No se pudo cerrar la sesión.")
		return
	}
	a.recordActivity(r, &user.ID, "auth", "Sesión cerrada", "", "success")
	writeJSON(w, http.StatusOK, map[string]any{"status": "signed_out", "user_id": user.ID})
}

func newSessionToken(ttl time.Duration) (string, [32]byte, time.Time, error) {
	var randomToken [32]byte
	if _, err := rand.Read(randomToken[:]); err != nil {
		return "", [32]byte{}, time.Time{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(randomToken[:])
	tokenHash := sha256.Sum256([]byte(token))
	expiresAt := time.Now().UTC().Add(ttl)
	return token, tokenHash, expiresAt, nil
}

func normalizeEmail(value string) (string, bool) {
	value = strings.ToLower(strings.TrimSpace(value))
	if len(value) == 0 || len(value) > 254 {
		return "", false
	}
	address, err := mail.ParseAddress(value)
	if err != nil || address.Address != value || !strings.Contains(value, "@") {
		return "", false
	}
	return value, true
}

func validatePassword(password string) error {
	if !utf8.ValidString(password) {
		return errors.New("La contraseña contiene caracteres inválidos.")
	}
	if utf8.RuneCountInString(password) < 8 {
		return errors.New("La contraseña debe tener al menos 8 caracteres.")
	}
	if len(password) > 72 {
		return errors.New("La contraseña no puede superar los 72 bytes.")
	}
	return nil
}

func normalizeContactPhone(value string) (string, bool) {
	phone := strings.TrimSpace(value)
	digits := 0
	for _, character := range phone {
		if unicode.IsDigit(character) {
			digits++
			continue
		}
		if character != '+' && character != ' ' && character != '-' && character != '(' && character != ')' && character != '.' {
			return "", false
		}
	}
	return phone, digits >= 8 && digits <= 15 && utf8.RuneCountInString(phone) <= 30
}
