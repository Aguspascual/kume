package httpapi

import (
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aguspascual/buscapolo/backend/internal/store"
)

const (
	nodusBasePath    = "/api/v1/integrations/nodus"
	nodusContract    = "1"
	nodusMaxBody     = 1 << 20
	nodusRateLimit   = 60
	maxUserPageSize  = 100
	maxEventPageSize = 50
	maxBackupPage    = 20
)

type monitorEnvelope struct {
	ContractVersion string          `json:"contract_version"`
	Application     monitorApp      `json:"application"`
	GeneratedAt     time.Time       `json:"generated_at"`
	Data            any             `json:"data"`
	Sources         []monitorSource `json:"sources"`
}

type monitorApp struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Version *string `json:"version"`
}

type monitorSource struct {
	Name   string  `json:"name"`
	State  string  `json:"state"`
	Reason *string `json:"reason"`
}

type monitorError struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

type summaryData struct {
	Status          string               `json:"status"`
	Node            nodeData             `json:"node"`
	UptimeSeconds   *int64               `json:"uptime_seconds"`
	Synchronization synchronizationData  `json:"synchronization"`
	Resources       resourceData         `json:"resources"`
	Users           userMetrics          `json:"users"`
	Backup          backupSummary        `json:"backup"`
	Deployment      deploymentData       `json:"deployment"`
}

type nodeData struct {
	ID   *string `json:"id"`
	Name *string `json:"name"`
	Role string  `json:"role"`
}

type synchronizationData struct {
	State string `json:"state"`
}

type resourceData struct {
	Scope   string             `json:"scope"`
	CPU     cpuMetrics         `json:"cpu"`
	Memory  memoryMetrics      `json:"memory"`
	Network networkMetrics     `json:"network"`
}

type cpuMetrics struct {
	UsagePercent *float64 `json:"usage_percent"`
}

type memoryMetrics struct {
	UsedBytes    *int64   `json:"used_bytes"`
	TotalBytes   *int64   `json:"total_bytes"`
	UsagePercent *float64 `json:"usage_percent"`
}

type networkMetrics struct {
	ReceiveBytesPerSecond *float64 `json:"receive_bytes_per_second"`
	SendBytesPerSecond    *float64 `json:"send_bytes_per_second"`
}

type userMetrics struct {
	ActiveSessions *int64 `json:"active_sessions"`
	UniqueToday    *int64 `json:"unique_today"`
	UniqueWeek     *int64 `json:"unique_week"`
	UniqueMonth    *int64 `json:"unique_month"`
}

type backupSummary struct {
	LastCreatedAt *time.Time `json:"last_created_at"`
	State         string     `json:"state"`
}

type deploymentData struct {
	Version *string `json:"version"`
}

type historyData struct {
	Range  string               `json:"range"`
	Points []historyPoint       `json:"points"`
}

type historyPoint struct {
	ObservedAt time.Time          `json:"observed_at"`
	Resources  historyResources   `json:"resources"`
	Users      historyUsers       `json:"users"`
}

type historyResources struct {
	CPUUsagePercent                  *float64 `json:"cpu_usage_percent"`
	MemoryUsedBytes                  *int64   `json:"memory_used_bytes"`
	MemoryTotalBytes                 *int64   `json:"memory_total_bytes"`
	NetworkReceiveBytesPerSecond     *float64 `json:"network_receive_bytes_per_second"`
	NetworkSendBytesPerSecond        *float64 `json:"network_send_bytes_per_second"`
}

type historyUsers struct {
	ActiveSessions *int64 `json:"active_sessions"`
}

type usersData struct {
	Items      []store.MonitoringUser `json:"items"`
	Page       int                    `json:"page"`
	PageSize   int                    `json:"page_size"`
	TotalItems int64                  `json:"total_items"`
	TotalPages int                    `json:"total_pages"`
	HasMore    bool                   `json:"has_more"`
}

type eventPage struct {
	Since      time.Time `json:"since"`
	Limit      int       `json:"limit"`
	Items      any       `json:"items"`
	HasMore    bool      `json:"has_more"`
	NextCursor *string   `json:"next_cursor"`
}

type accessItem struct {
	EventID   string     `json:"event_id"`
	OccurredAt time.Time `json:"occurred_at"`
	UserID    *string    `json:"user_id"`
	Source    string     `json:"source"`
	Result    string     `json:"result"`
	IPAddress *string    `json:"ip_address"`
	Reason    *string    `json:"reason"`
}

