package main

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
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
	t.CPUPct = pint(cpuPct())
	return t, uptimeSeg()
}

// cpuPct amostra /proc/stat duas vezes e calcula o uso no intervalo.
func cpuPct() int {
	i1, t1, ok1 := statCPU()
	if !ok1 {
		return 0
	}
	time.Sleep(400 * time.Millisecond)
	i2, t2, ok2 := statCPU()
	if !ok2 || t2 <= t1 {
		return 0
	}
	uso := 1 - float64(i2-i1)/float64(t2-t1)
	if uso < 0 {
		uso = 0
	}
	return int(uso*100 + 0.5)
}

// statCPU retorna (idle, total) acumulados da linha "cpu" do /proc/stat.
func statCPU() (idle, total uint64, ok bool) {
	b, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0, 0, false
	}
	for _, ln := range strings.Split(string(b), "\n") {
		if !strings.HasPrefix(ln, "cpu ") {
			continue
		}
		f := strings.Fields(ln)[1:] // user nice system idle iowait irq softirq steal ...
		for i, s := range f {
			v, _ := strconv.ParseUint(s, 10, 64)
			total += v
			if i == 3 || i == 4 { // idle + iowait
				idle += v
			}
		}
		return idle, total, true
	}
	return 0, 0, false
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
