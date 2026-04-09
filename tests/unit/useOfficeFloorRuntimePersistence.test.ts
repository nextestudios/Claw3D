import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { sanitizeStudioSettings, defaultStudioSettings } from "@/lib/studio/settings";
import { StudioSettingsCoordinator } from "@/lib/studio/coordinator";
import { useOfficeFloorRuntimePersistence } from "@/features/office/hooks/useOfficeFloorRuntimePersistence";
import type { FloorId } from "@/lib/office/floors";
import type { GatewayStatus } from "@/lib/gateway/GatewayClient";

type HookParams = {
  activeFloorId: FloorId;
  gatewayUrl: string;
  status: GatewayStatus;
  gatewayError: string | null;
  settingsCoordinator: StudioSettingsCoordinator;
};

function makeCoordinator() {
  const createResponse = () => ({
    settings: sanitizeStudioSettings(defaultStudioSettings()),
  });
  const updateSettings = vi.fn(async () => createResponse());
  const fetchSettings = vi.fn(async () => createResponse());
  const coordinator = new StudioSettingsCoordinator({ fetchSettings, updateSettings }, 0);
  return { coordinator, updateSettings };
}

describe("useOfficeFloorRuntimePersistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the connecting status to the floor that was active when gatewayUrl was set", async () => {
    const { coordinator, updateSettings } = makeCoordinator();

    renderHook<void, HookParams>((props) => useOfficeFloorRuntimePersistence(props), {
      initialProps: {
        activeFloorId: "openclaw-ground",
        gatewayUrl: "ws://openclaw:18789",
        status: "connecting",
        gatewayError: null,
        settingsCoordinator: coordinator,
      },
    });

    await act(() => vi.runAllTimersAsync());
    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        officeFloors: expect.objectContaining({
          "openclaw-ground": expect.objectContaining({ status: "connecting" }),
        }),
      }),
    );
  });

  it("does not misattribute the gateway to a new floor when only the active floor changes", async () => {
    const { coordinator, updateSettings } = makeCoordinator();

    const { rerender } = renderHook<void, HookParams>(
      (props) => useOfficeFloorRuntimePersistence(props),
      {
        initialProps: {
          activeFloorId: "openclaw-ground",
          gatewayUrl: "ws://openclaw:18789",
          status: "connected",
          gatewayError: null,
          settingsCoordinator: coordinator,
        },
      },
    );

    await act(() => vi.runAllTimersAsync());
    updateSettings.mockClear();

    rerender({
      activeFloorId: "hermes-first",
      gatewayUrl: "ws://openclaw:18789",
      status: "connected",
      gatewayError: null,
      settingsCoordinator: coordinator,
    });

    await act(() => vi.runAllTimersAsync());
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
