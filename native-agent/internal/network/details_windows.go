//go:build windows

package network

import (
	"errors"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	ipHelper          = windows.NewLazySystemDLL("iphlpapi.dll")
	getNetworkParams  = ipHelper.NewProc("GetNetworkParams")
	getPerAdapterInfo = ipHelper.NewProc("GetPerAdapterInfo")
)

type fixedInfo struct {
	HostName         [132]byte
	DomainName       [132]byte
	CurrentDNSServer *windows.IpAddrString
	DNSServerList    windows.IpAddrString
	NodeType         uint32
	ScopeID          [260]byte
	EnableRouting    uint32
	EnableProxy      uint32
	EnableDNS        uint32
}

type perAdapterInfo struct {
	AutoconfigEnabled uint32
	AutoconfigActive  uint32
	CurrentDNSServer  *windows.IpAddrString
	DNSServerList     windows.IpAddrString
}

func readHostInfo() (hostInfo, error) {
	size := uint32(2048)
	for attempt := 0; attempt < 3; attempt++ {
		buffer := make([]byte, size)
		code, _, _ := getNetworkParams.Call(uintptr(unsafe.Pointer(&buffer[0])), uintptr(unsafe.Pointer(&size)))
		if code == uintptr(windows.ERROR_BUFFER_OVERFLOW) {
			continue
		}
		if code != 0 {
			return hostInfo{}, windows.Errno(code)
		}
		info := (*fixedInfo)(unsafe.Pointer(&buffer[0]))
		node := map[uint32]string{1: "Broadcast", 2: "Peer-Peer", 4: "Mixed", 8: "Hybrid"}[info.NodeType]
		if node == "" {
			node = "Unknown"
		}
		return hostInfo{Name: windows.ByteSliceToString(info.HostName[:]), Suffix: windows.ByteSliceToString(info.DomainName[:]), NodeType: node, Scope: windows.ByteSliceToString(info.ScopeID[:]), Routing: info.EnableRouting != 0, WINSProxy: info.EnableProxy != 0}, nil
	}
	return hostInfo{}, errors.New("GetNetworkParams buffer không ổn định")
}

func enrichAdapters(adapters []Adapter) error {
	size := uint32(15 * 1024)
	for attempt := 0; attempt < 3; attempt++ {
		buffer := make([]byte, size)
		first := (*windows.IpAdapterInfo)(unsafe.Pointer(&buffer[0]))
		err := windows.GetAdaptersInfo(first, &size)
		if errors.Is(err, windows.ERROR_BUFFER_OVERFLOW) {
			continue
		}
		if errors.Is(err, windows.ERROR_NO_DATA) {
			return nil
		}
		if err != nil {
			return err
		}
		for current := first; current != nil; current = current.Next {
			for i := range adapters {
				if adapters[i].InterfaceIndex != current.Index {
					continue
				}
				adapters[i].DHCPServer = windows.ByteSliceToString(current.DhcpServer.IpAddress.String[:])
				adapters[i].LeaseObtained = current.LeaseObtained
				adapters[i].LeaseExpires = current.LeaseExpires
				if current.HaveWins {
					for _, value := range []string{windows.ByteSliceToString(current.PrimaryWinsServer.IpAddress.String[:]), windows.ByteSliceToString(current.SecondaryWinsServer.IpAddress.String[:])} {
						if value != "" && value != "0.0.0.0" {
							adapters[i].WINS = append(adapters[i].WINS, value)
						}
					}
				}
			}
		}
		break
	}
	for i := range adapters {
		size = uint32(2048)
		for attempt := 0; attempt < 3; attempt++ {
			buffer := make([]byte, size)
			code, _, _ := getPerAdapterInfo.Call(uintptr(adapters[i].InterfaceIndex), uintptr(unsafe.Pointer(&buffer[0])), uintptr(unsafe.Pointer(&size)))
			if code == uintptr(windows.ERROR_BUFFER_OVERFLOW) {
				continue
			}
			if code != 0 {
				break
			} // IPv6-only adapters need not expose this IPv4 API.
			info := (*perAdapterInfo)(unsafe.Pointer(&buffer[0]))
			adapters[i].AutoConfig = info.AutoconfigEnabled != 0
			break
		}
	}
	return nil
}
