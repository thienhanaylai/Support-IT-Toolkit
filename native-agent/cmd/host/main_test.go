package main

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"net"
	"testing"
)

func TestDispatchRejectsUnknownActionAndInvalidHost(t *testing.T) {
	for _, req := range []request{
		{Action: "run_shell", Target: "example.com"},
		{Action: "tcp_check", Target: "-n", Port: 80},
		{Action: "ping", Target: "x.com;whoami"},
		{Action: "traceroute", Target: "example.com", MaxHops: 500},
		{Action: "tcp_check", Target: "example.com", Port: 65536},
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
