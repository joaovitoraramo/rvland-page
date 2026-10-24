//go:build windows

package main

import (
	"runtime"
	"strings"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// Inventário no Windows: versão pelo registro (sem /etc/os-release), CPU pelo
// registro, RAM e discos pela API. A identidade do servidor NÃO depende disso:
// é o par de chaves do enroll, guardado em %ProgramData%\rvland.

func coletaHardware() Hardware {
	return Hardware{
		SO:            "windows",
		Distro:        versaoWindows(),
		Kernel:        buildWindows(),
		CPUModelo:     cpuModeloWindows(),
		CPUNucleos:    runtime.NumCPU(),
		RAMTotalMB:    ramTotalMBWindows(),
		Virtualizacao: virtWindows(),
		Discos:        discosWindows(),
		Servicos:      servicosEmCache(),
	}
}

func lerRegistro(caminho, valor string) string {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, caminho, registry.QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer k.Close()
	v, _, err := k.GetStringValue(valor)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(v)
}

const chaveVersao = `SOFTWARE\Microsoft\Windows NT\CurrentVersion`

// versaoWindows: "Windows Server 2019 Standard (1809)".
func versaoWindows() string {
	nome := lerRegistro(chaveVersao, "ProductName")
	if nome == "" {
		nome = "Windows"
	}
	if dv := lerRegistro(chaveVersao, "DisplayVersion"); dv != "" {
		return nome + " (" + dv + ")"
	}
	if rid := lerRegistro(chaveVersao, "ReleaseId"); rid != "" {
		return nome + " (" + rid + ")"
	}
	return nome
}

func buildWindows() string {
	maj, min, build := windows.RtlGetNtVersionNumbers()
	return strings.Join([]string{itoa(int(maj)), itoa(int(min)), itoa(int(build))}, ".")
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	b := []byte{}
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	if neg {
		b = append([]byte{'-'}, b...)
	}
	return string(b)
}

func cpuModeloWindows() string {
	if v := lerRegistro(`HARDWARE\DESCRIPTION\System\CentralProcessor\0`, "ProcessorNameString"); v != "" {
		return v
	}
	return "n/d"
}

// memoryStatusEx espelha MEMORYSTATUSEX (kernel32).
type memoryStatusEx struct {
	Length               uint32
	MemoryLoad           uint32
	TotalPhys            uint64
	AvailPhys            uint64
	TotalPageFile        uint64
	AvailPageFile        uint64
	TotalVirtual         uint64
	AvailVirtual         uint64
	AvailExtendedVirtual uint64
}

var (
	kernel32                 = windows.NewLazySystemDLL("kernel32.dll")
	procGlobalMemoryStatusEx = kernel32.NewProc("GlobalMemoryStatusEx")
	procGetSystemTimes       = kernel32.NewProc("GetSystemTimes")
)

func statusMemoria() (memoryStatusEx, bool) {
	var m memoryStatusEx
	m.Length = uint32(unsafe.Sizeof(m))
	r, _, _ := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&m)))
	return m, r != 0
}

func ramTotalMBWindows() int {
	m, ok := statusMemoria()
	if !ok {
		return 0
	}
	return int(m.TotalPhys / (1024 * 1024))
}

// virtWindows: pelo fabricante/modelo do BIOS no registro.
func virtWindows() *Virt {
	fab := strings.ToLower(lerRegistro(`HARDWARE\DESCRIPTION\System\BIOS`, "SystemManufacturer"))
	mod := strings.ToLower(lerRegistro(`HARDWARE\DESCRIPTION\System\BIOS`, "SystemProductName"))
	tudo := fab + " " + mod
	switch {
	case tudo == " ":
		return nil
	case strings.Contains(tudo, "vmware"):
		return &Virt{Tipo: "vm", Tecnologia: "vmware"}
	case strings.Contains(tudo, "virtualbox"):
		return &Virt{Tipo: "vm", Tecnologia: "oracle"}
	case strings.Contains(tudo, "qemu"), strings.Contains(tudo, "kvm"):
		return &Virt{Tipo: "vm", Tecnologia: "kvm"}
	case strings.Contains(tudo, "xen"):
		return &Virt{Tipo: "vm", Tecnologia: "xen"}
	case strings.Contains(tudo, "microsoft corporation") && strings.Contains(tudo, "virtual"):
		return &Virt{Tipo: "vm", Tecnologia: "microsoft"}
	case strings.Contains(tudo, "amazon"), strings.Contains(tudo, "google"):
		return &Virt{Tipo: "vm", Tecnologia: strings.Fields(fab + " x")[0]}
	default:
		return &Virt{Tipo: "fisico", Tecnologia: "none"}
	}
}

// discosWindows: unidades fixas (C:, D:...) com tamanho e uso.
func discosWindows() []Disco {
	mascara, err := windows.GetLogicalDrives()
	if err != nil {
		return nil
	}
	out := []Disco{}
	for i := 0; i < 26; i++ {
		if mascara&(1<<uint(i)) == 0 {
			continue
		}
		raiz := string(rune('A'+i)) + `:\`
		p, err := windows.UTF16PtrFromString(raiz)
		if err != nil {
			continue
		}
		if windows.GetDriveType(p) != windows.DRIVE_FIXED {
			continue
		}
		var livreChamador, total, livre uint64
		if err := windows.GetDiskFreeSpaceEx(p, &livreChamador, &total, &livre); err != nil || total == 0 {
			continue
		}
		fs := make([]uint16, 64)
		_ = windows.GetVolumeInformation(p, nil, 0, nil, nil, nil, &fs[0], uint32(len(fs)))
		out = append(out, Disco{
			Montagem:    raiz,
			Dispositivo: raiz,
			Fs:          windows.UTF16ToString(fs),
			TotalGB:     int(float64(total) / 1e9),
			UsadoPct:    int(float64(total-livre) / float64(total) * 100),
		})
	}
	return out
}

// A lista de serviços do Windows é pesada (abre cada um) e grande: renova a
// cada hora e só vai no heartbeat quando renovou — o painel guarda a última.
var (
	cacheServicosMu sync.Mutex
	cacheServicosEm time.Time
)

func servicosEmCache() []map[string]string {
	cacheServicosMu.Lock()
	defer cacheServicosMu.Unlock()
	if !cacheServicosEm.IsZero() && time.Since(cacheServicosEm) < time.Hour {
		return nil
	}
	l := servicosDisponiveis()
	if l != nil {
		cacheServicosEm = time.Now()
	}
	return l
}