type activityItem struct {
	EventID    string     `json:"event_id"`
	OccurredAt time.Time  `json:"occurred_at"`
	Category   string     `json:"category"`
	Title      string     `json:"title"`
	Detail     *string    `json:"detail"`
	Outcome    string     `json:"outcome"`
	Result     string     `json:"result"`
}

type backupsData struct {
	Limit      int    `json:"limit"`
	Items      []any  `json:"items"`
	HasMore    bool   `json:"has_more"`
	NextCursor *string `json:"next_cursor"`
}

type dependencyItem struct {
	DependencyID string     `json:"dependency_id"`
	Name         string     `json:"name"`
	Kind         string     `json:"kind"`
	Version      *string    `json:"version"`
	State        string     `json:"state"`
	Required     bool       `json:"required"`
	CheckedAt    *time.Time `json:"checked_at"`
	Reason       *string    `json:"reason"`
}

type dependenciesData struct {
	Items []dependencyItem `json:"items"`
}

type eventCursor struct {
	Since     string `json:"since"`
	Limit     int    `json:"limit"`
	LastAt    string `json:"last_at"`
	LastID    string `json:"last_id"`
	ExpiresAt int64  `json:"expires_at"`
}

var nodusRateMu sync.Mutex

func (a *API) nodusAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		expected := strings.TrimSpace(a.monitoring.NodusToken)
		if expected == "" {
			writeMonitorError(w, http.StatusServiceUnavailable, "integration_not_configured", "La integración NODUS no tiene un token configurado.")
			return
		}
		authorization := r.Header.Get("Authorization")
		kind, token, found := strings.Cut(authorization, " ")
		token = strings.TrimSpace(token)
		valid := found && kind == "Bearer" && len(token) == len(expected) && subtle.ConstantTimeCompare([]byte(token), []byte(expected)) == 1
		if !valid {
			if found && kind == "Bearer" && len(token) >= 32 && len(token) <= 128 {
				if _, err := a.store.UserForSession(r.Context(), token); err == nil {
					writeMonitorError(w, http.StatusForbidden, "forbidden", "El token de usuario no tiene permiso de monitoreo.")
					return
				}
			}
			writeMonitorError(w, http.StatusUnauthorized, "unauthorized", "Bearer ausente, inválido o revocado.")
			return
		}

		if retryAfter := a.allowNodusRequest(time.Now()); retryAfter > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
			writeMonitorError(w, http.StatusTooManyRequests, "rate_limited", "Límite de consultas excedido.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *API) nodusNotFound(w http.ResponseWriter, _ *http.Request) {
	writeMonitorError(w, http.StatusNotFound, "not_found", "La ruta de integración no existe.")
}

func (a *API) allowNodusRequest(now time.Time) int {
	nodusRateMu.Lock()
	defer nodusRateMu.Unlock()
	if a.nodusWindowStart.IsZero() || now.Sub(a.nodusWindowStart) >= time.Minute {
		a.nodusWindowStart = now
		a.nodusRequests = 0
	}
	if a.nodusRequests >= nodusRateLimit {
		remaining := time.Minute - now.Sub(a.nodusWindowStart)
		seconds := int(math.Ceil(remaining.Seconds()))
		if seconds < 1 {
			seconds = 1
		}
		return seconds
	}
	a.nodusRequests++
	return 0
}

