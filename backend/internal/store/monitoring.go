package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

type MonitoringUser struct {
	UserID         string     `json:"user_id"`
	Email          string     `json:"email"`
	DisplayName    string     `json:"display_name"`
	CreatedAt      time.Time  `json:"created_at"`
	ActiveSessions int64      `json:"active_sessions"`
	LastSeenAt     *time.Time `json:"last_seen_at"`
}

type AccessEvent struct {
	EventID   string
	OccurredAt time.Time
	UserID    *string
	Source    string
	Result    string
	IPAddress *string
	Reason    *string
}

type ActivityEvent struct {
	EventID    string
	OccurredAt time.Time
	Category   string
	Title      string
	Detail     *string
	Outcome    string
}

type MonitoringSample struct {
	ObservedAt                     time.Time `json:"observed_at"`
	CPUUsagePercent                *float64  `json:"cpu_usage_percent"`
	MemoryUsedBytes                *int64    `json:"memory_used_bytes"`
	MemoryTotalBytes               *int64    `json:"memory_total_bytes"`
	NetworkReceiveBytesPerSecond   *float64  `json:"network_receive_bytes_per_second"`
	NetworkSendBytesPerSecond      *float64  `json:"network_send_bytes_per_second"`
	ActiveSessions                 *int64    `json:"active_sessions"`
}

func (s *Store) RecordAccess(ctx context.Context, userID *string, source, result, reason string) error {
	_, err := s.DB.Exec(ctx, `
		INSERT INTO access_events (user_id, source, result, reason)
		VALUES (NULLIF($1, '')::uuid, $2, $3, NULLIF($4, ''))
	`, nullableString(userID), source, result, reason)
	return err
}

func (s *Store) RecordActivity(ctx context.Context, userID *string, category, title, detail, outcome string) error {
	_, err := s.DB.Exec(ctx, `
		INSERT INTO activity_events (actor_user_id, category, title, detail, outcome)
		VALUES (NULLIF($1, '')::uuid, $2, $3, NULLIF($4, ''), $5)
	`, nullableString(userID), category, title, detail, outcome)
	return err
}

func nullableString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func (s *Store) GetActiveSessionCount(ctx context.Context) (int64, error) {
	var count int64
	err := s.DB.QueryRow(ctx, `SELECT count(*) FROM auth_sessions WHERE expires_at > now()`).Scan(&count)
	return count, err
}

func (s *Store) GetAuditStartedAt(ctx context.Context) (time.Time, error) {
	var startedAt time.Time
	err := s.DB.QueryRow(ctx, `SELECT value FROM monitoring_metadata WHERE name = 'audit_started_at'`).Scan(&startedAt)
	return startedAt, err
}

func (s *Store) CountSuccessfulUsersSince(ctx context.Context, since time.Time) (int64, error) {
	var count int64
	err := s.DB.QueryRow(ctx, `
		SELECT count(DISTINCT user_id)
		FROM access_events
		WHERE result = 'success' AND user_id IS NOT NULL AND occurred_at >= $1
	`, since).Scan(&count)
	return count, err
}

