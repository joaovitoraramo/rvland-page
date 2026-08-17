package main

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
)

type Telemetria struct {
	CPUPct     *int `json:"cpu_pct,omitempty"`
	MemoriaPct *int `json:"memoria_pct,omitempty"`
	DiscoPct   *int `json:"disco_pct,omitempty"`
	Carga1     *int `json:"carga1,omitempty"`
}

func pint(v int) *int { return &v }

// coletaTelemetria lê /proc e statfs no Linux; noutros SOs (dev/macOS) devolve
// zeros — o agente roda e o protocolo é exercitado sem depender do host.
func coletaTelemetria() (Telemetria, int) {
	if runtime.GOOS != "linux" {
		return Telemetria{CPUPct: pint(0), MemoriaPct: pint(0), DiscoPct: pint(0), Carga1: pint(0)}, 0
	}

	var t Telemetria
	t.MemoriaPct = pint(memoriaPct())
	t.DiscoPct = pint(discoPct("/"))
	t.Carga1 = pint(carga1x100())
	t.CPUPct = pint(0) // CPU instantânea exige 2 amostras; simplificado no MVP
	return t, uptimeSeg()
}

func memoriaPct() int {
	b, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	var total, disp float64
	for _, ln := range strings.Split(string(b), "\n") {
		f := strings.Fields(ln)
		if len(f) < 2 {
			continue
		}
		v, _ := strconv.ParseFloat(f[1], 64)
		switch f[0] {
		case "MemTotal:":
			total = v
		case "MemAvailable:":
			disp = v
		}
	}
	if total == 0 {
		return 0
	}
	return int((total - disp) / total * 100)
}

func discoPct(caminho string) int {
	var s syscall.Statfs_t
	if err := syscall.Statfs(caminho, &s); err != nil {
		return 0
	}
	total := float64(s.Blocks) * float64(s.Bsize)
	livre := float64(s.Bavail) * float64(s.Bsize)
	if total == 0 {
		return 0
	}
	return int((total - livre) / total * 100)
}

func carga1x100() int {
	b, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return 0
	}
	f := strings.Fields(string(b))
	if len(f) == 0 {
		return 0
	}
	v, _ := strconv.ParseFloat(f[0], 64)
	return int(v * 100)
}

func uptimeSeg() int {
	b, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}
	f := strings.Fields(string(b))
	if len(f) == 0 {
		return 0
	}
	v, _ := strconv.ParseFloat(f[0], 64)
	return int(v)
}