func (a *API) nodusSummary(w http.ResponseWriter, r *http.Request) {
	now := time.Now().UTC()
	version := optionalString(a.monitoring.ApplicationVersion)
	data := summaryData{
		Status: "unknown",
		Node: nodeData{ID: optionalString(a.monitoring.NodeID), Name: optionalString(a.monitoring.NodeName), Role: a.monitoring.NodeRole},
		Synchronization: synchronizationData{State: "unknown"},
		Resources: resourceData{Scope: "unknown"},
		Users: userMetrics{},
		Backup: backupSummary{State: "not_configured"},
		Deployment: deploymentData{Version: optionalString(a.monitoring.DeploymentVersion)},
	}
	up := int64(time.Since(a.startedAt).Seconds())
	if up >= 0 {
		data.UptimeSeconds = &up
	}

	sources := make([]monitorSource, 0, 6)
	if err := a.store.DB.Ping(r.Context()); err == nil {
		data.Status = "online"
		sources = append(sources, monitorSource{Name: "application_health", State: "available"})
	} else {
		sources = append(sources, monitorSource{Name: "application_health", State: "unavailable", Reason: stringPointer("No se pudo comprobar la conexión con PostgreSQL.")})
	}
	if data.Node.ID != nil || data.Node.Name != nil || data.Node.Role != "" {
		sources = append(sources, monitorSource{Name: "node_metadata", State: "partial", Reason: stringPointer("No todos los campos de nodo están configurados.")})
	} else {
		sources = append(sources, monitorSource{Name: "node_metadata", State: "not_configured", Reason: stringPointer("No se configuró metadata estable de nodo.")})
	}

	sample, sampleErr := a.store.LatestMonitoringSample(r.Context())
	if sampleErr == nil && sample != nil && now.Sub(sample.ObservedAt) <= 150*time.Second {
		data.Resources.Scope = "container"
		data.Resources.CPU.UsagePercent = sample.CPUUsagePercent
		data.Resources.Memory.UsedBytes = sample.MemoryUsedBytes
		data.Resources.Memory.TotalBytes = sample.MemoryTotalBytes
		if sample.MemoryUsedBytes != nil && sample.MemoryTotalBytes != nil && *sample.MemoryTotalBytes > 0 {
			percent := math.Min(100, float64(*sample.MemoryUsedBytes)/float64(*sample.MemoryTotalBytes)*100)
			data.Resources.Memory.UsagePercent = &percent
		}
		data.Resources.Network.ReceiveBytesPerSecond = sample.NetworkReceiveBytesPerSecond
		data.Resources.Network.SendBytesPerSecond = sample.NetworkSendBytesPerSecond
		if sample.CPUUsagePercent != nil || sample.MemoryUsedBytes != nil || sample.NetworkReceiveBytesPerSecond != nil || sample.NetworkSendBytesPerSecond != nil {
			if sample.CPUUsagePercent != nil && sample.MemoryUsedBytes != nil && sample.MemoryTotalBytes != nil && sample.NetworkReceiveBytesPerSecond != nil && sample.NetworkSendBytesPerSecond != nil {
				sources = append(sources, monitorSource{Name: "resource_metrics", State: "available"})
			} else {
				sources = append(sources, monitorSource{Name: "resource_metrics", State: "partial", Reason: stringPointer("Una o más métricas del contenedor no están disponibles todavía.")})
			}
		} else {
			data.Resources.Scope = "unknown"
			sources = append(sources, monitorSource{Name: "resource_metrics", State: "unavailable", Reason: stringPointer("El sistema no expuso contadores de recursos del contenedor." )})
		}
	} else {
		sources = append(sources, monitorSource{Name: "resource_metrics", State: "unavailable", Reason: stringPointer("No hay una muestra reciente de recursos del contenedor.")})
	}

	activeSessions, activeErr := a.store.GetActiveSessionCount(r.Context())
	if activeErr == nil {
		data.Users.ActiveSessions = &activeSessions
	}
	auditStartedAt, auditErr := a.store.GetAuditStartedAt(r.Context())
	uniqueComplete := auditErr == nil
	if uniqueComplete {
		dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		weekStart := dayStart.AddDate(0, 0, -((int(dayStart.Weekday()) + 6) % 7))
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		if !dayStart.Before(auditStartedAt) {
			if count, err := a.store.CountSuccessfulUsersSince(r.Context(), dayStart); err == nil { data.Users.UniqueToday = &count } else { uniqueComplete = false }
		} else { uniqueComplete = false }
		if !weekStart.Before(auditStartedAt) {
			if count, err := a.store.CountSuccessfulUsersSince(r.Context(), weekStart); err == nil { data.Users.UniqueWeek = &count } else { uniqueComplete = false }
		} else { uniqueComplete = false }
		if !monthStart.Before(auditStartedAt) {
			if count, err := a.store.CountSuccessfulUsersSince(r.Context(), monthStart); err == nil { data.Users.UniqueMonth = &count } else { uniqueComplete = false }
		} else { uniqueComplete = false }
	}
	if activeErr != nil || auditErr != nil {
		sources = append(sources, monitorSource{Name: "user_metrics", State: "unavailable", Reason: stringPointer("No se pudieron consultar las sesiones o el período de auditoría." )})
	} else if uniqueComplete {
		sources = append(sources, monitorSource{Name: "user_metrics", State: "available"})
	} else {
		sources = append(sources, monitorSource{Name: "user_metrics", State: "partial", Reason: stringPointer("Los contadores únicos solo son completos desde que comenzó la auditoría.")})
	}
	sources = append(sources, monitorSource{Name: "server_backups", State: "not_configured", Reason: stringPointer("No hay un catálogo de backups de servidor configurado.")})
	if version != nil || data.Deployment.Version != nil {
		sources = append(sources, monitorSource{Name: "deployment_metadata", State: "partial", Reason: stringPointer("Falta la versión de aplicación o de despliegue.")})
	} else {
		sources = append(sources, monitorSource{Name: "deployment_metadata", State: "not_configured", Reason: stringPointer("No se configuraron versiones de build/despliegue.")})
	}
	writeMonitorSuccess(w, monitorEnvelope{ContractVersion: nodusContract, Application: monitorApp{ID: "kume", Name: "Kume", Version: version}, GeneratedAt: now, Data: data, Sources: sources})
}

