//go:build windows

package network

import (
	"os/exec"
	"strings"
	"testing"
)

// TestAdaptersMatchIpconfigReference compares the API-derived values with the
// ipconfig output used as the v0.1.9 reference. ipconfig is only invoked by the
// test, never by the Agent runtime.
func TestAdaptersMatchIpconfigReference(t *testing.T) {
	result, err := Adapters()
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Adapters) == 0 {
		t.Fatal("no adapters returned")
	}
	reference, err := exec.Command("ipconfig", "/all").Output()
	if err != nil {
		t.Skipf("ipconfig reference unavailable: %v", err)
	}
	text := string(reference)
	connected := 0
	for _, adapter := range result.Adapters {
		header := adapter.Kind + " adapter " + adapter.Name + ":"
		if !strings.Contains(text, header) {
			t.Fatalf("adapter header %q missing from ipconfig reference", header)
		}
		if adapter.Status != "Connected" {
			continue
		}
		connected++
		if adapter.MAC != "" && !strings.Contains(text, strings.ReplaceAll(adapter.MAC, ":", "-")) {
			t.Fatalf("MAC %q missing for %s", adapter.MAC, adapter.Name)
		}
		for _, value := range append(append([]string{}, adapter.Gateways...), adapter.DNSServers...) {
			if !strings.Contains(text, value) {
				t.Fatalf("%q missing for %s", value, adapter.Name)
			}
		}
		if adapter.DUID != "" && !strings.Contains(text, adapter.DUID) {
			t.Fatalf("DUID %q missing for %s", adapter.DUID, adapter.Name)
		}
	}
	if connected == 0 {
		t.Skip("no connected adapter to compare")
	}
	for _, expected := range []string{"Windows IP Configuration", "Host Name", "Node Type"} {
		if !strings.Contains(result.Text, expected) {
			t.Fatalf("missing %q in formatted text", expected)
		}
	}
}
