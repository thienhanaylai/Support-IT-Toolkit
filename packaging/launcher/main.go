// Windows self-extracting launcher. build-release.ps1 copies this file next to
// payload.zip before compiling; the ZIP is embedded in the resulting EXE.
package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	_ "embed"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

//go:embed payload.zip
var payload []byte

func extract(root string) error {
	archive, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if err != nil {
		return fmt.Errorf("invalid embedded package: %w", err)
	}
	for _, file := range archive.File {
		name := filepath.FromSlash(file.Name)
		clean := filepath.Clean(name)
		if filepath.IsAbs(clean) || clean == "." || clean == ".." ||
			strings.HasPrefix(clean, ".."+string(filepath.Separator)) ||
			strings.Contains(clean, ":") {
			return fmt.Errorf("unsafe package path: %q", file.Name)
		}
		target := filepath.Join(root, clean)
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0700); err != nil {
				return err
			}
			continue
		}
		if !file.Mode().IsRegular() {
			return fmt.Errorf("unsupported package entry: %q", file.Name)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return err
		}
		source, err := file.Open()
		if err != nil {
			return err
		}
		destination, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			source.Close()
			return err
		}
		_, copyErr := io.Copy(destination, source)
		closeErr := destination.Close()
		sourceErr := source.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		if sourceErr != nil {
			return sourceErr
		}
	}
	for _, required := range []string{"setup.ps1", "install-agent.ps1", "readme.txt", "extension/manifest.json", "agent/it-support-host.exe"} {
		if info, err := os.Stat(filepath.Join(root, filepath.FromSlash(required))); err != nil || !info.Mode().IsRegular() {
			return fmt.Errorf("missing package file: %s", required)
		}
	}
	return nil
}

func run() error {
	root, err := os.MkdirTemp("", "ITSupportToolkit-install-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(root)
	if err := extract(root); err != nil {
		return err
	}
	if len(os.Args) > 1 && os.Args[1] == "--verify" {
		fmt.Println("Package verified: extension, agent and installer are present.")
		return nil
	}
	cmd := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass",
		"-File", filepath.Join(root, "setup.ps1"), "-ReuseExistingIds")
	cmd.Dir = root
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("installation did not finish: %w", err)
	}
	fmt.Println("\nInstaller finished. Reload the extension in Chrome/Edge if it was already open.")
	return nil
}

func main() {
	err := run()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
	}
	if len(os.Args) == 1 {
		fmt.Print("\nPress Enter to close...")
		_, _ = bufio.NewReader(os.Stdin).ReadString('\n')
	}
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			os.Exit(exit.ExitCode())
		}
		os.Exit(1)
	}
}
