package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	toolkiticmp "it-support-toolkit/native-agent/internal/icmp"
	"it-support-toolkit/native-agent/internal/security"
)

const maxMessage = 64 * 1024
const maxResponse = 900 * 1024

type request struct {
	Action     string `json:"action"`
	Target     string `json:"target"`
	Host       string `json:"host"`
	Name       string `json:"name"`
	Count      int    `json:"count"`
	MaxHops    int    `json:"maxHops"`
	Port       int    `json:"port"`
	Ports      []int  `json:"ports"`
	TimeoutMs  int    `json:"timeoutMs"`
	RecordType string `json:"recordType"`
	Resolver   string `json:"resolver"`
	Stream     bool   `json:"stream"`
}

type response map[string]any

func main() {
	input := bufio.NewReader(os.Stdin)
	output := bufio.NewWriter(os.Stdout)
	for {
		var length uint32
		if err := binary.Read(input, binary.LittleEndian, &length); err != nil {
			if err != io.EOF {
				fmt.Fprintln(os.Stderr, "native messaging read error:", err)
			}
			return
		}
		if length == 0 || length > maxMessage {
			// Cannot safely resynchronize the framing after an oversized request.
			_ = write(output, response{"success": false, "error": "request quá lớn"})
			return
		}
		var req request
		raw := make([]byte, length)
		if _, err := io.ReadFull(input, raw); err != nil {
			return
		}
		if err := json.Unmarshal(raw, &req); err != nil {
			_ = write(output, response{"success": false, "error": "JSON không hợp lệ"})
			continue
		}
		var result response
		if req.Stream {
			result = dispatchStream(req, output)
		} else {
			result = dispatch(req)
		}
		if err := write(output, result); err != nil {
			fmt.Fprintln(os.Stderr, "native messaging write error:", err)
			return
		}
	}
}

func write(w *bufio.Writer, data response) error {
	body, err := json.Marshal(data)
	if err != nil {
		return err
	}
	if len(body) > maxResponse {
		body = []byte(`{"success":false,"error":"response quá lớn"}`)
	}
	if err := binary.Write(w, binary.LittleEndian, uint32(len(body))); err != nil {
		return err
	}
	if _, err := w.Write(body); err != nil {
		return err
	}
	return w.Flush()
}

func fail(action string, err error) response {
	return response{"success": false, "action": action, "error": err.Error()}
}

func dispatchStream(req request, output *bufio.Writer) response {
	timeout, err := security.Range(req.TimeoutMs, 500, 10000, 3000)
	if err != nil {
		return fail(req.Action, err)
	}
	var outputLock sync.Mutex
	progressCount := 0
	sendProgress := func(text string, completed, total int) {
		outputLock.Lock()
		defer outputLock.Unlock()
		if progressCount >= 100 {
			return
		}
		progressCount++
		event := response{"type": "progress", "text": trimOutput([]byte(text), 500)}
		if total > 0 {
			event["completed"] = completed
			event["total"] = total
		}
		_ = write(output, event)
	}
	var result response
	switch req.Action {
	case "ping":
		result, err = pingWithProgress(req, timeout, func(line string) { sendProgress(line, 0, 0) })
	case "traceroute":
		result, err = tracerouteWithProgress(req, timeout, func(line string) { sendProgress(line, 0, 0) })
	case "port_scan":
		result, err = portScanWithProgress(req, timeout, func(item scanPortResult, completed, total int) {
			service := item.Service
			if service == "" {
				service = "TCP"
			}
			sendProgress(fmt.Sprintf("Cổng %d (%s): %s · %d/%d", item.Port, service, item.State, completed, total), completed, total)
		})
	default:
		return dispatch(req)
	}
	if err != nil {
		return fail(req.Action, err)
	}
	result["success"] = true
	result["action"] = req.Action
	return result
}

