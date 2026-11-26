package network

type Adapter struct {
	Name           string   `json:"name"`
	Description    string   `json:"description,omitempty"`
	IPAddresses    []string `json:"ipAddresses"`
	AddressStates  []string `json:"-"`
	MAC            string   `json:"mac"`
	Gateways       []string `json:"gateways,omitempty"`
	DNSServers     []string `json:"dnsServers,omitempty"`
	DHCPEnabled    bool     `json:"dhcpEnabled"`
	InterfaceIndex uint32   `json:"interfaceIndex"`
	Status         string   `json:"status"`
	MTU            uint32   `json:"mtu,omitempty"`
	LinkSpeed      uint64   `json:"linkSpeed,omitempty"`
	DNSSuffix      string
	Kind           string
	AutoConfig     bool
	NetBIOS        bool
	DHCPServer     string
	LeaseObtained  int64
	LeaseExpires   int64
	IAID           uint32
	DUID           string
	WINS           []string
}

type Result struct {
	Adapters []Adapter
	Text     string
}

type hostInfo struct {
	Name, Suffix, NodeType, Scope string
	Routing, WINSProxy            bool
}
