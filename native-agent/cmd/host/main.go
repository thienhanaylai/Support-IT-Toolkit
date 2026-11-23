package main

import (
	"bufio"
	"bytes"
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
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

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

func commandOutput(ctx context.Context, program string, args []string, maxOutput int, progress func(string)) ([]byte, error) {
	cmd := exec.CommandContext(ctx, program, args...)
	if progress == nil {
		return cmd.CombinedOutput()
	}
	pipe, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	var output bytes.Buffer
	scanner := bufio.NewScanner(pipe)
	scanner.Buffer(make([]byte, 4096), 64*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if output.Len() < maxOutput {
			output.WriteString(line)
			output.WriteByte('\n')
		}
		if line != "" {
			progress(trimOutput([]byte(line), 500))
		}
	}
	scanErr := scanner.Err()
	runErr := cmd.Wait()
	if scanErr != nil {
		return output.Bytes(), scanErr
	}
	return output.Bytes(), runErr
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
	if runtime.GOOS != "windows" {
		return nil, errors.New("ping chỉ hỗ trợ Windows")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(count*(timeout+1000))*time.Millisecond)
	defer cancel()
	// -n and -w are fixed flags; host cannot begin with '-'.
	out, runErr := commandOutput(ctx, "ping", []string{"-n", strconv.Itoa(count), "-w", strconv.Itoa(timeout), host}, 8192, progress)
	if ctx.Err() != nil {
		return nil, errors.New("ping hết thời gian chờ")
	}
	raw := trimOutput(out, 8192)
	times := parseTimes(raw)
	received := len(times)
	min, max, avg := 0, 0, 0
	if received > 0 {
		min, max = times[0], times[0]
		for _, v := range times {
			avg += v
			if v < min {
				min = v
			}
			if v > max {
				max = v
			}
		}
		avg /= received
	}
	if runErr != nil && len(out) == 0 {
		return nil, runErr
	}
	return response{
		"target": host, "sent": count, "received": received,
		"loss": 100 * (count - received) / count, "min": min, "avg": avg, "max": max,
		"timesMs": times, "raw": raw,
		"note": "Thống kê dựa trên các phản hồi có thời gian (ms); xem raw nếu Windows dùng ngôn ngữ khác.",
	}, nil
}

var timePattern = regexp.MustCompile(`(?i)(?:time|thời gian)[=<]\s*(\d+)\s*ms`)

func parseTimes(raw string) []int {
	var times []int
	for _, match := range timePattern.FindAllStringSubmatch(raw, 5) {
		n, _ := strconv.Atoi(match[1])
		times = append(times, n)
	}
	return times
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
	if runtime.GOOS != "windows" {
		return nil, errors.New("traceroute chỉ hỗ trợ Windows")
	}
	// Windows tracert probes 3 times per hop.
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(hops*3*(timeout+500))*time.Millisecond)
	defer cancel()
	out, runErr := commandOutput(ctx, "tracert", []string{"-d", "-h", strconv.Itoa(hops), "-w", strconv.Itoa(timeout), host}, 24000, progress)
	raw := trimOutput(out, 24000)
	if ctx.Err() != nil {
		return response{"target": host, "raw": raw, "timedOut": true}, nil
	}
	if runErr != nil && len(out) == 0 {
		return nil, runErr
	}
	lines := strings.Split(raw, "\n")
	route := make([]string, 0, hops)
	hopPattern := regexp.MustCompile(`^\s*\d{1,2}\s+`)
	for _, line := range lines {
		if hopPattern.MatchString(line) {
			route = append(route, strings.TrimSpace(line))
		}
	}
	return response{"target": host, "hops": route, "raw": raw}, nil
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
		kind = "A"
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Millisecond)
	defer cancel()
	start := time.Now()
	var values []string
	r := net.DefaultResolver
	switch kind {
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
	default:
		return nil, errors.New("recordType không được hỗ trợ")
	}
	if err != nil {
		return nil, err
	}
	if len(values) > 50 {
		values = values[:50]
	}
	return response{"name": host, "recordType": kind, "records": values, "durationMs": time.Since(start).Milliseconds(), "resolver": "DNS của hệ điều hành"}, nil
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

func trimOutput(data []byte, max int) string {
	if len(data) > max {
		data = data[:max]
	}
	return strings.ToValidUTF8(string(data), "�")
}