func dispatch(req request) response {
	// Actions are hardcoded. Never interpolate user input into a shell.
	var result response
	var err error
	timeout, err := security.Range(req.TimeoutMs, 500, 10000, 3000)
	if err != nil {
		return fail(req.Action, err)
	}
	switch req.Action {
	case "ping":
		result, err = ping(req, timeout)
	case "traceroute":
		result, err = traceroute(req, timeout)
	case "tcp_check":
		result, err = tcpCheck(req, timeout)
	case "port_scan":
		result, err = portScan(req, timeout)
	case "dns_lookup":
		result, err = dnsLookup(req, timeout)
	case "tls_check":
		result, err = tlsCheck(req, timeout)
	case "local_interfaces":
		result, err = localInterfaces()
	case "public_ip":
		result, err = publicIP(timeout)
	default:
		return fail(req.Action, errors.New("action không được hỗ trợ"))
	}
	if err != nil {
		return fail(req.Action, err)
	}
	result["success"] = true
	result["action"] = req.Action
	return result
}

func checkedHost(value string) (string, error) { return security.Host(value) }

func ping(req request, timeout int) (response, error) {
	return pingWithProgress(req, timeout, nil)
}

// commandOutput remains temporarily for the legacy public_ip action while
// installed v0.1.9 extensions are still supported. Network probes no longer
// use it; the compatibility action is removed in the final Zero CMD phase.
func commandOutput(ctx context.Context, program string, args []string, _ int, _ func(string)) ([]byte, error) {
	return exec.CommandContext(ctx, program, args...).CombinedOutput()
}

func pingWithProgress(req request, timeout int, progress func(string)) (response, error) {
	host, err := checkedHost(req.Target)
	if err != nil {
		return nil, err
	}
	count, err := security.Range(req.Count, 1, 5, 4)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(count*(timeout+1000))*time.Millisecond)
	defer cancel()
	result, err := toolkiticmp.Ping(ctx, host, count, timeout, progress)
	if err != nil {
		if ctx.Err() != nil {
			return nil, errors.New("ping hết thời gian chờ")
		}
		return nil, err
	}
	return response{
		"target": host, "sent": result.Sent, "received": result.Received,
		"loss": result.Loss, "min": result.Min, "avg": result.Average, "max": result.Max,
		"timesMs": result.Times, "raw": trimOutput([]byte(result.Raw), 8192),
		"note": "Thống kê dựa trên các phản hồi có thời gian (ms); xem raw nếu Windows dùng ngôn ngữ khác.",
	}, nil
}

func traceroute(req request, timeout int) (response, error) {
	return tracerouteWithProgress(req, timeout, nil)
}

func tracerouteWithProgress(req request, timeout int, progress func(string)) (response, error) {
	host, err := checkedHost(req.Target)
	if err != nil {
		return nil, err
	}
	hops, err := security.Range(req.MaxHops, 1, 30, 20)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(hops*3*(timeout+500))*time.Millisecond)
	defer cancel()
	result, err := toolkiticmp.Trace(ctx, host, hops, timeout, progress)
	if err != nil {
		return nil, err
	}
	response := response{"target": host, "hops": result.Hops, "raw": trimOutput([]byte(result.Raw), 24000)}
	if result.TimedOut {
		response["timedOut"] = true
	}
	return response, nil
}

func tcpCheck(req request, timeout int) (response, error) {
	host, err := checkedHost(req.Target)
	if err != nil {
		return nil, err
	}
	port, err := security.Range(req.Port, 1, 65535, 0)
	if err != nil || port == 0 {
		return nil, errors.New("port phải từ 1 đến 65535")
	}
	start := time.Now()
	conn, dialErr := net.DialTimeout("tcp", net.JoinHostPort(host, strconv.Itoa(port)), time.Duration(timeout)*time.Millisecond)
	elapsed := time.Since(start).Milliseconds()
	if dialErr != nil {
		state := "closed"
		if n, ok := dialErr.(net.Error); ok && n.Timeout() {
			state = "timeout"
		}
		return response{"target": host, "port": port, "open": false, "state": state, "durationMs": elapsed, "detail": dialErr.Error()}, nil
	}
	_ = conn.Close()
	return response{"target": host, "port": port, "open": true, "state": "open", "durationMs": elapsed}, nil
}

