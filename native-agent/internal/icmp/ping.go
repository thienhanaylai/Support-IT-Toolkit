package icmp

import (
	"context"
	"fmt"
	"strings"
	"time"
)

func Ping(ctx context.Context, target string, count, timeout int, progress func(string)) (PingResult, error) {
	address, err := resolveTarget(target)
	if err != nil {
		return PingResult{}, err
	}
	client, err := newClient(address)
	if err != nil {
		return PingResult{}, err
	}
	defer client.Close()

	lines := []string{fmt.Sprintf("Pinging %s [%s] with 28 bytes of data:", target, address.String())}
	emit := func(line string) {
		lines = append(lines, line)
		if progress != nil {
			progress(line)
		}
	}
	if progress != nil {
		progress(lines[0])
	}
	times := make([]int, 0, count)
	for index := 0; index < count; index++ {
		if err := ctx.Err(); err != nil {
			return PingResult{}, err
		}
		probe, probeErr := client.Echo(address, timeout, 128)
		if probeErr != nil {
			return PingResult{}, probeErr
		}
		if probe.Status == StatusSuccess {
			times = append(times, probe.RTT)
			timeText := fmt.Sprintf("time=%dms", probe.RTT)
			if probe.RTT == 0 {
				timeText = "time<1ms"
			}
			ttl := probe.TTL
			if ttl <= 0 {
				ttl = 128
			}
			emit(fmt.Sprintf("Reply from %s: bytes=28 %s TTL=%d", probe.Address.String(), timeText, ttl))
		} else {
			emit(statusText(probe.Status))
		}
		if index+1 < count {
			timer := time.NewTimer(time.Second)
			select {
			case <-ctx.Done():
				timer.Stop()
				return PingResult{}, ctx.Err()
			case <-timer.C:
			}
		}
	}

	received := len(times)
	minimum, maximum, average := 0, 0, 0
	if received > 0 {
		minimum, maximum = times[0], times[0]
		for _, value := range times {
			average += value
			if value < minimum {
				minimum = value
			}
			if value > maximum {
				maximum = value
			}
		}
		average /= received
	}
	lost := count - received
	lines = append(lines, "", fmt.Sprintf("Ping statistics for %s:", address.String()),
		fmt.Sprintf("    Packets: Sent = %d, Received = %d, Lost = %d (%d%% loss),", count, received, lost, 100*lost/count))
	if received > 0 {
		lines = append(lines, "Approximate round trip times in milli-seconds:",
			fmt.Sprintf("    Minimum = %dms, Maximum = %dms, Average = %dms", minimum, maximum, average))
	}
	return PingResult{
		Target: target, Address: address, Sent: count, Received: received, Loss: 100 * lost / count,
		Min: minimum, Average: average, Max: maximum, Times: times, Raw: strings.Join(lines, "\n"),
	}, nil
}