func (a *API) nodusHistory(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("range") != "15m" {
		writeMonitorError(w, http.StatusBadRequest, "invalid_request", "range debe ser 15m.")
		return
	}
	now := time.Now().UTC()
	rows, err := a.store.ListMonitoringSamples(r.Context(), now.Add(-15*time.Minute))
	if err != nil {
		writeMonitorError(w, http.StatusInternalServerError, "internal_error", "No se pudo cargar el historial de recursos.")
		return
	}
	points := make([]historyPoint, 0, len(rows))
	for _, item := range rows {
		points = append(points, historyPoint{
			ObservedAt: item.ObservedAt,
			Resources: historyResources{
				CPUUsagePercent: item.CPUUsagePercent,
				MemoryUsedBytes: item.MemoryUsedBytes,
				MemoryTotalBytes: item.MemoryTotalBytes,
				NetworkReceiveBytesPerSecond: item.NetworkReceiveBytesPerSecond,
				NetworkSendBytesPerSecond: item.NetworkSendBytesPerSecond,
			},
			Users: historyUsers{ActiveSessions: item.ActiveSessions},
		})
	}
	validPoints := 0
	completePoints := 0
	for _, point := range points {
		if point.Resources.CPUUsagePercent != nil || point.Resources.MemoryUsedBytes != nil || point.Resources.MemoryTotalBytes != nil || point.Resources.NetworkReceiveBytesPerSecond != nil || point.Resources.NetworkSendBytesPerSecond != nil {
			validPoints++
		}
		if point.Resources.CPUUsagePercent != nil && point.Resources.MemoryUsedBytes != nil && point.Resources.NetworkReceiveBytesPerSecond != nil && point.Resources.NetworkSendBytesPerSecond != nil {
			completePoints++
		}
	}
	source := monitorSource{Name: "resource_history", State: "available"}
	if validPoints == 0 {
		source = monitorSource{Name: "resource_history", State: "unavailable", Reason: stringPointer("Todavía no hay muestras reales en el rango solicitado.")}
	} else if validPoints < len(points) || completePoints < len(points) {
		source = monitorSource{Name: "resource_history", State: "partial", Reason: stringPointer("Algunos campos del historial no se pudieron medir.")}
	}
	writeMonitorSuccess(w, monitorEnvelope{ContractVersion: nodusContract, Application: a.monitorApp(), GeneratedAt: now, Data: historyData{Range: "15m", Points: points}, Sources: []monitorSource{source}})
}

func (a *API) nodusUsers(w http.ResponseWriter, r *http.Request) {
	page, err := parsePositiveQueryInt(r, "page", 1, math.MaxInt32)
	if err != nil { writeMonitorError(w, http.StatusBadRequest, "invalid_request", "page debe ser un entero positivo."); return }
	pageSize, err := parsePositiveQueryInt(r, "page_size", 100, maxUserPageSize)
	if err != nil { writeMonitorError(w, http.StatusBadRequest, "invalid_request", "page_size debe estar entre 1 y 100."); return }
	offset := int64(page-1) * int64(pageSize)
	items, total, err := a.store.ListMonitoringUsers(r.Context(), pageSize, offset)
	if err != nil { writeMonitorError(w, http.StatusInternalServerError, "internal_error", "No se pudo listar las cuentas."); return }
	totalPages := 0
	if total > 0 { totalPages = int(math.Ceil(float64(total) / float64(pageSize))) }
	data := usersData{Items: items, Page: page, PageSize: pageSize, TotalItems: total, TotalPages: totalPages, HasMore: page < totalPages}
	writeMonitorSuccess(w, monitorEnvelope{ContractVersion: nodusContract, Application: a.monitorApp(), GeneratedAt: time.Now().UTC(), Data: data, Sources: []monitorSource{{Name: "account_database", State: "available"}, {Name: "session_activity", State: "partial", Reason: stringPointer("last_seen_at solo se conoce desde la instalación de esta auditoría.")}}})
}

