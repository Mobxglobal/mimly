"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { GenerationMode } from "@/lib/onboarding/generation-mode";

const DashboardGenerationContext = createContext<GenerationMode>("on_demand");

export function DashboardGenerationProvider({
  mode,
  children,
}: Readonly<{ mode: GenerationMode; children: ReactNode }>) {
  return (
    <DashboardGenerationContext.Provider value={mode}>
      {children}
    </DashboardGenerationContext.Provider>
  );
}

export function useDashboardGenerationMode(): GenerationMode {
  return useContext(DashboardGenerationContext);
}
