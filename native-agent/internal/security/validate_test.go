package security

import "testing"

func TestHost(t *testing.T) {
	for _, tc := range []struct {
		input string
		ok    bool
	}{
		{"example.com", true}, {"192.168.1.1", true}, {"[::1]", true},
		{"-n", false}, {"example.com & whoami", false}, {"a/b", false},
		{"1.2.3.4:443", false}, {"", false}, {"example..com", false},
	} {
		_, err := Host(tc.input)
		if (err == nil) != tc.ok {
			t.Errorf("Host(%q) error = %v, want ok=%v", tc.input, err, tc.ok)
		}
	}
}