func dnsLookup(req request, timeout int) (response, error) {
	host, err := checkedHost(req.Name)
	if err != nil {
		return nil, err
	}
	kind := strings.ToUpper(req.RecordType)
	if kind == "" {
		kind = "AUTO"
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Millisecond)
	defer cancel()
	start := time.Now()
	var values []string
	r, resolverName, err := resolverForRequest(req.Resolver, timeout)
	if err != nil {
		return nil, err
	}
	if kind == "AUTO" {
		if net.ParseIP(host) != nil {
			kind = "PTR"
		} else {
			kind = "A/AAAA"
		}
	}
	switch kind {
	case "A/AAAA":
		var records []net.IPAddr
		records, err = r.LookupIPAddr(ctx, host)
		for _, item := range records {
			values = append(values, item.IP.String())
		}
	case "A", "AAAA":
		ips, e := r.LookupIP(ctx, "ip4", host)
		if kind == "AAAA" {
			ips, e = r.LookupIP(ctx, "ip6", host)
		}
		err = e
		for _, ip := range ips {
			values = append(values, ip.String())
		}
	case "MX":
		var records []*net.MX
		records, err = r.LookupMX(ctx, host)
		for _, item := range records {
			values = append(values, fmt.Sprintf("%d %s", item.Pref, item.Host))
		}
	case "TXT":
		values, err = r.LookupTXT(ctx, host)
	case "NS":
		var records []*net.NS
		records, err = r.LookupNS(ctx, host)
		for _, item := range records {
			values = append(values, item.Host)
		}
	case "CNAME":
		var name string
		name, err = r.LookupCNAME(ctx, host)
		if err == nil {
			values = []string{name}
		}
	case "PTR":
		if net.ParseIP(host) == nil {
			return nil, errors.New("PTR yêu cầu địa chỉ IPv4 hoặc IPv6")
		}
		values, err = r.LookupAddr(ctx, host)
	default:
		return nil, errors.New("recordType không được hỗ trợ")
	}
	if err != nil {
		return nil, err
	}
	if len(values) > 50 {
		values = values[:50]
	}
	return response{"name": host, "recordType": kind, "records": values, "durationMs": time.Since(start).Milliseconds(), "resolver": resolverName}, nil
}

func resolverForRequest(value string, timeout int) (*net.Resolver, string, error) {
	server := strings.TrimSpace(value)
	if server == "" {
		return net.DefaultResolver, "DNS của hệ điều hành", nil
	}
	address, err := dnsServerAddress(server)
	if err != nil {
		return nil, "", err
	}
	dialer := &net.Dialer{Timeout: time.Duration(timeout) * time.Millisecond}
	resolver := &net.Resolver{
		PreferGo:     true,
		StrictErrors: true,
		Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, network, address)
		},
	}
	return resolver, address, nil
}

