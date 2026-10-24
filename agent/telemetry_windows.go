//go:build windows

package main

import (
	"os"
	"path/filepath"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Telemetria no Windows: memória (GlobalMemoryStatusEx), disco do sistema
// (GetDiskFreeSpaceEx), CPU (GetSystemTimes em duas amostras) e uptime.
// Carga média não existe no Windows: vai omitida.
func coletaTelemetria() (Telemetria, int) {
	var t Telemetria
	if m, ok := statusMemoria(); ok {
		t.MemoriaPct = pint(int(m.MemoryLoad))
	}
	t.DiscoPct = pint(discoSistemaPct())
	t.CPUPct = pint(cpuPctWindows())
	return t, int(windows.DurationSinceBoot() / time.Second)
}

func discoSistemaPct() int {
	raiz := filepath.VolumeName(os.Getenv("SystemRoot")) + `\`
	if raiz == `\` {
		raiz = `C:\`
	}
	p, err := windows.UTF16PtrFromString(raiz)
	if err != nil {
		return 0
	}
	var livreChamador, total, livre uint64
	if windows.GetDiskFreeSpaceEx(p, &livreChamador, &total, &livre) != nil || total == 0 {
		return 0
	}
	return int(float64(total-livre) / float64(total) * 100)
}

func temposSistema() (ocioso, total uint64, ok bool) {
	var idle, kernel, user windows.Filetime
	r, _, _ := procGetSystemTimes.Call(
		uintptr(unsafe.Pointer(&idle)),
		uintptr(unsafe.Pointer(&kernel)),
		uintptr(unsafe.Pointer(&user)),
	)
	if r == 0 {
		return 0, 0, false
	}
	f := func(ft windows.Filetime) uint64 { return uint64(ft.HighDateTime)<<32 | uint64(ft.LowDateTime) }
	// kernel já inclui o ocioso
	return f(idle), f(kernel) + f(user), true
}

func cpuPctWindows() int {
	i1, t1, ok1 := temposSistema()
	if !ok1 {
		return 0
	}
	time.Sleep(400 * time.Millisecond)
	i2, t2, ok2 := temposSistema()
	if !ok2 || t2 <= t1 {
		return 0
	}
	uso := 1 - float64(i2-i1)/float64(t2-t1)
	if uso < 0 {
		uso = 0
	}
	return int(uso*100 + 0.5)
}
