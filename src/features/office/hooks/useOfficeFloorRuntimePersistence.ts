"use client";

import { useEffect, useRef } from "react";
import type { FloorId } from "@/lib/office/floors";
import type { GatewayStatus } from "@/lib/gateway/GatewayClient";
import type { StudioSettingsCoordinator } from "@/lib/studio/coordinator";

interface Params {
  activeFloorId: FloorId;
  gatewayUrl: string;
  status: GatewayStatus;
  gatewayError: string | null;
  settingsCoordinator: StudioSettingsCoordinator;
}

export function useOfficeFloorRuntimePersistence({
  activeFloorId,
  gatewayUrl,
  status,
  gatewayError,
  settingsCoordinator,
}: Params): void {
  const gatewayOwnerFloorIdRef = useRef<FloorId>(activeFloorId);

  useEffect(() => {
    gatewayOwnerFloorIdRef.current = activeFloorId;
  }, [gatewayUrl]);

  useEffect(() => {
    const key = gatewayUrl.trim();
    if (!key) return;

    const patch =
      status === "connected"
        ? {
            status: "connected" as const,
            gatewayUrl: key,
            lastKnownGoodAt: Date.now(),
            lastErrorCode: null,
            lastErrorMessage: null,
          }
        : status === "connecting"
          ? { status: "connecting" as const, gatewayUrl: key }
          : gatewayError
            ? {
                status: "error" as const,
                gatewayUrl: key,
                lastErrorCode: "GATEWAY_ERROR",
                lastErrorMessage: gatewayError,
              }
            : { status: "disconnected" as const, gatewayUrl: key };

    settingsCoordinator.schedulePatch(
      { officeFloors: { [gatewayOwnerFloorIdRef.current]: patch } },
      0,
    );
  }, [gatewayError, gatewayUrl, settingsCoordinator, status]);
}
