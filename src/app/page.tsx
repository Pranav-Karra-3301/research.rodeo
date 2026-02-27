"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { AppShell } from "@/components/layout/AppShell";

export default function Home() {
  return (
    <ReactFlowProvider>
      <AppShell />
    </ReactFlowProvider>
  );
}