func (a *API) nodusAccesses(w http.ResponseWriter, r *http.Request) {
	since, limit, afterAt, afterID, err := parseEventQuery(r)
	if err != nil { writeMonitorError(w, http.StatusBadRequest, "invalid_request", err.Error()); return }
	items, err := a.store.ListAccessEvents(r.Context(), since, afterAt, afterID, limit+1)
	if err != nil { writeMonitorError(w, http.StatusInternalServerError, "internal_error", "No se pudieron consultar los accesos."); return }
	hasMore := len(items) > limit
	if hasMore { items = items[:limit] }
	result := make([]accessItem, 0, len(items))
	for _, item := range items { result = append(result, accessItem{EventID: item.EventID, OccurredAt: item.OccurredAt, UserID: item.UserID, Source: item.Source, Result: item.Result, IPAddress: item.IPAddress, Reason: item.Reason}) }
	var next *string
	if hasMore && len(items) > 0 { next = encodeCursor(since, limit, items[len(items)-1].OccurredAt, items[len(items)-1].EventID) }
	data := eventPage{Since: since, Limit: limit, Items: result, HasMore: hasMore, NextCursor: next}
	writeMonitorSuccess(w, monitorEnvelope{ContractVersion: nodusContract, Application: a.monitorApp(), GeneratedAt: time.Now().UTC(), Data: data, Sources: []monitorSource{{Name: "access_audit", State: "available"}}})
}

func (a *API) nodusActivity(w http.ResponseWriter, r *http.Request) {
	since, limit, afterAt, afterID, err := parseEventQuery(r)
	if err != nil { writeMonitorError(w, http.StatusBadRequest, "invalid_request", err.Error()); return }
	items, err := a.store.ListActivityEvents(r.Context(), since, afterAt, afterID, limit+1)
	if err != nil { writeMonitorError(w, http.StatusInternalServerError, "internal_error", "No se pudo consultar la actividad."); return }
	hasMore := len(items) > limit
	if hasMore { items = items[:limit] }
	result := make([]activityItem, 0, len(items))
	for _, item := range items { result = append(result, activityItem{EventID: item.EventID, OccurredAt: item.OccurredAt, Category: item.Category, Title: item.Title, Detail: item.Detail, Outcome: item.Outcome, Result: item.Outcome}) }
	var next *string
	if hasMore && len(items) > 0 { next = encodeCursor(since, limit, items[len(items)-1].OccurredAt, items[len(items)-1].EventID) }
	data := eventPage{Since: since, Limit: limit, Items: result, HasMore: hasMore, NextCursor: next}
	writeMonitorSuccess(w, monitorEnvelope{ContractVersion: nodusContract, Application: a.monitorApp(), GeneratedAt: time.Now().UTC(), Data: data, Sources: []monitorSource{{Name: "activity_audit", State: "available"}}})
}

func (a *API) nodusBackups(w http.ResponseWriter, r *http.Request) {
	limit, err := parsePositiveQueryInt(r, "limit", maxBackupPage, maxBackupPage)
	if err != nil { writeMonitorError(w, http.StatusBadRequest, "invalid_request", "limit debe estar entre 1 y 20."); return }
	data := backupsData{Limit: limit, Items: []any{}, HasMore: false}
	writeMonitorSuccess(w, monitorEnvelope{ContractVersion: nodusContract, Application: a.monitorApp(), GeneratedAt: time.Now().UTC(), Data: data, Sources: []monitorSource{{Name: "server_backup_catalog", State: "not_configured", Reason: stringPointer("No existe una fuente de backups de servidor; las exportaciones móviles son locales.")}}})
}

func (a *API) nodusDependencies(w http.ResponseWriter, r *http.Request) {
	now := time.Now().UTC()
	goVersion := runtime.Version()
	items := []dependencyItem{{DependencyID: "go-runtime", Name: "Go runtime", Kind: "runtime", Version: stringPointer(goVersion), State: "healthy", Required: true, CheckedAt: &now}}
	version, err := a.store.GetDatabaseVersion(r.Context())
	if err != nil {
		items = append(items, dependencyItem{DependencyID: "postgresql", Name: "PostgreSQL", Kind: "service", State: "unavailable", Required: true, CheckedAt: &now, Reason: stringPointer("No se pudo consultar la versión de PostgreSQL.")})
	} else {
		items = append(items, dependencyItem{DependencyID: "postgresql", Name: "PostgreSQL", Kind: "service", Version: stringPointer(version), State: "healthy", Required: true, CheckedAt: &now})
	}
	source := monitorSource{Name: "dependency_inventory", State: "available"}
	if err != nil { source.State = "partial"; source.Reason = stringPointer("No se pudo comprobar PostgreSQL.") }
	writeMonitorSuccess(w, monitorEnvelope{ContractVersion: nodusContract, Application: a.monitorApp(), GeneratedAt: now, Data: dependenciesData{Items: items}, Sources: []monitorSource{source}})
}

