package icmp

import "net"

const (
	StatusSuccess           uint32 = 0
	StatusDestinationNet    uint32 = 11002
	StatusDestinationHost   uint32 = 11003
	StatusDestinationProto  uint32 = 11004
	StatusDestinationPort   uint32 = 11005
	StatusPacketTooBig      uint32 = 11009
	StatusRequestTimedOut   uint32 = 11010
	StatusTTLExpiredTransit uint32 = 11013
	StatusTTLExpiredReasm   uint32 = 11014
)

type ProbeResult struct {
	Address net.IP
	RTT     int
	Status  uint32
	TTL     int
}

type PingResult struct {
	Target   string
	Address  net.IP
	Sent     int
	Received int
	Loss     int
	Min      int
	Average  int
	Max      int
	Times    []int
	Raw      string
}

type TraceResult struct {
	Target   string
	Address  net.IP
	Hops     []string
	Raw      string
	TimedOut bool
}

func statusText(status uint32) string {
	switch status {
	case StatusRequestTimedOut:
		return "Request timed out."
	case StatusDestinationNet:
		return "Destination net unreachable."
	case StatusDestinationHost:
		return "Destination host unreachable."
	case StatusDestinationProto:
		return "Destination protocol unreachable."
	case StatusDestinationPort:
		return "Destination port unreachable."
	case StatusPacketTooBig:
		return "Packet too big."
	case StatusTTLExpiredTransit:
		return "TTL expired in transit."
	case StatusTTLExpiredReasm:
		return "TTL expired during reassembly."
	default:
		return "General failure."
	}
}
