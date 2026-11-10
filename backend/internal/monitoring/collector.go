package monitoring

import (
	"bufio"
	"context"
	"log/slog"
	"math"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aguspascual/buscapolo/backend/internal/store"
)

const (
	sampleInterval = time.Minute
	historyRetention = 7 * 24 * time.Hour
	auditRetention = 90 * 24 * time.Hour
)

type containerCounters struct {
	cpuUsec   uint64
	cpuAt     time.Time
	receive   uint64
	send      uint64
	networkAt time.Time
}

type Collector struct {
	mu      sync.Mutex
	last    *containerCounters
	store   *store.Store
}

func NewCollector(dataStore *store.Store) *Collector {
	return &Collector{store: dataStore}
}

func (c *Collector) Run(ctx context.Context) {
	if err := c.Sample(ctx); err != nil {
		slog.Warn("initial monitoring sample failed", "error", err)
	}
	ticker := time.NewTicker(sampleInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := c.Sample(ctx); err != nil {
				slog.Warn("monitoring sample failed", "error", err)
			}
		}
	}
}

func (c *Collector) Sample(ctx context.Context) error {
	observedAt := time.Now().UTC()
	sample := store.MonitoringSample{ObservedAt: observedAt}
	cpuUsec, quotaCPUs, cpuOK := readCPU()
	receive, send, networkOK := readNetwork()
	used, total, memoryOK := readMemory()
	if memoryOK {
		sample.MemoryUsedBytes = &used
		sample.MemoryTotalBytes = total
	}

	c.mu.Lock()
	if c.last != nil {
		cpuElapsed := observedAt.Sub(c.last.cpuAt).Seconds()
		if c.last.cpuAt.IsZero() && cpuOK {
			c.last.cpuUsec, c.last.cpuAt = cpuUsec, observedAt
		} else if cpuElapsed > 0 && cpuOK && cpuUsec >= c.last.cpuUsec {
			percent := float64(cpuUsec-c.last.cpuUsec) / 1_000_000 / cpuElapsed / quotaCPUs * 100
			if !math.IsNaN(percent) && !math.IsInf(percent, 0) {
				if percent < 0 {
					percent = 0
				}
				if percent > 100 {
					percent = 100
				}
				sample.CPUUsagePercent = &percent
			}
			c.last.cpuUsec, c.last.cpuAt = cpuUsec, observedAt
		}
		networkElapsed := observedAt.Sub(c.last.networkAt).Seconds()
		if c.last.networkAt.IsZero() && networkOK {
			c.last.receive, c.last.send, c.last.networkAt = receive, send, observedAt
		} else if networkElapsed > 0 && networkOK && receive >= c.last.receive && send >= c.last.send {
			rxRate := float64(receive-c.last.receive) / networkElapsed
			txRate := float64(send-c.last.send) / networkElapsed
			sample.NetworkReceiveBytesPerSecond = &rxRate
			sample.NetworkSendBytesPerSecond = &txRate
			c.last.receive, c.last.send, c.last.networkAt = receive, send, observedAt
		}
	} else if cpuOK || networkOK {
		c.last = &containerCounters{}
		if cpuOK {
			c.last.cpuUsec, c.last.cpuAt = cpuUsec, observedAt
		}
		if networkOK {
			c.last.receive, c.last.send, c.last.networkAt = receive, send, observedAt
		}
	}
	c.mu.Unlock()

	if sessions, err := c.store.GetActiveSessionCount(ctx); err == nil {
		sample.ActiveSessions = &sessions
	}
	if err := c.store.InsertMonitoringSample(ctx, sample); err != nil {
		return err
	}
	return c.store.DeleteOldMonitoringData(ctx, auditRetention, historyRetention)
}

func readCPU() (usageUsec uint64, quotaCPUs float64, ok bool) {
	file, err := os.Open("/sys/fs/cgroup/cpu.stat")
	if err != nil {
		return 0, 0, false
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 2 && fields[0] == "usage_usec" {
			usageUsec, err = strconv.ParseUint(fields[1], 10, 64)
			if err != nil {
				return 0, 0, false
			}
			quotaCPUs = readCPUQuota()
			return usageUsec, quotaCPUs, quotaCPUs > 0
		}
	}
	return 0, 0, false
}

func readCPUQuota() float64 {
	contents, err := os.ReadFile("/sys/fs/cgroup/cpu.max")
	if err == nil {
		fields := strings.Fields(string(contents))
		if len(fields) == 2 && fields[0] != "max" {
			quota, qErr := strconv.ParseFloat(fields[0], 64)
			period, pErr := strconv.ParseFloat(fields[1], 64)
			if qErr == nil && pErr == nil && quota > 0 && period > 0 {
				return quota / period
			}
		}
	}
	if runtime.NumCPU() > 0 {
		return float64(runtime.NumCPU())
	}
	return 1
}

func readMemory() (used int64, total *int64, ok bool) {
	current, err := os.ReadFile("/sys/fs/cgroup/memory.current")
	if err != nil {
		return 0, nil, false
	}
	used, err = strconv.ParseInt(strings.TrimSpace(string(current)), 10, 64)
	if err != nil || used < 0 {
		return 0, nil, false
	}
	maximum, err := os.ReadFile("/sys/fs/cgroup/memory.max")
	if err == nil {
		value := strings.TrimSpace(string(maximum))
		if value != "max" {
			if parsed, parseErr := strconv.ParseInt(value, 10, 64); parseErr == nil && parsed >= 0 {
				total = &parsed
			}
		}
	}
	return used, total, true
}

func readNetwork() (receive uint64, send uint64, ok bool) {
	file, err := os.Open("/proc/net/dev")
	if err != nil {
		return 0, 0, false
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.Contains(line, ":") {
			continue
		}
		name, values, _ := strings.Cut(line, ":")
		if strings.TrimSpace(name) == "lo" {
			continue
		}
		fields := strings.Fields(values)
		if len(fields) < 9 {
			return 0, 0, false
		}
		rx, rxErr := strconv.ParseUint(fields[0], 10, 64)
		tx, txErr := strconv.ParseUint(fields[8], 10, 64)
		if rxErr != nil || txErr != nil {
			return 0, 0, false
		}
		receive += rx
		send += tx
	}
	return receive, send, scanner.Err() == nil
}

