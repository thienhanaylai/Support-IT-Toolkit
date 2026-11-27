// Windows native installer for the Browser-only extension.
//
// The embedded ZIP contains only the production extension files. The installer
// writes them directly to LocalAppData and deliberately does not invoke
// PowerShell, cmd.exe, browser automation, clipboard APIs, or downloaded code.
package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

//go:embed payload.zip
var payload []byte

const markerName = ".it-support-toolkit-installed"

type extensionPackage struct {
	archive *zip.Reader
	files   map[string]*zip.File
	version string
}

func cleanArchivePath(name string) (string, error) {
	name = strings.ReplaceAll(name, "\\", "/")
	clean := path.Clean(name)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") ||
		strings.HasPrefix(clean, "/") || strings.Contains(clean, ":") {
		return "", fmt.Errorf("unsafe package path: %q", name)
	}
	return clean, nil
}

func openPackage() (*extensionPackage, error) {
	archive, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if err != nil {
		return nil, fmt.Errorf("invalid embedded extension: %w", err)
	}
	result := &extensionPackage{archive: archive, files: make(map[string]*zip.File)}
	for _, file := range archive.File {
		name, err := cleanArchivePath(file.Name)
		if err != nil {
			return nil, err
		}
		if file.FileInfo().IsDir() {
			continue
		}
		if !file.Mode().IsRegular() {
			return nil, fmt.Errorf("unsupported package entry: %q", file.Name)
		}
		switch strings.ToLower(path.Ext(name)) {
		case ".bat", ".cmd", ".com", ".exe", ".ps1", ".scr":
			return nil, fmt.Errorf("installer payload contains a forbidden executable or script: %s", name)
		}
		if _, exists := result.files[name]; exists {
			return nil, fmt.Errorf("duplicate package entry: %s", name)
		}
		result.files[name] = file
	}
	for _, required := range []string{"manifest.json", "welcome.html", "background.js"} {
		if result.files[required] == nil {
			return nil, fmt.Errorf("missing extension file: %s", required)
		}
	}
	manifest, err := readArchiveFile(result.files["manifest.json"], 1024*1024)
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}
	var metadata struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(manifest, &metadata); err != nil || metadata.Version == "" {
		return nil, errors.New("embedded extension manifest is invalid")
	}
	result.version = metadata.Version
	return result, nil
}

func readArchiveFile(file *zip.File, limit int64) ([]byte, error) {
	if int64(file.UncompressedSize64) > limit {
		return nil, errors.New("package entry exceeds its allowed size")
	}
	source, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer source.Close()
	return io.ReadAll(io.LimitReader(source, limit+1))
}

func installDirectory() (string, error) {
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		return "", errors.New("LOCALAPPDATA is not available")
	}
	return filepath.Join(localAppData, "ITSupportToolkit", "extension"), nil
}

func ownedInstall(root string) (bool, error) {
	info, err := os.Stat(root)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !info.IsDir() {
		return false, fmt.Errorf("installation path is not a directory: %s", root)
	}
	if _, err := os.Stat(filepath.Join(root, markerName)); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, fmt.Errorf("refusing to overwrite a directory not created by this installer: %s", root)
		}
		return false, err
	}
	return true, nil
}

func copyPackageFile(root, relative string, file *zip.File) error {
	target := filepath.Join(root, filepath.FromSlash(relative))
	inside, err := filepath.Rel(root, target)
	if err != nil || inside == ".." || strings.HasPrefix(inside, ".."+string(filepath.Separator)) {
		return fmt.Errorf("unsafe destination path: %s", relative)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
		return err
	}
	source, err := file.Open()
	if err != nil {
		return err
	}
	defer source.Close()
	temporary := fmt.Sprintf("%s.itst-%d.tmp", target, os.Getpid())
	destination, err := os.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(destination, source)
	closeErr := destination.Close()
	if copyErr != nil {
		os.Remove(temporary)
		return copyErr
	}
	if closeErr != nil {
		os.Remove(temporary)
		return closeErr
	}
	if err := os.RemoveAll(target); err != nil {
		os.Remove(temporary)
		return err
	}
	if err := os.Rename(temporary, target); err != nil {
		os.Remove(temporary)
		return err
	}
	return nil
}

func removeStaleFiles(root string, current map[string]*zip.File) error {
	var directories []string
	err := filepath.WalkDir(root, func(filePath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if filePath == root {
			return nil
		}
		relative, err := filepath.Rel(root, filePath)
		if err != nil {
			return err
		}
		if entry.IsDir() {
			directories = append(directories, filePath)
			return nil
		}
		if relative == markerName {
			return nil
		}
		archiveName := filepath.ToSlash(relative)
		if current[archiveName] == nil {
			return os.Remove(filePath)
		}
		return nil
	})
	if err != nil {
		return err
	}
	sort.Slice(directories, func(i, j int) bool { return len(directories[i]) > len(directories[j]) })
	for _, directory := range directories {
		_ = os.Remove(directory) // Only removes directories that are now empty.
	}
	return nil
}

func installedVersion(root string) string {
	content, err := os.ReadFile(filepath.Join(root, "manifest.json"))
	if err != nil {
		return ""
	}
	var metadata struct {
		Version string `json:"version"`
	}
	if json.Unmarshal(content, &metadata) != nil {
		return ""
	}
	return metadata.Version
}

func install(extension *extensionPackage) error {
	root, err := installDirectory()
	if err != nil {
		return err
	}
	previouslyInstalled, err := ownedInstall(root)
	if err != nil {
		return err
	}
	previousVersion := ""
	if previouslyInstalled {
		previousVersion = installedVersion(root)
	}
	if err := os.MkdirAll(root, 0700); err != nil {
		return err
	}
	names := make([]string, 0, len(extension.files))
	for name := range extension.files {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if err := copyPackageFile(root, name, extension.files[name]); err != nil {
			return fmt.Errorf("install %s: %w", name, err)
		}
	}
	if err := removeStaleFiles(root, extension.files); err != nil {
		return fmt.Errorf("remove stale extension files: %w", err)
	}
	if err := os.WriteFile(filepath.Join(root, markerName), []byte("IT Support Toolkit native installer"), 0600); err != nil {
		return err
	}

	if previousVersion != "" {
		fmt.Printf("Updated IT Support Toolkit: %s -> %s\n", previousVersion, extension.version)
	} else {
		fmt.Printf("Installed IT Support Toolkit %s\n", extension.version)
	}
	fmt.Printf("Extension folder: %s\n\n", root)
	fmt.Println("Chrome: open chrome://extensions/ and enable Developer mode.")
	fmt.Println("Edge:   open edge://extensions/ and enable Developer mode.")
	if previouslyInstalled {
		fmt.Println("Click Reload on the IT Support Toolkit card, then refresh open Portal tabs.")
	} else {
		fmt.Println("Click Load unpacked and select the extension folder shown above.")
	}
	fmt.Println("\nThis installer does not use PowerShell, download code, or require Administrator rights.")
	return nil
}

func run() error {
	extension, err := openPackage()
	if err != nil {
		return err
	}
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "--verify":
			fmt.Printf("Verified Browser-only extension %s (%d files).\n", extension.version, len(extension.files))
			return nil
		case "--install":
			return install(extension)
		default:
			return fmt.Errorf("unknown option: %s", os.Args[1])
		}
	}
	return install(extension)
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
		os.Exit(1)
	}
}
