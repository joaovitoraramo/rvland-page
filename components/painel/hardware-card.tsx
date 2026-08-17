import { Cpu, HardDrive, MemoryStick, Server } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Hardware = {
  distro?: string;
  kernel?: string;
  cpu_modelo?: string;
  cpu_nucleos?: number;
  ram_total_mb?: number;
  discos?: { montagem: string; dispositivo: string; fs: string; total_gb: number; usado_pct: number }[];
};

function Item({
  icone,
  rotulo,
  valor,
  sub,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/25 p-3.5">
      <div className="flex items-center gap-2 text-white/40 [&_svg]:size-3.5">
        {icone}
        <span className="rv-eyebrow">{rotulo}</span>
      </div>
      <div className="mt-1.5 truncate text-sm font-medium text-white" title={valor}>
        {valor}
      </div>
      {sub ? <div className="rv-num mt-0.5 text-xs text-white/40">{sub}</div> : null}
    </div>
  );
}

export function HardwareCard({ hardware }: { hardware: Hardware | null }) {
  if (!hardware) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-white">Hardware</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-white/40">
            Aguardando o primeiro heartbeat do agente com os dados de hardware.
          </p>
        </CardContent>
      </Card>
    );
  }

  const ram = hardware.ram_total_mb
    ? hardware.ram_total_mb >= 1024
      ? `${(hardware.ram_total_mb / 1024).toFixed(1)} GB`
      : `${hardware.ram_total_mb} MB`
    : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-white">Hardware</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Item
            icone={<Server />}
            rotulo="sistema"
            valor={hardware.distro || "Linux"}
            sub={hardware.kernel ? `kernel ${hardware.kernel}` : undefined}
          />
          <Item
            icone={<Cpu />}
            rotulo="processador"
            valor={hardware.cpu_modelo || "—"}
            sub={hardware.cpu_nucleos ? `${hardware.cpu_nucleos} núcleos` : undefined}
          />
          <Item icone={<MemoryStick />} rotulo="memória" valor={ram} sub="total" />
        </div>

        {hardware.discos && hardware.discos.length > 0 ? (
          <div>
            <div className="rv-eyebrow mb-2 flex items-center gap-1.5">
              <HardDrive className="size-3" /> discos e partições
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Montagem</TableHead>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Fs</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Uso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hardware.discos.map((d) => (
                  <TableRow key={d.montagem}>
                    <TableCell className="rv-num font-medium text-white">{d.montagem}</TableCell>
                    <TableCell className="rv-num text-white/55">{d.dispositivo}</TableCell>
                    <TableCell className="text-white/55">{d.fs}</TableCell>
                    <TableCell className="rv-num text-right text-white/70">{d.total_gb} GB</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`rv-num ${
                          d.usado_pct >= 85
                            ? "text-[#FF9D9D]"
                            : d.usado_pct >= 60
                              ? "text-[#FFD58A]"
                              : "text-white/70"
                        }`}
                      >
                        {d.usado_pct}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
