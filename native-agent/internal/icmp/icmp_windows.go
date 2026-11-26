//go:build windows

package icmp

import (
	"encoding/binary"
	"errors"
	"fmt"
	"net"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	afInet  = 2
	afInet6 = 23
)

var (
	modIPHLPAPI       = windows.NewLazySystemDLL("iphlpapi.dll")
	procIcmpCreate    = modIPHLPAPI.NewProc("IcmpCreateFile")
	procIcmp6Create   = modIPHLPAPI.NewProc("Icmp6CreateFile")
	procIcmpClose     = modIPHLPAPI.NewProc("IcmpCloseHandle")
	procIcmpSendEcho  = modIPHLPAPI.NewProc("IcmpSendEcho")
	procIcmp6SendEcho = modIPHLPAPI.NewProc("Icmp6SendEcho2")
)

type ipOptionInformation struct {
	TTL         uint8
	TOS         uint8
	Flags       uint8
	OptionsSize uint8
	OptionsData uint32
}

type icmpEchoReply struct {
	Address       uint32
	Status        uint32
	RoundTripTime uint32
	DataSize      uint16
	Reserved      uint16
	Data          uintptr
	Options       ipOptionInformation
}

type sockaddrInet6 struct {
	Family   uint16
	Port     uint16
	FlowInfo uint32
	Address  [16]byte
	ScopeID  uint32
}

type client struct {
	handle windows.Handle
	ipv6   bool
}

func newClient(ip net.IP) (*client, error) {
	procedure := procIcmpCreate
	ipv6 := ip.To4() == nil
	if ipv6 {
		procedure = procIcmp6Create
	}
	handle, _, callErr := procedure.Call()
	if handle == uintptr(windows.InvalidHandle) || handle == 0 {
		return nil, fmt.Errorf("không thể mở Windows ICMP: %w", callError(callErr))
	}
	return &client{handle: windows.Handle(handle), ipv6: ipv6}, nil
}

func (c *client) Close() error {
	if c == nil || c.handle == 0 {
		return nil
	}
	result, _, callErr := procIcmpClose.Call(uintptr(c.handle))
	c.handle = 0
	if result == 0 {
		return callError(callErr)
	}
	return nil
}

func (c *client) Echo(destination net.IP, timeout, ttl int) (ProbeResult, error) {
	if c.ipv6 {
		return c.echo6(destination, timeout, ttl)
	}
	return c.echo4(destination, timeout, ttl)
}

func (c *client) echo4(destination net.IP, timeout, ttl int) (ProbeResult, error) {
	ip := destination.To4()
	if ip == nil {
		return ProbeResult{}, errors.New("địa chỉ ICMP IPv4 không hợp lệ")
	}
	request := []byte("abcdefghijklmnopqrstuvwabcdefghi")
	buffer := make([]byte, int(unsafe.Sizeof(icmpEchoReply{}))+len(request)+16)
	options := ipOptionInformation{TTL: uint8(ttl)}
	count, _, callErr := procIcmpSendEcho.Call(
		uintptr(c.handle),
		uintptr(binary.LittleEndian.Uint32(ip)),
		uintptr(unsafe.Pointer(&request[0])),
		uintptr(uint16(len(request))),
		uintptr(unsafe.Pointer(&options)),
		uintptr(unsafe.Pointer(&buffer[0])),
		uintptr(uint32(len(buffer))),
		uintptr(uint32(timeout)),
	)
	if count == 0 {
		status := statusFromError(callErr)
		if status != 0 {
			return ProbeResult{Address: append(net.IP(nil), ip...), Status: status}, nil
		}
		return ProbeResult{}, fmt.Errorf("Windows ICMP IPv4 thất bại: %w", callError(callErr))
	}
	reply := (*icmpEchoReply)(unsafe.Pointer(&buffer[0]))
	address := make(net.IP, net.IPv4len)
	binary.LittleEndian.PutUint32(address, reply.Address)
	return ProbeResult{
		Address: address,
		RTT:     int(reply.RoundTripTime),
		Status:  reply.Status,
		TTL:     int(reply.Options.TTL),
	}, nil
}

func (c *client) echo6(destination net.IP, timeout, ttl int) (ProbeResult, error) {
	ip := destination.To16()
	if ip == nil || destination.To4() != nil {
		return ProbeResult{}, errors.New("địa chỉ ICMP IPv6 không hợp lệ")
	}
	request := []byte("abcdefghijklmnopqrstuvwabcdefghi")
	// ICMPV6_ECHO_REPLY_LH is 36 bytes. IPV6_ADDRESS_EX is packed: the
	// 16-byte address starts at byte 6; Status and RTT are at 28 and 32.
	buffer := make([]byte, 36+len(request)+32)
	sourceAddress := sockaddrInet6{Family: afInet6}
	destinationAddress := sockaddrInet6{Family: afInet6}
	copy(destinationAddress.Address[:], ip)
	options := ipOptionInformation{TTL: uint8(ttl)}
	count, _, callErr := procIcmp6SendEcho.Call(
		uintptr(c.handle), 0, 0, 0,
		uintptr(unsafe.Pointer(&sourceAddress)),
		uintptr(unsafe.Pointer(&destinationAddress)),
		uintptr(unsafe.Pointer(&request[0])),
		uintptr(uint16(len(request))),
		uintptr(unsafe.Pointer(&options)),
		uintptr(unsafe.Pointer(&buffer[0])),
		uintptr(uint32(len(buffer))),
		uintptr(uint32(timeout)),
	)
	if count == 0 {
		status := statusFromError(callErr)
		if status != 0 {
			return ProbeResult{Address: append(net.IP(nil), ip...), Status: status}, nil
		}
		return ProbeResult{}, fmt.Errorf("Windows ICMP IPv6 thất bại: %w", callError(callErr))
	}
	address := append(net.IP(nil), buffer[6:22]...)
	return ProbeResult{
		Address: address,
		Status:  binary.LittleEndian.Uint32(buffer[28:32]),
		RTT:     int(binary.LittleEndian.Uint32(buffer[32:36])),
	}, nil
}

func statusFromError(err error) uint32 {
	var errno syscall.Errno
	if errors.As(err, &errno) {
		code := uint32(errno)
		if code >= 11001 && code <= 11050 {
			return code
		}
	}
	return 0
}

func callError(err error) error {
	if err == nil || errors.Is(err, syscall.Errno(0)) {
		return errors.New("lỗi Windows không xác định")
	}
	return err
}

func resolveTarget(target string) (net.IP, error) {
	if parsed := net.ParseIP(target); parsed != nil {
		return parsed, nil
	}
	addresses, err := net.LookupIP(target)
	if err != nil {
		return nil, err
	}
	if len(addresses) == 0 {
		return nil, errors.New("không tìm thấy địa chỉ IP")
	}
	return addresses[0], nil
}