func dnsServerAddress(value string) (string, error) {
	if ip := net.ParseIP(value); ip != nil {
		return net.JoinHostPort(ip.String(), "53"), nil
	}
	host, portText, err := net.SplitHostPort(value)
	if err != nil || net.ParseIP(strings.Trim(host, "[]")) == nil {
		return "", errors.New("DNS server phải là địa chỉ IP, có thể kèm port")
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 {
		return "", errors.New("port DNS phải từ 1 đến 65535")
	}
	return net.JoinHostPort(strings.Trim(host, "[]"), strconv.Itoa(port)), nil
}

func tlsCheck(req request, timeout int) (response, error) {
	host, err := checkedHost(req.Host)
	if err != nil {
		return nil, err
	}
	port, err := security.Range(req.Port, 1, 65535, 443)
	if err != nil {
		return nil, err
	}
	dialer := &net.Dialer{Timeout: time.Duration(timeout) * time.Millisecond}
	// Retrieve the chain even if verification fails; verify explicitly below.
	conn, err := tls.DialWithDialer(dialer, "tcp", net.JoinHostPort(host, strconv.Itoa(port)), &tls.Config{
		ServerName: host, MinVersion: tls.VersionTLS12, InsecureSkipVerify: true, // verified via x509.Verify
	})
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(time.Duration(timeout) * time.Millisecond))
	state := conn.ConnectionState()
	if len(state.PeerCertificates) == 0 {
		return nil, errors.New("máy chủ không gửi certificate")
	}
	leaf := state.PeerCertificates[0]
	intermediates := x509.NewCertPool()
	for _, cert := range state.PeerCertificates[1:] {
		intermediates.AddCert(cert)
	}
	_, verificationError := leaf.Verify(x509.VerifyOptions{DNSName: host, Intermediates: intermediates})
	chain := make([]response, 0, len(state.PeerCertificates))
	for _, cert := range state.PeerCertificates {
		chain = append(chain, response{
			"subject": cert.Subject.String(), "issuer": cert.Issuer.String(),
			"notBefore": cert.NotBefore.Format(time.RFC3339), "notAfter": cert.NotAfter.Format(time.RFC3339),
		})
	}
	version := map[uint16]string{tls.VersionTLS12: "TLS 1.2", tls.VersionTLS13: "TLS 1.3"}[state.Version]
	result := response{"host": host, "port": port, "verified": verificationError == nil,
		"tlsVersion": version, "subject": leaf.Subject.String(), "issuer": leaf.Issuer.String(),
		"notBefore": leaf.NotBefore.Format(time.RFC3339), "notAfter": leaf.NotAfter.Format(time.RFC3339),
		"dnsNames": leaf.DNSNames, "chain": chain,
	}
	if verificationError != nil {
		result["verificationError"] = verificationError.Error()
	}
	return result, nil
}

func localInterfaces() (response, error) {
	list, err := net.Interfaces()
	if err != nil {
		return nil, err
	}
	adapters := make([]response, 0)
	for _, item := range list {
		if item.Flags&net.FlagUp == 0 || item.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := item.Addrs()
		ips := make([]string, 0)
		for _, addr := range addrs {
			ips = append(ips, addr.String())
		}
		adapters = append(adapters, response{"name": item.Name, "ipAddresses": ips, "mac": item.HardwareAddr.String()})
	}
	result := response{"adapters": adapters}
	if runtime.GOOS == "windows" {
		// Fixed OS commands with no user-controlled arguments.
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if raw, err := exec.CommandContext(ctx, "ipconfig", "/all").CombinedOutput(); err == nil {
			result["ipconfig"] = trimOutput(raw, 16000) // includes gateway and DNS in system locale
		}
	}
	return result, nil
}

func publicIP(timeout int) (response, error) {
	if runtime.GOOS != "windows" {
		return nil, errors.New("IP Public chỉ hỗ trợ Windows")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout+1000)*time.Millisecond)
	defer cancel()
	// The executable, flags and URL are fixed. No user input is passed to curl or a shell.
	program, args := publicIPCommand(timeout)
	out, runErr := commandOutput(ctx, program, args, 256, nil)
	if ctx.Err() != nil {
		return nil, errors.New("curl ifconfig.me hết thời gian chờ")
	}
	if runErr != nil {
		message := strings.TrimSpace(trimOutput(out, 200))
		if message != "" {
			return nil, fmt.Errorf("curl ifconfig.me thất bại: %s", message)
		}
		return nil, fmt.Errorf("curl ifconfig.me thất bại: %w", runErr)
	}
	ip, err := parsePublicIPOutput(out)
	if err != nil {
		return nil, err
	}
	return response{"ip": ip}, nil
}

func publicIPCommand(timeout int) (string, []string) {
	seconds := (timeout + 999) / 1000
	return "curl.exe", []string{
		"--fail", "--silent", "--show-error",
		"--max-time", strconv.Itoa(seconds),
		"https://ifconfig.me/ip",
	}
}

func parsePublicIPOutput(out []byte) (string, error) {
	ip := strings.TrimSpace(trimOutput(out, 256))
	if net.ParseIP(ip) == nil {
		return "", errors.New("ifconfig.me không trả về địa chỉ IP hợp lệ")
	}
	return ip, nil
}

func trimOutput(data []byte, max int) string {
	if len(data) > max {
		data = data[:max]
	}
	return strings.ToValidUTF8(string(data), "�")
}
