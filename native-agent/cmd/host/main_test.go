package main

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"net"
	"runtime"
	"strings"
	"testing"
)

func TestDispatchRejectsUnknownActionAndInvalidHost(t *testing.T) {
	for _, req := range []request{
		{Action: "run_shell", Target: "example.com"},
		{Action: "tcp_check", Target: "-n", Port: 80},
		{Action: "ping", Target: "x.com;whoami"},
		{Action: "traceroute", Target: "example.com", MaxHops: 500},
		{Action: "tcp_check", Target: "example.com", Port: 65536},
		{Action: "public_ip"},
	} {
		result := dispatch(req)
		if result["success"] != false {
			t.Errorf("%q should fail: %v", req.Action, result)
		}
	}
}

func TestNativeMessagingFrame(t *testing.T) {
	var buffer bytes.Buffer
	if err := write(bufio.NewWriter(&buffer), response{"success": true, "action": "test"}); err != nil {
		t.Fatal(err)
	}
	data := buffer.Bytes()
	if len(data) < 4 || int(binary.LittleEndian.Uint32(data[:4])) != len(data)-4 {
		t.Fatal("incorrect native messaging length prefix")
	}
	var result response
	if err := json.Unmarshal(data[4:], &result); err != nil {
		t.Fatal(err)
	}
	if result["success"] != true {
		t.Fatalf("unexpected response: %v", result)
	}
}

func TestTCPCheckLocalListener(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	result := dispatch(request{Action: "tcp_check", Target: "127.0.0.1", Port: port, TimeoutMs: 1000})
	if result["success"] != true || result["open"] != true {
		t.Fatalf("local TCP check failed: %v", result)
	}
}

func TestPortScanRejectsInvalidPorts(t *testing.T) {
	for _, ports := range [][]int{
		nil, {0}, {65536}, {80, 80}, make([]int, 33),
	} {
		result := dispatch(request{Action: "port_scan", Target: "127.0.0.1", Ports: ports})
		if result["success"] != false {
			t.Errorf("should reject ports %v: %v", ports, result)
		}
	}
}

func TestPortScanLocalListener(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	result := dispatch(request{Action: "port_scan", Target: "127.0.0.1", Ports: []int{port}, TimeoutMs: 1000})
	if result["success"] != true || result["openCount"] != 1 {
		t.Fatalf("local scan failed: %v", result)
	}
	rows, ok := result["ports"].([]scanPortResult)
	if !ok || len(rows) != 1 || rows[0].State != "open" {
		t.Fatalf("unexpected scan rows: %v", result["ports"])
	}
}

func TestStreamPortScanSendsProgressBeforeFinalResult(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	var frames bytes.Buffer
	writer := bufio.NewWriter(&frames)
	result := dispatchStream(request{Action: "port_scan", Target: "127.0.0.1", Ports: []int{port, 1}, TimeoutMs: 500}, writer)
	if err := write(writer, result); err != nil {
		t.Fatal(err)
	}
	reader := bytes.NewReader(frames.Bytes())
	var messages []response
	for reader.Len() > 0 {
		var size uint32
		if err := binary.Read(reader, binary.LittleEndian, &size); err != nil {
			t.Fatal(err)
		}
		body := make([]byte, size)
		if _, err := reader.Read(body); err != nil {
			t.Fatal(err)
		}
		var message response
		if err := json.Unmarshal(body, &message); err != nil {
			t.Fatal(err)
		}
		messages = append(messages, message)
	}
	if len(messages) != 3 || messages[0]["type"] != "progress" || messages[1]["type"] != "progress" ||
		messages[2]["success"] != true || messages[2]["openCount"] != float64(1) {
		t.Fatalf("unexpected stream sequence: %v", messages)
	}
	if messages[1]["completed"] != float64(2) || messages[1]["total"] != float64(2) {
		t.Fatalf("missing scan progress: %v", messages[1])
	}
}

func TestStreamPingEmitsLinesAndFinalResult(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows ping flags")
	}
	var frames bytes.Buffer
	writer := bufio.NewWriter(&frames)
	result := dispatchStream(request{Action: "ping", Target: "127.0.0.1", Count: 1, TimeoutMs: 1000}, writer)
	if result["success"] != true || result["raw"] == "" {
		t.Fatalf("ping failed: %v", result)
	}
	if frames.Len() == 0 {
		t.Fatal("ping did not emit any progress before final result")
	}
}

func TestDNSServerAddress(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"1.1.1.1", "1.1.1.1:53"},
		{"8.8.8.8:5353", "8.8.8.8:5353"},
		{"2606:4700:4700::1111", "[2606:4700:4700::1111]:53"},
		{"[2001:4860:4860::8888]:53", "[2001:4860:4860::8888]:53"},
	}
	for _, test := range tests {
		got, err := dnsServerAddress(test.input)
		if err != nil || got != test.want {
			t.Fatalf("dnsServerAddress(%q) = %q, %v; want %q", test.input, got, err, test.want)
		}
	}
	for _, invalid := range []string{"dns.google", "1.1.1.1:0", "1.1.1.1:70000"} {
		if _, err := dnsServerAddress(invalid); err == nil {
			t.Fatalf("expected invalid DNS server %q to fail", invalid)
		}
	}
}

func TestLocalInterfacesKeepsPublicSchemaWhileUsingIPHelperText(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows IP Helper API")
	}
	result := dispatch(request{Action: "local_interfaces", TimeoutMs: 3000})
	if result["success"] != true {
		t.Fatalf("local interfaces failed: %v", result)
	}
	text, ok := result["ipconfig"].(string)
	if !ok || !strings.Contains(text, "Windows IP Configuration") {
		t.Fatalf("missing compatible ipconfig text: %v", result["ipconfig"])
	}
	adapters, ok := result["adapters"].([]response)
	if !ok || len(adapters) == 0 {
		t.Fatalf("missing connected adapters: %T %v", result["adapters"], result["adapters"])
	}
	for _, adapter := range adapters {
		if len(adapter) != 3 || adapter["name"] == nil || adapter["ipAddresses"] == nil || adapter["mac"] == nil {
			t.Fatalf("public adapter schema changed: %v", adapter)
		}
	}
}
