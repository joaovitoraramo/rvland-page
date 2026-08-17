import * as React from "react";

import { cn } from "@/lib/utils";

/** Select nativo estilizado (suficiente para o painel interno). */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-9 w-full min-w-0 appearance-none rounded-md border border-white/10 bg-white/5 px-3 py-1 text-sm text-white outline-none transition-[color,box-shadow]",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&>option]:bg-[#0a0e14] [&>option]:text-white",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