func (s *Store) ListMonitoringUsers(ctx context.Context, limit int, offset int64) ([]MonitoringUser, int64, error) {
	var total int64
	if err := s.DB.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := s.DB.Query(ctx, `
		SELECT u.id::text, u.email, u.display_name, u.created_at,
		       (SELECT count(*) FROM auth_sessions s WHERE s.user_id = u.id AND s.expires_at > now()),
	       (SELECT max(a.occurred_at) FROM access_events a WHERE a.user_id = u.id AND a.result = 'success')
		FROM users u
		ORDER BY u.created_at ASC, u.id ASC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]MonitoringUser, 0, limit)
	for rows.Next() {
		var item MonitoringUser
		if err := rows.Scan(&item.UserID, &item.Email, &item.DisplayName, &item.CreatedAt, &item.ActiveSessions, &item.LastSeenAt); err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (s *Store) ListAccessEvents(ctx context.Context, since time.Time, afterAt *time.Time, afterID *string, limit int) ([]AccessEvent, error) {
	query := `
		SELECT event_id::text, occurred_at, user_id::text, source, result, ip_address::text, reason
		FROM access_events
		WHERE occurred_at >= $1
		ORDER BY occurred_at ASC, event_id ASC
		LIMIT $2
	`
	args := []any{since, limit}
	if afterAt != nil && afterID != nil {
		query = `
			SELECT event_id::text, occurred_at, user_id::text, source, result, ip_address::text, reason
			FROM access_events
			WHERE occurred_at >= $1 AND (occurred_at, event_id) > ($2, $3::uuid)
			ORDER BY occurred_at ASC, event_id ASC
			LIMIT $4
		`
		args = []any{since, *afterAt, *afterID, limit}
	}
	rows, err := s.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]AccessEvent, 0, limit)
	for rows.Next() {
		var item AccessEvent
		if err := rows.Scan(&item.EventID, &item.OccurredAt, &item.UserID, &item.Source, &item.Result, &item.IPAddress, &item.Reason); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) ListActivityEvents(ctx context.Context, since time.Time, afterAt *time.Time, afterID *string, limit int) ([]ActivityEvent, error) {
	query := `
		SELECT event_id::text, occurred_at, category, title, detail, outcome
		FROM activity_events
		WHERE occurred_at >= $1
		ORDER BY occurred_at ASC, event_id ASC
		LIMIT $2
	`
	args := []any{since, limit}
	if afterAt != nil && afterID != nil {
		query = `
			SELECT event_id::text, occurred_at, category, title, detail, outcome
			FROM activity_events
			WHERE occurred_at >= $1 AND (occurred_at, event_id) > ($2, $3::uuid)
			ORDER BY occurred_at ASC, event_id ASC
			LIMIT $4
		`
		args = []any{since, *afterAt, *afterID, limit}
	}
	rows, err := s.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]ActivityEvent, 0, limit)
	for rows.Next() {
		var item ActivityEvent
		if err := rows.Scan(&item.EventID, &item.OccurredAt, &item.Category, &item.Title, &item.Detail, &item.Outcome); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) GetDatabaseVersion(ctx context.Context) (string, error) {
	var version string
	err := s.DB.QueryRow(ctx, `SELECT current_setting('server_version')`).Scan(&version)
	return version, err
}

func (s *Store) InsertMonitoringSample(ctx context.Context, sample MonitoringSample) error {
	_, err := s.DB.Exec(ctx, `
		INSERT INTO monitoring_samples (
			observed_at, cpu_usage_percent, memory_used_bytes, memory_total_bytes,
			network_receive_bytes_per_second, network_send_bytes_per_second, active_sessions
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (observed_at) DO UPDATE SET
			cpu_usage_percent = EXCLUDED.cpu_usage_percent,
			memory_used_bytes = EXCLUDED.memory_used_bytes,
			memory_total_bytes = EXCLUDED.memory_total_bytes,
			network_receive_bytes_per_second = EXCLUDED.network_receive_bytes_per_second,
			network_send_bytes_per_second = EXCLUDED.network_send_bytes_per_second,
			active_sessions = EXCLUDED.active_sessions
	`, sample.ObservedAt, sample.CPUUsagePercent, sample.MemoryUsedBytes, sample.MemoryTotalBytes, sample.NetworkReceiveBytesPerSecond, sample.NetworkSendBytesPerSecond, sample.ActiveSessions)
	return err
}

func (s *Store) DeleteOldMonitoringData(ctx context.Context, retention, sampleRetention time.Duration) error {
	cutoff := time.Now().UTC().Add(-retention)
	if _, err := s.DB.Exec(ctx, `DELETE FROM monitoring_samples WHERE observed_at < $1`, time.Now().UTC().Add(-sampleRetention)); err != nil {
		return err
	}
	if _, err := s.DB.Exec(ctx, `DELETE FROM access_events WHERE occurred_at < $1`, cutoff); err != nil {
		return err
	}
	_, err := s.DB.Exec(ctx, `DELETE FROM activity_events WHERE occurred_at < $1`, cutoff)
	return err
}

func (s *Store) LatestMonitoringSample(ctx context.Context) (*MonitoringSample, error) {
	var sample MonitoringSample
	err := s.DB.QueryRow(ctx, `
		SELECT observed_at, cpu_usage_percent, memory_used_bytes, memory_total_bytes,
		       network_receive_bytes_per_second, network_send_bytes_per_second, active_sessions
		FROM monitoring_samples
		ORDER BY observed_at DESC
	LIMIT 1
	`).Scan(&sample.ObservedAt, &sample.CPUUsagePercent, &sample.MemoryUsedBytes, &sample.MemoryTotalBytes, &sample.NetworkReceiveBytesPerSecond, &sample.NetworkSendBytesPerSecond, &sample.ActiveSessions)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &sample, nil
}

func (s *Store) ListMonitoringSamples(ctx context.Context, since time.Time) ([]MonitoringSample, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT observed_at, cpu_usage_percent, memory_used_bytes, memory_total_bytes,
		       network_receive_bytes_per_second, network_send_bytes_per_second, active_sessions
		FROM monitoring_samples
		WHERE observed_at >= $1
		ORDER BY observed_at ASC
	`, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]MonitoringSample, 0, 16)
	for rows.Next() {
		var item MonitoringSample
		if err := rows.Scan(&item.ObservedAt, &item.CPUUsagePercent, &item.MemoryUsedBytes, &item.MemoryTotalBytes, &item.NetworkReceiveBytesPerSecond, &item.NetworkSendBytesPerSecond, &item.ActiveSessions); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
