"use client";

import { useMemo } from "react";

import { type GatewayConnectionState, useGatewayConnection } from "@/lib/gateway/GatewayClient";
import { OpenClawRuntimeProvider } from "@/lib/runtime/openclaw/provider";
import {
  hasRuntimeCapability,
  type RuntimeCapability,
  type RuntimeProvider,
} from "@/lib/runtime/types";
import type { StudioSettingsCoordinator } from "@/lib/studio/coordinator";

export type RuntimeConnectionState = GatewayConnectionState & {
  provider: RuntimeProvider;
  providerId: RuntimeProvider["id"];
  providerLabel: string;
  capabilities: ReadonlySet<RuntimeCapability>;
  supportsCapability: (capability: RuntimeCapability) => boolean;
};

export const useRuntimeConnection = (
  settingsCoordinator: StudioSettingsCoordinator
): RuntimeConnectionState => {
  const gateway = useGatewayConnection(settingsCoordinator);
  const provider = useMemo(() => new OpenClawRuntimeProvider(gateway.client), [gateway.client]);
  const capabilities = provider.capabilities;

  return {
    ...gateway,
    provider,
    providerId: provider.id,
    providerLabel: provider.label,
    capabilities,
    supportsCapability: (capability) => hasRuntimeCapability(capabilities, capability),
  };
};
