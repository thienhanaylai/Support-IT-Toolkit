package main

import (
	"context"
	"errors"
	"net"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

const maxScanPorts = 32
const maxConcurrentChecks = 6

type scanPortResult struct {
	Port       int    `json:"port"`
	State      string `json:"state"`
	Service    string `json:"service,omitempty"`
	DurationMs int64  `json:"durationMs"`
}

var commonServices = map[int]string{
	21: "FTP", 22: "SSH", 25: "SMTP", 53: "DNS", 80: "HTTP",
	110: "POP3", 143: "IMAP", 443: "HTTPS", 445: "SMB",
	465: "SMTPS", 587: "SMTP", 993: "IMAPS", 995: "POP3S",
	1433: "MSSQL", 3306: "MySQL", 3389: "RDP", 5432: "PostgreSQL",
	6379: "Redis", 8080: "HTTP", 8443: "HTTPS",
}

func validateScanPorts(ports []int) error {
	if len(ports) == 0 || len(ports) > maxScanPorts {
		return errors.New("chỉ quét từ 1 đến 32 cổng mỗi lần")
	}
	seen := make(map[int]bool, len(ports))
	for _, port := range ports {
		if port < 1 || port > 65535 || seen[port] {
			return errors.New("cổng TCP phải từ 1 đến 65535 và không được trùng")
		}
		seen[port] = true
	}
	return nil
}

func portScan(req request, timeout int) (response, error) {
	return portScanWithProgress(req, timeout, nil)
}

func portScanWithProgress(req request, timeout int, progress func(scanPortResult, int, int)) (response, error) {
	host, err := checkedHost(req.Target)
	if err != nil {
		return nil, err
	}
	if err := validateScanPorts(req.Ports); err != nil {
		return nil, err
	}
	if timeout > 2000 {
		timeout = 2000
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	started := time.Now()

	address := host
	if net.ParseIP(host) == nil {
		dnsCtx, dnsCancel := context.WithTimeout(ctx, 3*time.Second)
		ips, err := net.DefaultResolver.LookupIPAddr(dnsCtx, host)
		dnsCancel()
		if err != nil {
			return nil, err
		}
		if len(ips) == 0 {
			return nil, errors.New("không tìm thấy địa chỉ IP của target")
		}
		address = ips[0].IP.String()
		for _, ip := range ips {
			if ip.IP.To4() != nil {
				address = ip.IP.String()
				break
			}
		}
	}

	results := make([]scanPortResult, len(req.Ports))
	slots := make(chan struct{}, maxConcurrentChecks)
	var group sync.WaitGroup
	var completed atomic.Int32
	for index, port := range req.Ports {
		group.Add(1)
		go func(index, port int) {
			defer group.Done()
			item := scanPortResult{Port: port, Service: commonServices[port], State: "timeout"}
			select {
			case slots <- struct{}{}:
				defer func() { <-slots }()
			case <-ctx.Done():
				results[index] = item
				if progress != nil {
					progress(item, int(completed.Add(1)), len(req.Ports))
				}
				return
			}
			start := time.Now()
			dialer := &net.Dialer{Timeout: time.Duration(timeout) * time.Millisecond}
			conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(address, strconv.Itoa(port)))
			item.DurationMs = time.Since(start).Milliseconds()
			if err == nil {
				item.State = "open"
				_ = conn.Close()
			} else if netErr, ok := err.(net.Error); !ok || !netErr.Timeout() {
				if ctx.Err() == nil {
					item.State = "closed"
				}
			}
			results[index] = item
			if progress != nil {
				progress(item, int(completed.Add(1)), len(req.Ports))
			}
		}(index, port)
	}
	group.Wait()

	openCount, closedCount, timeoutCount := 0, 0, 0
	for _, item := range results {
		switch item.State {
		case "open":
			openCount++
		case "closed":
			closedCount++
		default:
			timeoutCount++
		}
	}
	return response{
		"target": host, "resolvedIp": address, "ports": results,
		"scannedCount": len(results), "openCount": openCount,
		"closedCount": closedCount, "timeoutCount": timeoutCount,
		"durationMs": time.Since(started).Milliseconds(),
		"note":       "Chỉ thử kết nối TCP từ máy bạn; dịch vụ chỉ là gợi ý theo số cổng, không xác minh ứng dụng. Firewall có thể gây timeout. Không quét UDP.",
	}, nil
}
