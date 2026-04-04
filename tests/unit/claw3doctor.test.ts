import { describe, expect, it } from "vitest";

import {
  buildCustomRuntimeWarnings,
  buildDoctorJsonReport,
  buildOpenClawWarnings,
  DOCTOR_STATUSES,
  buildGatewayWarnings,
  resolveRuntimeContext,
  shouldRunCustomChecks,
  shouldRunDemoChecks,
  shouldRunHermesChecks,
  shouldRunOpenClawChecks,
  summarizeChecks,
} from "../../scripts/lib/claw3doctor-core.mjs";

describe("claw3doctor core", () => {
  it("resolves selected runtime from settings profiles", () => {
    const runtime = resolveRuntimeContext({
      settings: {
        gateway: {
          adapterType: "hermes",
          url: "ws://localhost:18790",
          token: "",
          profiles: {
            hermes: { url: "ws://localhost:18790", token: "" },
            openclaw: { url: "ws://localhost:18789", token: "file-token" },
          },
        },
      },
      upstreamGateway: {
        url: "ws://localhost:18789",
        token: "file-token",
        adapterType: "openclaw",
      },
      env: process.env,
    });

    expect(runtime).toMatchObject({
      adapterType: "hermes",
      gatewayUrl: "ws://localhost:18790",
      tokenConfigured: false,
    });
    const profiles = runtime.profiles as Record<string, { url: string; token: string }>;
    expect(profiles.openclaw?.url).toBe("ws://localhost:18789");
  });

  it("warns on insecure remote websocket and public studio without access token", () => {
    expect(
      buildGatewayWarnings({
        gatewayUrl: "ws://pi5.example.com:18789",
        studioAccessToken: "",
        host: "pi5.example.com",
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("ws://"),
        expect.stringContaining("STUDIO_ACCESS_TOKEN"),
      ]),
    );
  });

  it("uses adapter-specific defaults for custom profiles", () => {
    const runtime = resolveRuntimeContext({
      settings: {
        gateway: {
          adapterType: "custom",
        },
      },
      upstreamGateway: {
        url: "",
        token: "",
        adapterType: "custom",
      },
      env: process.env,
    });

    expect(runtime).toMatchObject({
      adapterType: "custom",
      gatewayUrl: "http://localhost:7770",
      tokenConfigured: false,
    });
  });

  it("warns about remote openclaw tunnel setups without a token", () => {
    expect(
      buildOpenClawWarnings({
        gatewayUrl: "wss://demo.tailnet.ts.net/gateway",
        tokenConfigured: false,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("gateway token"),
        expect.stringContaining("1008/1011/1012"),
      ]),
    );
  });

  it("warns when production custom runtime is public without an allowlist", () => {
    expect(
      buildCustomRuntimeWarnings({
        gatewayUrl: "https://runtime.example.com",
        allowlist: "",
        nodeEnv: "production",
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("CUSTOM_RUNTIME_ALLOWLIST"),
      ]),
    );
  });

  it("summarizes checks by worst status", () => {
    expect(
      summarizeChecks([
        { status: DOCTOR_STATUSES.pass },
        { status: DOCTOR_STATUSES.warn },
      ]),
    ).toBe(DOCTOR_STATUSES.warn);
    expect(
      summarizeChecks([
        { status: DOCTOR_STATUSES.pass },
        { status: DOCTOR_STATUSES.fail },
      ]),
    ).toBe(DOCTOR_STATUSES.fail);
  });

  it("enables provider-specific checks based on runtime and local state", () => {
    expect(
      shouldRunHermesChecks({
        runtimeContext: { adapterType: "hermes" },
        env: process.env,
      }),
    ).toBe(true);
    expect(
      shouldRunOpenClawChecks({
        runtimeContext: { adapterType: "demo" },
        openclawConfigExists: true,
      }),
    ).toBe(true);
    expect(
      shouldRunDemoChecks({
        runtimeContext: { adapterType: "demo" },
        env: process.env,
      }),
    ).toBe(true);
    expect(
      shouldRunCustomChecks({
        runtimeContext: { adapterType: "custom" },
      }),
    ).toBe(true);
  });

  it("builds a structured json report", () => {
    const report = buildDoctorJsonReport({
      summary: DOCTOR_STATUSES.warn,
      runtimeContext: {
        adapterType: "hermes",
        gatewayUrl: "ws://localhost:18789",
        token: "",
        tokenConfigured: false,
        profiles: {},
      },
      paths: {
        stateDir: "C:/tmp/.openclaw",
        settingsPath: "C:/tmp/.openclaw/claw3d/settings.json",
      },
      checks: [{ status: DOCTOR_STATUSES.warn, label: "Gateway token", message: "Missing." }],
    });

    expect(report).toMatchObject({
      doctor: "claw3doctor",
      summary: DOCTOR_STATUSES.warn,
      runtimeContext: {
        adapterType: "hermes",
      },
      checks: [{ label: "Gateway token" }],
    });
  });
});
