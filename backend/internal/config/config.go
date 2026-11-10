package config

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port               string
	DBHost             string
	DBPort             string
	DBName             string
	DBUser             string
	DBPassword         string
	DBSSLMode          string
	SessionTTL         time.Duration
	CORSAllowedOrigins map[string]struct{}
	NodusToken         string
	ApplicationVersion string
	DeploymentVersion  string
	NodeID             string
	NodeName           string
	NodeRole           string
}

func Load() (Config, error) {
	cfg := Config{
		Port:       env("PORT", "8080"),
		DBHost:     env("DB_HOST", "db"),
		DBPort:     env("DB_PORT", "5432"),
		DBName:     env("DB_NAME", "kume"),
		DBUser:     env("DB_USER", "kume"),
		DBPassword: os.Getenv("DB_PASSWORD"),
		DBSSLMode:  env("DB_SSLMODE", "disable"),
		NodusToken: os.Getenv("NODUS_KUME_TOKEN"),
		ApplicationVersion: strings.TrimSpace(os.Getenv("KUME_APP_VERSION")),
		DeploymentVersion:  strings.TrimSpace(os.Getenv("KUME_DEPLOYMENT_VERSION")),
		NodeID:             strings.TrimSpace(os.Getenv("KUME_NODE_ID")),
		NodeName:           strings.TrimSpace(os.Getenv("KUME_NODE_NAME")),
		NodeRole:           strings.TrimSpace(os.Getenv("KUME_NODE_ROLE")),
	}
	if cfg.DBPassword == "" {
		return Config{}, errors.New("DB_PASSWORD is required")
	}
	if _, err := strconv.Atoi(cfg.Port); err != nil {
		return Config{}, fmt.Errorf("PORT must be a number: %w", err)
	}
	if _, err := strconv.Atoi(cfg.DBPort); err != nil {
		return Config{}, fmt.Errorf("DB_PORT must be a number: %w", err)
	}

	ttl, err := time.ParseDuration(env("SESSION_TTL", "720h"))
	if err != nil || ttl < time.Hour || ttl > 90*24*time.Hour {
		return Config{}, errors.New("SESSION_TTL must be between 1h and 2160h")
	}
	cfg.SessionTTL = ttl
	cfg.CORSAllowedOrigins = make(map[string]struct{})
	for _, origin := range strings.Split(os.Getenv("CORS_ALLOWED_ORIGINS"), ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			cfg.CORSAllowedOrigins[origin] = struct{}{}
		}
	}
	return cfg, nil
}

func (c Config) DatabaseURL() string {
	u := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(c.DBUser, c.DBPassword),
		Host:   net.JoinHostPort(c.DBHost, c.DBPort),
		Path:   "/" + c.DBName,
	}
	query := u.Query()
	query.Set("sslmode", c.DBSSLMode)
	u.RawQuery = query.Encode()
	return u.String()
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
