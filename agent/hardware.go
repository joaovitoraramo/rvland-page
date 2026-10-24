package main

// Hardware é o inventário do servidor, enviado no heartbeat. Muda raramente,
// mas é barato mandar sempre e a plataforma guarda o último.
type Hardware struct {
	Distro        string  `json:"distro"`
	Kernel        string  `json:"kernel"`
	CPUModelo     string  `json:"cpu_modelo"`
	CPUNucleos    int     `json:"cpu_nucleos"`
	RAMTotalMB    int     `json:"ram_total_mb"`
	Virtualizacao *Virt   `json:"virtualizacao,omitempty"`
	Discos        []Disco `json:"discos"`
	// SO: "linux" | "windows". Servicos: só no Windows, a lista de serviços do
	// Gerenciador de Serviços (o painel oferece na escolha do serviço licenciado).
	SO       string              `json:"so,omitempty"`
	Servicos []map[string]string `json:"servicos_disponiveis,omitempty"`
}

// Virt: se a máquina é física, VM ou container, e a tecnologia detectada.
type Virt struct {
	Tipo       string `json:"tipo"`       // fisico | vm | container
	Tecnologia string `json:"tecnologia"` // kvm, qemu, lxc, docker, none...
}

type Disco struct {
	Montagem    string `json:"montagem"`
	Dispositivo string `json:"dispositivo"`
	Fs          string `json:"fs"`
	TotalGB     int    `json:"total_gb"`
	UsadoPct    int    `json:"usado_pct"`
}
