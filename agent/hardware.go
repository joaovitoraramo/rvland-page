package main

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
)

// Hardware é o inventário do servidor, enviado no heartbeat. Muda raramente,
// mas é barato mandar sempre e a plataforma guarda o último.
type Hardware struct {
	Distro      string  `json:"distro"`
	Kernel      string  `json:"kernel"`
	CPUModelo   string  `json:"cpu_modelo"`
	CPUNucleos  int     `json:"cpu_nucleos"`
	RAMTotalMB  int     `json:"ram_total_mb"`
	Discos      []Disco `json:"discos"`
}

type Disco struct {
	Montagem string `json:"montagem"`
	Dispositivo string `json:"dispositivo"`
	Fs       string `json:"fs"`
	TotalGB  int    `json:"total_gb"`
	UsadoPct int    `json:"usado_pct"`
}

func coletaHardware() Hardware {
	if runtime.GOOS != "linux" {
		return Hardware{Distro: runtime.GOOS, Kernel: "", CPUModelo: "n/d", CPUNucleos: runtime.NumCPU()}
	}
	return Hardware{
		Distro:     distroLinux(),
		Kernel:     kernelLinux(),
		CPUModelo:  cpuModelo(),
		CPUNucleos: runtime.NumCPU(),
		RAMTotalMB: ramTotalMB(),
		Discos:     discos(),
	}
}

func distroLinux() string {
	b, err := os.ReadFile("/etc/os-release")
	if err != nil {
		return "Linux"
	}
	for _, ln := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(ln, "PRETTY_NAME=") {
			return strings.Trim(strings.TrimPrefix(ln, "PRETTY_NAME="), `"`)
		}
	}
	return "Linux"
}

func kernelLinux() string {
	b, err := os.ReadFile("/proc/sys/kernel/osrelease")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func cpuModelo() string {
	b, err := os.ReadFile("/proc/cpuinfo")
	if err != nil {
		return "n/d"
	}
	for _, ln := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(ln, "model name") {
			if i := strings.Index(ln, ":"); i >= 0 {
				return strings.TrimSpace(ln[i+1:])
			}
		}
	}
	return "n/d"
}

func ramTotalMB() int {
	b, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	for _, ln := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(ln, "MemTotal:") {
			f := strings.Fields(ln)
			if len(f) >= 2 {
				kb, _ := strconv.Atoi(f[1])
				return kb / 1024
			}
		}
	}
	return 0
}

// discos lista as partições montadas reais (ignora pseudo-fs) com tamanho e uso.
func discos() []Disco {
	b, err := os.ReadFile("/proc/mounts")
	if err != nil {
		return nil
	}
	pseudo := map[string]bool{
		"proc": true, "sysfs": true, "tmpfs": true, "devtmpfs": true, "devpts": true,
		"cgroup": true, "cgroup2": true, "overlay": true, "squashfs": true, "mqueue": true,
		"debugfs": true, "tracefs": true, "securityfs": true, "pstore": true, "bpf": true,
		"autofs": true, "hugetlbfs": true, "fusectl": true, "configfs": true, "ramfs": true,
		"nsfs": true, "binfmt_misc": true, "fuse.gvfsd-fuse": true,
	}
	vistos := map[string]bool{}
	out := []Disco{}
	for _, ln := range strings.Split(string(b), "\n") {
		f := strings.Fields(ln)
		if len(f) < 3 {
			continue
		}
		dispositivo, montagem, fs := f[0], f[1], f[2]
		if pseudo[fs] || !strings.HasPrefix(dispositivo, "/dev/") {
			continue
		}
		if vistos[montagem] {
			continue
		}
		vistos[montagem] = true

		var s syscall.Statfs_t
		if syscall.Statfs(montagem, &s) != nil {
			continue
		}
		total := float64(s.Blocks) * float64(s.Bsize)
		livre := float64(s.Bavail) * float64(s.Bsize)
		if total <= 0 {
			continue
		}
		out = append(out, Disco{
			Montagem:    montagem,
			Dispositivo: dispositivo,
			Fs:          fs,
			TotalGB:     int(total / 1e9),
			UsadoPct:    int((total - livre) / total * 100),
		})
	}
	return out
}
