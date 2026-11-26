//go:build !windows

package network

import "errors"

func Adapters() (Result, error) {
	return Result{}, errors.New("thông tin adapter chỉ hỗ trợ Windows")
}
