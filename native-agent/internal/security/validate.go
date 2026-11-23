package security

import (
	"errors"
	"net"
	"regexp"
	"strings"
)

var label = regexp.MustCompile(`^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$`)

func Host(raw string) (string, error) {
	host := strings.TrimSpace(raw)
	if strings.HasPrefix(host, "[") && strings.HasSuffix(host, "]") {
		host = host[1 : len(host)-1]
	}
	if len(host) == 0 || len(host) > 253 || strings.ContainsAny(host, " \t\r\n\\/;|&$\"'`@?#%") {
		return "", errors.New("domain/IP không hợp lệ")
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.String(), nil
	}
	if strings.Contains(host, ":") {
		return "", errors.New("IPv6 không hợp lệ")
	}
	for _, part := range strings.Split(host, ".") {
		if !label.MatchString(part) {
			return "", errors.New("domain không hợp lệ")
		}
	}
	return strings.ToLower(host), nil
}

func Range(value, min, max, fallback int) (int, error) {
	if value == 0 {
		return fallback, nil
	}
	if value < min || value > max {
		return 0, errors.New("tham số ngoài phạm vi cho phép")
	}
	return value, nil
}
