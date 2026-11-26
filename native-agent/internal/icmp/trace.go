package icmp

import (
	"context"
	"fmt"
	"strings"
)

func Trace(ctx context.Context, target string, maxHops, timeout int, progress func(string)) (TraceResult, error) {
	address, err := resolveTarget(target)
	if err != nil {
		return TraceResult{}, err
	}
	client, err := newClient(address)
	if err != nil {
		return TraceResult{}, err
	}
	defer client.Close()

	lines := []string{fmt.Sprintf("Tracing route to %s [%s]", target, address.String()), fmt.Sprintf("over a maximum of %d hops:", maxHops), ""}
	if progress != nil {
		progress(lines[0])
		progress(lines[1])
	}
	hops := make([]string, 0, maxHops)
	reached := false
	for ttl := 1; ttl <= maxHops && !reached; ttl++ {
		parts := make([]string, 0, 3)
		var hopAddress string
		for probeIndex := 0; probeIndex < 3; probeIndex++ {
			if err := ctx.Err(); err != nil {
				return TraceResult{Target: target, Address: address, Hops: hops, Raw: strings.Join(lines, "\n"), TimedOut: true}, nil
			}
			probe, probeErr := client.Echo(address, timeout, ttl)
			if probeErr != nil {
				return TraceResult{}, probeErr
			}
			switch probe.Status {
			case StatusSuccess, StatusTTLExpiredTransit, StatusTTLExpiredReasm:
				if probe.RTT == 0 {
					parts = append(parts, "<1 ms")
				} else {
					parts = append(parts, fmt.Sprintf("%d ms", probe.RTT))
				}
				if probe.Address != nil {
					hopAddress = probe.Address.String()
				}
				if probe.Status == StatusSuccess && probe.Address.Equal(address) {
					reached = true
				}
			case StatusRequestTimedOut:
				parts = append(parts, "*")
			default:
				parts = append(parts, "*")
				if probe.Address != nil {
					hopAddress = probe.Address.String()
				}
			}
		}
		for len(parts) < 3 {
			parts = append(parts, "*")
		}
		if hopAddress == "" {
			hopAddress = "Request timed out."
		}
		line := fmt.Sprintf("%2d  %7s  %7s  %7s  %s", ttl, parts[0], parts[1], parts[2], hopAddress)
		hops = append(hops, strings.TrimSpace(line))
		lines = append(lines, line)
		if progress != nil {
			progress(strings.TrimSpace(line))
		}
	}
	lines = append(lines, "", "Trace complete.")
	return TraceResult{Target: target, Address: address, Hops: hops, Raw: strings.Join(lines, "\n")}, nil
}
