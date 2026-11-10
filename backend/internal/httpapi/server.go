package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aguspascual/buscapolo/backend/internal/store"
)

const maxRequestBody = 4 << 20

type API struct {
	store              *store.Store
	sessionTTL         time.Duration
	allowedOrigins     map[string]struct{}
	monitoring         MonitoringConfig
	startedAt          time.Time
	nodusRequests      int
	nodusWindowStart   time.Time
}

type MonitoringConfig struct {
	NodusToken        string
	ApplicationVersion string
	DeploymentVersion  string
	NodeID             string
	NodeName           string
	NodeRole           string
}

type userContextKey struct{}

func New(dataStore *store.Store, sessionTTL time.Duration, allowedOrigins map[string]struct{}, monitoring MonitoringConfig) http.Handler {
	api := &API{store: dataStore, sessionTTL: sessionTTL, allowedOrigins: allowedOrigins, monitoring: monitoring, startedAt: time.Now()}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", api.health)
	mux.HandleFunc("GET /readyz", api.ready)
	mux.HandleFunc("POST /api/v1/auth/register", api.register)
	mux.HandleFunc("POST /api/v1/auth/login", api.login)
	mux.Handle("POST /api/v1/auth/logout", api.authenticate(http.HandlerFunc(api.logout)))
	mux.Handle("GET /api/v1/me", api.authenticate(http.HandlerFunc(api.me)))
	mux.Handle("PUT /api/v1/me", api.authenticate(http.HandlerFunc(api.updateMe)))
	mux.Handle("GET /api/v1/data/{collection}", api.authenticate(http.HandlerFunc(api.getData)))
	mux.Handle("PUT /api/v1/data/{collection}", api.authenticate(http.HandlerFunc(api.putData)))
	mux.Handle("GET /api/v1/integrations/nodus/summary", api.nodusAuth(http.HandlerFunc(api.nodusSummary)))
	mux.Handle("GET /api/v1/integrations/nodus/history", api.nodusAuth(http.HandlerFunc(api.nodusHistory)))
	mux.Handle("GET /api/v1/integrations/nodus/users", api.nodusAuth(http.HandlerFunc(api.nodusUsers)))
	mux.Handle("GET /api/v1/integrations/nodus/accesses", api.nodusAuth(http.HandlerFunc(api.nodusAccesses)))
	mux.Handle("GET /api/v1/integrations/nodus/backups", api.nodusAuth(http.HandlerFunc(api.nodusBackups)))
	mux.Handle("GET /api/v1/integrations/nodus/activity", api.nodusAuth(http.HandlerFunc(api.nodusActivity)))
	mux.Handle("GET /api/v1/integrations/nodus/dependencies", api.nodusAuth(http.HandlerFunc(api.nodusDependencies)))
	mux.HandleFunc("GET /api/v1/integrations/nodus", api.nodusNotFound)
	mux.HandleFunc("GET /api/v1/integrations/nodus/{path...}", api.nodusNotFound)

	return api.securityHeaders(api.cors(mux))
}

func (a *API) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *API) ready(w http.ResponseWriter, r *http.Request) {
	if err := a.store.DB.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database_unavailable", "La base de datos no está disponible.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (a *API) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization := r.Header.Get("Authorization")
		if !strings.HasPrefix(authorization, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Iniciá sesión para continuar.")
			return
		}
		token := strings.TrimSpace(strings.TrimPrefix(authorization, "Bearer "))
		if len(token) < 32 || len(token) > 128 {
			writeError(w, http.StatusUnauthorized, "unauthorized", "La sesión no es válida o venció.")
			return
		}
		user, err := a.store.UserForSession(r.Context(), token)
		if err != nil {
			if errors.Is(err, store.ErrSessionInvalid) {
				writeError(w, http.StatusUnauthorized, "unauthorized", "La sesión no es válida o venció.")
				return
			}
			writeError(w, http.StatusInternalServerError, "internal_error", "No se pudo validar la sesión.")
			return
		}
		ctx := context.WithValue(r.Context(), userContextKey{}, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *API) me(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(userContextKey{}).(store.User)
	writeJSON(w, http.StatusOK, map[string]store.User{"user": user})
}

func (a *API) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if _, ok := a.allowedOrigins[origin]; !ok {
				writeError(w, http.StatusForbidden, "origin_not_allowed", "El origen no está habilitado.")
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *API) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, destination any) error {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return errors.New("content type must be application/json")
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBody))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("request must contain one JSON value")
		}
		return err
	}
	return nil
}

func parseRevision(value string) (int64, error) {
	value = strings.TrimSpace(value)
	if len(value) >= 2 && value[0] == '"' && value[len(value)-1] == '"' {
		value = value[1 : len(value)-1]
	}
	if value == "" || strings.Contains(value, ",") || value == "*" {
		return 0, errors.New("invalid revision")
	}
	revision, err := strconv.ParseInt(value, 10, 64)
	if err != nil || revision < 0 {
		return 0, errors.New("invalid revision")
	}
	return revision, nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		return
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"error": code, "message": message})
}

func setETag(w http.ResponseWriter, revision int64) {
	w.Header().Set("ETag", fmt.Sprintf("\"%d\"", revision))
}
