//go:build windows

package network

import (
	"strings"
	"testing"
)

func TestAdaptersWindowsAPIContract(t *testing.T) {
	result, err := Adapters()
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Adapters) == 0 {
		t.Fatal("no adapters returned")
	}
	connected := 0
	for _, adapter := range result.Adapters {
		header := adapter.Kind + " adapter " + adapter.Name + ":"
		if !strings.Contains(result.Text, header) {
			t.Fatalf("adapter header %q missing from formatted API result", header)
		}
		if adapter.Status != "Connected" {
			continue
		}
		connected++
		if adapter.MAC != "" && !strings.Contains(result.Text, strings.ReplaceAll(adapter.MAC, ":", "-")) {
			t.Fatalf("MAC %q missing for %s", adapter.MAC, adapter.Name)
		}
		for _, value := range append(append([]string{}, adapter.Gateways...), adapter.DNSServers...) {
			if !strings.Contains(result.Text, value) {
				t.Fatalf("%q missing for %s", value, adapter.Name)
			}
		}
		if adapter.DUID != "" && !strings.Contains(result.Text, adapter.DUID) {
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
