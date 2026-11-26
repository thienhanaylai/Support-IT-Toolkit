//go:build windows

package network

import (
	"errors"
	"fmt"
	"net"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

const adapterFlagDHCPEnabled = 0x00000004

func Adapters() (Result, error) {
	const flags = windows.GAA_FLAG_INCLUDE_PREFIX | windows.GAA_FLAG_INCLUDE_GATEWAYS
	size := uint32(15 * 1024)
	for attempt := 0; attempt < 3; attempt++ {
		buffer := make([]byte, size)
		first := (*windows.IpAdapterAddresses)(unsafe.Pointer(&buffer[0]))
		err := windows.GetAdaptersAddresses(windows.AF_UNSPEC, flags, 0, first, &size)
		if errors.Is(err, windows.ERROR_BUFFER_OVERFLOW) {
			continue
		}
		if err != nil {
			return Result{}, err
		}
		adapters := collectAdapters(first)
		if err := enrichAdapters(adapters); err != nil {
			return Result{}, err
		}
		host, err := readHostInfo()
		if err != nil {
			return Result{}, err
		}
		return Result{Adapters: adapters, Text: formatWindowsNetwork(host, adapters)}, nil
	}
	return Result{}, errors.New("GetAdaptersAddresses thay đổi kích thước buffer quá nhiều lần")
}

func collectAdapters(first *windows.IpAdapterAddresses) []Adapter {
	adapters := make([]Adapter, 0)
	for current := first; current != nil; current = current.Next {
		if current.IfType == windows.IF_TYPE_SOFTWARE_LOOPBACK {
			continue
		}
		addresses := make([]string, 0)
		addressStates := make([]string, 0)
		for item := current.FirstUnicastAddress; item != nil; item = item.Next {
			if ip := item.Address.IP(); ip != nil {
				addresses = append(addresses, fmt.Sprintf("%s/%d", ip.String(), item.OnLinkPrefixLength))
				addressStates = append(addressStates, dadStateText(item.DadState))
			}
		}
		gateways := make([]string, 0)
		for item := current.FirstGatewayAddress; item != nil; item = item.Next {
			if ip := item.Address.IP(); ip != nil && !ip.IsUnspecified() {
				gateways = append(gateways, ip.String())
			}
		}
		dnsServers := make([]string, 0)
		for item := current.FirstDnsServerAddress; item != nil; item = item.Next {
			if ip := item.Address.IP(); ip != nil {
				dnsServers = append(dnsServers, ip.String())
			}
		}
		mac := ""
		if length := int(current.PhysicalAddressLength); length > 0 && length <= len(current.PhysicalAddress) {
			mac = strings.ToUpper(net.HardwareAddr(current.PhysicalAddress[:length]).String())
		}
		name := windows.UTF16PtrToString(current.FriendlyName)
		if name == "" && current.AdapterName != nil {
			name = bytePtrString(current.AdapterName)
		}
		adapters = append(adapters, Adapter{
			Name: name, Description: windows.UTF16PtrToString(current.Description),
			IPAddresses: addresses, AddressStates: addressStates, MAC: mac, Gateways: gateways, DNSServers: dnsServers,
			DHCPEnabled:    current.Flags&adapterFlagDHCPEnabled != 0,
			InterfaceIndex: current.IfIndex, Status: operStatus(current.OperStatus), MTU: current.Mtu,
			LinkSpeed: current.ReceiveLinkSpeed,
			DNSSuffix: windows.UTF16PtrToString(current.DnsSuffix), Kind: adapterKind(current.IfType),
			NetBIOS: current.Flags&0x40 != 0, IAID: current.Dhcpv6Iaid,
			DUID: formatDUID(current.Dhcpv6ClientDuid[:], current.Dhcpv6ClientDuidLength),
		})
	}
	return adapters
}

func dadStateText(state int32) string {
	switch state {
	case windows.IpDadStatePreferred:
		return "Preferred"
	case windows.IpDadStateDeprecated:
		return "Deprecated"
	case windows.IpDadStateTentative:
		return "Tentative"
	case windows.IpDadStateDuplicate:
		return "Duplicate"
	default:
		return ""
	}
}

func adapterKind(kind uint32) string {
	switch kind {
	case windows.IF_TYPE_ETHERNET_CSMACD:
		return "Ethernet"
	case windows.IF_TYPE_IEEE80211:
		return "Wireless LAN"
	case windows.IF_TYPE_PPP:
		return "PPP"
	case windows.IF_TYPE_TUNNEL:
		return "Tunnel"
	default:
		return "Unknown"
	}
}

func formatDUID(value []byte, length uint32) string {
	if length == 0 || int(length) > len(value) {
		return ""
	}
	parts := make([]string, length)
	for i, b := range value[:length] {
		parts[i] = fmt.Sprintf("%02X", b)
	}
	return strings.Join(parts, "-")
}

func bytePtrString(value *byte) string {
	if value == nil {
		return ""
	}
	length := 0
	for *(*byte)(unsafe.Add(unsafe.Pointer(value), length)) != 0 && length < 1024 {
		length++
	}
	return string(unsafe.Slice(value, length))
}

func operStatus(status uint32) string {
	switch status {
	case windows.IfOperStatusUp:
		return "Connected"
	case windows.IfOperStatusDown:
		return "Disconnected"
	case windows.IfOperStatusDormant:
		return "Dormant"
	case windows.IfOperStatusNotPresent:
		return "Not present"
	case windows.IfOperStatusLowerLayerDown:
		return "Lower layer down"
	default:
		return "Unknown"
	}
}
