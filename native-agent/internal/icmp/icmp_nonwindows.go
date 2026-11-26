//go:build !windows

package icmp

import (
	"errors"
	"net"
)

type client struct{}

func newClient(net.IP) (*client, error) { return nil, errors.New("ICMP chỉ hỗ trợ Windows") }
func (c *client) Close() error          { return nil }
func (c *client) Echo(net.IP, int, int) (ProbeResult, error) {
	return ProbeResult{}, errors.New("ICMP chỉ hỗ trợ Windows")
}
func resolveTarget(string) (net.IP, error) { return nil, errors.New("ICMP chỉ hỗ trợ Windows") }
