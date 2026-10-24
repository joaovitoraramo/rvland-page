package main

type Telemetria struct {
	CPUPct     *int `json:"cpu_pct,omitempty"`
	MemoriaPct *int `json:"memoria_pct,omitempty"`
	DiscoPct   *int `json:"disco_pct,omitempty"`
	Carga1     *int `json:"carga1,omitempty"`
}

func pint(v int) *int { return &v }
