package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/aguspascual/buscapolo/backend/internal/config"
	"github.com/aguspascual/buscapolo/backend/internal/httpapi"
	"github.com/aguspascual/buscapolo/backend/internal/monitoring"
	"github.com/aguspascual/buscapolo/backend/internal/store"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		if err := healthcheck(); err != nil {
			slog.Error("health check failed", "error", err)
			os.Exit(1)
		}
		return
	}

	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL())
	if err != nil {
		return fmt.Errorf("parse database configuration: %w", err)
	}
	poolConfig.MaxConns = 10
	poolConfig.MinConns = 0
	poolConfig.MaxConnLifetime = 30 * time.Minute
	poolConfig.MaxConnIdleTime = 5 * time.Minute

	db, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	defer db.Close()

	if err := db.Ping(ctx); err != nil {
		return fmt.Errorf("database is unavailable: %w", err)
	}
	if err := store.ApplyMigrations(ctx, db); err != nil {
		return fmt.Errorf("apply database migrations: %w", err)
	}

	dataStore := store.New(db)
	monitoringConfig := httpapi.MonitoringConfig{
		NodusToken:         cfg.NodusToken,
		ApplicationVersion: cfg.ApplicationVersion,
		DeploymentVersion:  cfg.DeploymentVersion,
		NodeID:             cfg.NodeID,
		NodeName:           cfg.NodeName,
		NodeRole:           cfg.NodeRole,
	}
	handler := httpapi.New(dataStore, cfg.SessionTTL, cfg.CORSAllowedOrigins, monitoringConfig)
	go monitoring.NewCollector(dataStore).Run(ctx)
	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	serverErr := make(chan error, 1)
	go func() {
		slog.Info("API listening", "port", cfg.Port)
		serverErr <- server.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shut down HTTP server: %w", err)
		}
		return nil
	case err := <-serverErr:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func healthcheck() error {
	client := http.Client{Timeout: 2 * time.Second}
	response, err := client.Get("http://127.0.0.1:8080/readyz")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("readiness endpoint returned %s", response.Status)
	}
	return nil
}
