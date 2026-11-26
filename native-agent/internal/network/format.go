package network

import (
	"fmt"
	"net"
	"strings"
	"time"
)

func formatWindowsNetwork(host hostInfo, adapters []Adapter) string {
	lines := []string{"Windows IP Configuration", "",
		"   Host Name . . . . . . . . . . . . : " + host.Name,
		"   Primary Dns Suffix  . . . . . . . : " + host.Suffix,
		"   Node Type . . . . . . . . . . . . : " + host.NodeType,
		"   IP Routing Enabled. . . . . . . . : " + yesNo(host.Routing),
		"   WINS Proxy Enabled. . . . . . . . : " + yesNo(host.WINSProxy)}
	if host.Scope != "" {
		lines = append(lines, "   NetBIOS Scope ID . . . . . . . . : "+host.Scope)
	}
	for _, a := range adapters {
		kind := a.Kind
		if kind == "" {
			kind = "Unknown"
		}
		lines = append(lines, "", fmt.Sprintf("%s adapter %s:", kind, a.Name), "")
		if a.Status != "Connected" {
			lines = append(lines, "   Media State . . . . . . . . . . . : Media disconnected")
		}
		lines = append(lines,
			"   Connection-specific DNS Suffix  . : "+a.DNSSuffix,
			"   Description . . . . . . . . . . . : "+a.Description,
			"   Physical Address. . . . . . . . . : "+strings.ReplaceAll(a.MAC, ":", "-"),
			"   DHCP Enabled. . . . . . . . . . . : "+yesNo(a.DHCPEnabled),
			"   Autoconfiguration Enabled . . . . : "+yesNo(a.AutoConfig))
		if a.Status != "Connected" {
			continue
		}
		for index, address := range a.IPAddresses {
			ip, prefix, err := net.ParseCIDR(address)
			if err != nil {
				continue
			}
			state := ""
			if index < len(a.AddressStates) && a.AddressStates[index] != "" {
				state = "(" + a.AddressStates[index] + ")"
			}
			if ip.To4() != nil {
				lines = append(lines, "   IPv4 Address. . . . . . . . . . . : "+ip.String()+state, "   Subnet Mask . . . . . . . . . . . : "+net.IP(prefix.Mask).String())
			} else {
				label := "IPv6 Address. . . . . . . . . . ."
				value := ip.String()
				if ip.IsLinkLocalUnicast() {
					label = "Link-local IPv6 Address . . . . ."
					value += fmt.Sprintf("%%%d", a.InterfaceIndex)
				}
				lines = append(lines, "   "+label+" : "+value+state)
			}
		}
		if a.DHCPEnabled && a.LeaseObtained > 0 {
			lines = append(lines, "   Lease Obtained. . . . . . . . . . : "+leaseTime(a.LeaseObtained))
		}
		if a.DHCPEnabled && a.LeaseExpires > 0 {
			lines = append(lines, "   Lease Expires . . . . . . . . . . : "+leaseTime(a.LeaseExpires))
		}
		lines = appendValues(lines, "   Default Gateway . . . . . . . . . : ", a.Gateways)
		if a.DHCPServer != "" && a.DHCPServer != "0.0.0.0" {
			lines = append(lines, "   DHCP Server . . . . . . . . . . . : "+a.DHCPServer)
		}
		if a.DUID != "" {
			lines = append(lines, fmt.Sprintf("   DHCPv6 IAID . . . . . . . . . . . : %d", a.IAID), "   DHCPv6 Client DUID. . . . . . . . : "+a.DUID)
		}
		lines = appendValues(lines, "   DNS Servers . . . . . . . . . . . : ", a.DNSServers)
		if len(a.WINS) > 0 {
			lines = appendValues(lines, "   WINS Servers. . . . . . . . . . . : ", a.WINS)
		}
		netbios := "Disabled"
		if a.NetBIOS {
			netbios = "Enabled"
		}
		lines = append(lines, "   NetBIOS over Tcpip. . . . . . . . : "+netbios)
	}
	return strings.Join(lines, "\n")
}

func appendValues(lines []string, label string, values []string) []string {
	if len(values) == 0 {
		return append(lines, label)
	}
	lines = append(lines, label+values[0])
	for _, value := range values[1:] {
		lines = append(lines, strings.Repeat(" ", len(label))+value)
	}
	return lines
}

func yesNo(value bool) string {
	if value {
		return "Yes"
	}
	return "No"
}
func leaseTime(value int64) string {
	return time.Unix(value, 0).Local().Format("Monday, January 2, 2006 3:04:05 PM")
}
