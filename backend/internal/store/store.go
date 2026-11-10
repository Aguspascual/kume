package store

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrEmailTaken       = errors.New("email already registered")
	ErrUserNotFound     = errors.New("user not found")
	ErrSessionInvalid   = errors.New("session is invalid or expired")
	ErrRevisionConflict = errors.New("data revision conflict")
)

type User struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	DisplayName  string `json:"display_name"`
	ContactPhone string `json:"contact_phone"`
}

type DataRecord struct {
	Revision  int64     `json:"revision"`
	Value     []byte    `json:"-"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Store struct {
	DB *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{DB: db}
}

func (s *Store) CreateAccount(ctx context.Context, email, displayName, contactPhone, passwordHash string, tokenHash [32]byte, expiresAt time.Time) (User, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx)

	var user User
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, display_name, contact_phone, password_hash)
		VALUES ($1, $2, $3, $4)
		RETURNING id::text, email, display_name, contact_phone
	`, email, displayName, contactPhone, passwordHash).Scan(&user.ID, &user.Email, &user.DisplayName, &user.ContactPhone)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return User{}, ErrEmailTaken
		}
		return User{}, err
	}
	userUUID, err := parseUserID(user.ID)
	if err != nil {
		return User{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, tokenHash[:], userUUID, expiresAt); err != nil {
		return User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return user, nil
}

func (s *Store) UserCredentials(ctx context.Context, email string) (User, string, error) {
	var user User
	var passwordHash string
	err := s.DB.QueryRow(ctx, `
		SELECT id::text, email, display_name, contact_phone, password_hash
		FROM users WHERE email = $1
	`, email).Scan(&user.ID, &user.Email, &user.DisplayName, &user.ContactPhone, &passwordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, "", ErrUserNotFound
	}
	return user, passwordHash, err
}

func (s *Store) CreateSession(ctx context.Context, userID string, tokenHash [32]byte, expiresAt time.Time) error {
	userUUID, err := parseUserID(userID)
	if err != nil {
		return err
	}
	if _, err := s.DB.Exec(ctx, `DELETE FROM auth_sessions WHERE expires_at <= now()`); err != nil {
		return err
	}
	_, err = s.DB.Exec(ctx, `INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, tokenHash[:], userUUID, expiresAt)
	return err
}

func (s *Store) UserForSession(ctx context.Context, token string) (User, error) {
	tokenHash := sha256.Sum256([]byte(token))
	var user User
	err := s.DB.QueryRow(ctx, `
		SELECT u.id::text, u.email, u.display_name, u.contact_phone
		FROM auth_sessions AS s
		JOIN users AS u ON u.id = s.user_id
		WHERE s.token_hash = $1 AND s.expires_at > now()
	`, tokenHash[:]).Scan(&user.ID, &user.Email, &user.DisplayName, &user.ContactPhone)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrSessionInvalid
	}
	return user, err
}

func (s *Store) UpdateProfile(ctx context.Context, userID, displayName, contactPhone string) (User, error) {
	userUUID, err := parseUserID(userID)
	if err != nil {
		return User{}, err
	}
	var user User
	err = s.DB.QueryRow(ctx, `
		UPDATE users
		SET display_name = $2, contact_phone = $3
		WHERE id = $1
		RETURNING id::text, email, display_name, contact_phone
	`, userUUID, displayName, contactPhone).Scan(&user.ID, &user.Email, &user.DisplayName, &user.ContactPhone)
	return user, err
}

func (s *Store) RevokeSession(ctx context.Context, token string) error {
	tokenHash := sha256.Sum256([]byte(token))
	_, err := s.DB.Exec(ctx, `DELETE FROM auth_sessions WHERE token_hash = $1`, tokenHash[:])
	return err
}

func SupportedCollection(collection string) bool {
	switch collection {
	case "clientes", "presupuestos", "trabajos", "tiposTrabajo":
		return true
	default:
		return false
	}
}

func (s *Store) GetData(ctx context.Context, userID, collection string) (DataRecord, error) {
	userUUID, err := parseUserID(userID)
	if err != nil {
		return DataRecord{}, err
	}
	var record DataRecord
	err = s.DB.QueryRow(ctx, `
		SELECT revision, payload, updated_at
		FROM user_data WHERE user_id = $1 AND collection = $2
	`, userUUID, collection).Scan(&record.Revision, &record.Value, &record.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return DataRecord{Revision: 0, Value: []byte("[]")}, nil
	}
	return record, err
}

func (s *Store) PutData(ctx context.Context, userID, collection string, expectedRevision int64, value []byte) (DataRecord, error) {
	userUUID, err := parseUserID(userID)
	if err != nil {
		return DataRecord{}, err
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return DataRecord{}, err
	}
	defer tx.Rollback(ctx)

	lockKey := userID + ":" + collection
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, lockKey); err != nil {
		return DataRecord{}, err
	}

	var currentRevision int64
	err = tx.QueryRow(ctx, `SELECT revision FROM user_data WHERE user_id = $1 AND collection = $2 FOR UPDATE`, userUUID, collection).Scan(&currentRevision)
	if errors.Is(err, pgx.ErrNoRows) {
		currentRevision = 0
	} else if err != nil {
		return DataRecord{}, err
	}
	if currentRevision != expectedRevision {
		return DataRecord{}, ErrRevisionConflict
	}

	var record DataRecord
	if currentRevision == 0 {
		err = tx.QueryRow(ctx, `
			INSERT INTO user_data (user_id, collection, revision, payload)
			VALUES ($1, $2, 1, $3::jsonb)
			RETURNING revision, payload, updated_at
		`, userUUID, collection, string(value)).Scan(&record.Revision, &record.Value, &record.UpdatedAt)
	} else {
		err = tx.QueryRow(ctx, `
			UPDATE user_data
			SET revision = revision + 1, payload = $3::jsonb, updated_at = now()
			WHERE user_id = $1 AND collection = $2
			RETURNING revision, payload, updated_at
		`, userUUID, collection, string(value)).Scan(&record.Revision, &record.Value, &record.UpdatedAt)
	}
	if err != nil {
		return DataRecord{}, fmt.Errorf("save user collection: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return DataRecord{}, err
	}
	return record, nil
}

func parseUserID(userID string) (pgtype.UUID, error) {
	var parsed pgtype.UUID
	if err := parsed.Scan(userID); err != nil {
		return pgtype.UUID{}, fmt.Errorf("invalid user ID: %w", err)
	}
	return parsed, nil
}
