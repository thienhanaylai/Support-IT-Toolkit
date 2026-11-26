package network

import (
	"strings"
	"testing"
)

func TestFormatWindowsNetworkKeepsTerminalOutputContract(t *testing.T) {
	text := formatWindowsNetwork(hostInfo{Name: "TestPC", NodeType: "Mixed"}, []Adapter{{
		Name: "Wi-Fi", Description: "Wireless Adapter", Status: "Connected",
		IPAddresses:   []string{"192.168.1.10/24", "2001:db8::10/64", "fe80::10/64"},
		AddressStates: []string{"Preferred", "Preferred", "Preferred"},
		MAC:           "00:11:22:33:44:55", DHCPEnabled: true,
		Gateways: []string{"192.168.1.1"}, DNSServers: []string{"1.1.1.1", "2606:4700:4700::1111"},
		InterfaceIndex: 18, IAID: 183021765, DUID: "00-01-00-01-2E-A4-59-DD-60-CF-84-73-27-4A",
		NetBIOS: true,
	}})
	for _, expected := range []string{
		"Windows IP Configuration", "adapter Wi-Fi", "192.168.1.10(Preferred)", "255.255.255.0",
		"2001:db8::10(Preferred)", "fe80::10%18(Preferred)", "192.168.1.1", "1.1.1.1",
		"DHCPv6 IAID . . . . . . . . . . . : 183021765",
		"DHCPv6 Client DUID. . . . . . . . : 00-01-00-01-2E-A4-59-DD-60-CF-84-73-27-4A",
		"NetBIOS over Tcpip. . . . . . . . : Enabled",
	} {
		if !strings.Contains(text, expected) {
			t.Fatalf("missing %q in %q", expected, text)
		}
	}
}

func TestFormatWindowsNetworkKeepsDisconnectedAdapterShape(t *testing.T) {
	text := formatWindowsNetwork(hostInfo{Name: "TestPC", NodeType: "Hybrid"}, []Adapter{{
		Name: "Ethernet", Kind: "Ethernet", Description: "Realtek Adapter", Status: "Disconnected",
		MAC: "60:CF:84:73:27:4A", DHCPEnabled: true, AutoConfig: true,
		IPAddresses: []string{"fe80::1/64", "169.254.1.1/16"},
	}})
	for _, expected := range []string{
		"Ethernet adapter Ethernet:", "Media State . . . . . . . . . . . : Media disconnected",
		"Physical Address. . . . . . . . . : 60-CF-84-73-27-4A",
		"Autoconfiguration Enabled . . . . : Yes",
	} {
		if !strings.Contains(text, expected) {
			t.Fatalf("missing %q in %q", expected, text)
		}
	}
	if strings.Contains(text, "IPv4 Address") || strings.Contains(text, "NetBIOS over Tcpip") {
		t.Fatalf("disconnected adapter must not expose address fields: %q", text)
	}
}

func TestFormatWindowsNetworkAlignsContinuationValues(t *testing.T) {
	text := formatWindowsNetwork(hostInfo{Name: "TestPC"}, []Adapter{{
		Name: "Wi-Fi", Status: "Connected", IPAddresses: []string{"192.168.1.10/24"},
		DNSServers: []string{"8.8.8.8", "210.245.31.221"},
	}})
	lines := strings.Split(text, "\n")
	for index, line := range lines {
		if strings.HasSuffix(line, "8.8.8.8") && index+1 < len(lines) {
			if lines[index+1] != strings.Repeat(" ", len("   DNS Servers . . . . . . . . . . . : "))+"210.245.31.221" {
				t.Fatalf("unexpected continuation indent: %q", lines[index+1])
			}
			return
		}
	}
	t.Fatalf("missing DNS continuation line in %q", text)
}
