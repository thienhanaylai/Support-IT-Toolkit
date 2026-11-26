//go:build windows

package icmp

import (
	"context"
	"strings"
	"testing"
	"unsafe"
)

func TestPingLoopbackIPv4AndIPv6(t *testing.T) {
	for _, target := range []string{"127.0.0.1", "::1"} {
		t.Run(target, func(t *testing.T) {
			var progress []string
			result, err := Ping(context.Background(), target, 1, 1000, func(line string) {
				progress = append(progress, line)
			})
			if err != nil {
				t.Fatal(err)
			}
			if result.Sent != 1 || result.Received != 1 || result.Loss != 0 || len(result.Times) != 1 {
				t.Fatalf("unexpected ping result: %+v", result)
			}
			if !strings.Contains(result.Raw, "Packets: Sent = 1, Received = 1, Lost = 0 (0% loss)") || len(progress) < 2 {
				t.Fatalf("missing compatible raw/progress output: raw=%q progress=%v", result.Raw, progress)
			}
		})
	}
}

func TestTraceLoopbackIPv4AndIPv6(t *testing.T) {
	for _, target := range []string{"127.0.0.1", "::1"} {
		t.Run(target, func(t *testing.T) {
			result, err := Trace(context.Background(), target, 2, 1000, nil)
			if err != nil {
				t.Fatal(err)
			}
			if len(result.Hops) != 1 || !strings.Contains(result.Hops[0], target) || !strings.Contains(result.Raw, "Trace complete.") {
				t.Fatalf("unexpected trace result: %+v", result)
			}
		})
	}
}

func TestICMPStructSizesForWindowsABI(t *testing.T) {
	if got := unsafeSizeIPOption(); got != 8 {
		t.Fatalf("IP_OPTION_INFORMATION32 size = %d; want 8", got)
	}
}

func unsafeSizeIPOption() uintptr { return unsafe.Sizeof(ipOptionInformation{}) }