func (a *API) monitorApp() monitorApp {
	return monitorApp{ID: "kume", Name: "Kume", Version: optionalString(a.monitoring.ApplicationVersion)}
}

func optionalString(value string) *string {
	if strings.TrimSpace(value) == "" { return nil }
	value = strings.TrimSpace(value)
	return &value
}

func stringPointer(value string) *string { return &value }

func parsePositiveQueryInt(r *http.Request, name string, defaultValue, maximum int) (int, error) {
	value := r.URL.Query().Get(name)
	if value == "" { return defaultValue, nil }
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 || parsed > maximum { return 0, errors.New("invalid integer query parameter") }
	return parsed, nil
}

func parseEventQuery(r *http.Request) (time.Time, int, *time.Time, *string, error) {
	sinceValue := r.URL.Query().Get("since")
	if sinceValue == "" || !strings.HasSuffix(sinceValue, "Z") { return time.Time{}, 0, nil, nil, errors.New("since es obligatorio y debe ser RFC3339 UTC terminado en Z.") }
	since, err := time.Parse(time.RFC3339Nano, sinceValue)
	if err != nil || since.Location() != time.UTC { return time.Time{}, 0, nil, nil, errors.New("since es obligatorio y debe ser RFC3339 UTC terminado en Z.") }
	limit, err := parsePositiveQueryInt(r, "limit", maxEventPageSize, maxEventPageSize)
	if err != nil { return time.Time{}, 0, nil, nil, errors.New("limit debe estar entre 1 y 50.") }
	if value := r.URL.Query().Get("cursor"); value != "" {
		cursor, err := decodeCursor(value)
		if err != nil || cursor.Since != since.UTC().Format(time.RFC3339Nano) || cursor.Limit != limit || cursor.ExpiresAt < time.Now().Unix() {
			return time.Time{}, 0, nil, nil, errors.New("cursor inválido, vencido o asociado a otros filtros.")
		}
		lastAt, parseErr := time.Parse(time.RFC3339Nano, cursor.LastAt)
		if parseErr != nil || cursor.LastID == "" { return time.Time{}, 0, nil, nil, errors.New("cursor inválido.") }
		return since.UTC(), limit, &lastAt, &cursor.LastID, nil
	}
	return since.UTC(), limit, nil, nil, nil
}

func encodeCursor(since time.Time, limit int, lastAt time.Time, lastID string) *string {
	payload, _ := json.Marshal(eventCursor{Since: since.UTC().Format(time.RFC3339Nano), Limit: limit, LastAt: lastAt.UTC().Format(time.RFC3339Nano), LastID: lastID, ExpiresAt: time.Now().Add(15 * time.Minute).Unix()})
	value := base64.RawURLEncoding.EncodeToString(payload)
	return &value
}

func decodeCursor(value string) (eventCursor, error) {
	var cursor eventCursor
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil { return cursor, err }
	err = json.Unmarshal(decoded, &cursor)
	return cursor, err
}

func writeMonitorSuccess(w http.ResponseWriter, envelope monitorEnvelope) {
	writeMonitorJSON(w, http.StatusOK, envelope)
}

func writeMonitorError(w http.ResponseWriter, status int, code, message string) {
	writeMonitorJSON(w, status, monitorError{Error: code, Message: message})
}

func writeMonitorJSON(w http.ResponseWriter, status int, value any) {
	body, err := json.Marshal(value)
	if err != nil || len(body) > nodusMaxBody {
		status = http.StatusInternalServerError
		body, _ = json.Marshal(monitorError{Error: "internal_error", Message: "No se pudo completar la respuesta de monitoreo."})
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write(append(body, '\n'))
}

func (a *API) recordActivity(r *http.Request, userID *string, category, title, detail, outcome string) {
	if err := a.store.RecordActivity(r.Context(), userID, category, title, detail, outcome); err != nil {
		// Observability is best effort and must not break the user-facing operation.
	}
}

