/**
 * OnboardingWizard — Step-based onboarding flow for new Claw3D users.
 *
 * Renders a modal overlay with step navigation, progress indicator,
 * and content slots for each onboarding phase.  Designed to be mounted
 * at the app root and dismissed once complete or skipped.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

import {
  LOCAL_ONBOARDING_STEPS,
  MANAGED_ONBOARDING_STEPS,
  type OnboardingStepId,
} from "@/features/onboarding/types";
import { WelcomeStep } from "@/features/onboarding/components/WelcomeStep";
import { PrerequisitesStep } from "@/features/onboarding/components/PrerequisitesStep";
import { ConnectStep } from "@/features/onboarding/components/ConnectStep";
import { AgentsStep } from "@/features/onboarding/components/AgentsStep";
import { CompanyStep } from "@/features/onboarding/components/CompanyStep";
import { CompleteStep } from "@/features/onboarding/components/CompleteStep";
import { ManagedByokStep } from "@/features/onboarding/components/ManagedByokStep";
import { isManagedClaw3dDeployment } from "@/lib/deployment/mode";

export type OnboardingWizardProps = {
  /** Whether the gateway is currently connected. */
  gatewayConnected: boolean;
  /** Number of agents discovered. */
  agentCount: number;
  /** Gateway URL (for the connect step). */
  gatewayUrl: string;
  /** Gateway token (for the connect step). */
  token: string;
  /** Callbacks for the connect step. */
  onGatewayUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onConnect: () => void;
  /** Called when the user finishes or dismisses the wizard. */
  onComplete: () => void;
  /** Opens the reusable company builder. */
  onOpenCompanyBuilder: () => void;
  initialStep?: OnboardingStepId;
  initialCompletedSteps?: OnboardingStepId[];
  createdCompanyName?: string | null;
  companyCreated?: boolean;
  /** Connection error message, if any. */
  connectionError: string | null;
  /** Whether we're currently connecting. */
  connecting: boolean;
};

export const OnboardingWizard = ({
  gatewayConnected,
  agentCount,
  gatewayUrl,
  token,
  onGatewayUrlChange,
  onTokenChange,
  onConnect,
  onComplete,
  onOpenCompanyBuilder,
  initialStep = "welcome",
  initialCompletedSteps,
  createdCompanyName = null,
  companyCreated = false,
  connectionError,
  connecting,
}: OnboardingWizardProps) => {
  const managedDeployment = isManagedClaw3dDeployment();
  const steps = managedDeployment ? MANAGED_ONBOARDING_STEPS : LOCAL_ONBOARDING_STEPS;
  const [currentStep, setCurrentStep] = useState<OnboardingStepId>(initialStep);
  const [completedSteps, setCompletedSteps] = useState<Set<OnboardingStepId>>(
    () => new Set(initialCompletedSteps ?? []),
  );
  const [managedByokReady, setManagedByokReady] = useState(false);

  // In managed mode, skip straight to "company" when BYOK is already configured.
  useEffect(() => {
    if (!managedDeployment) return;
    let cancelled = false;

    fetch("/api/managed/byok", { cache: "no-store" })
      .then((r) => r.json())
      .then((result) => {
        if (cancelled) return;
        const providers = Array.isArray(result.configuredProviders)
          ? result.configuredProviders
          : [];
        if (providers.length > 0) {
          setCompletedSteps(new Set<OnboardingStepId>(["welcome", "prerequisites", "byok"]));
          setCurrentStep("company");
          setManagedByokReady(true);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [managedDeployment]);

  const stepIndex = useMemo(
    () => steps.findIndex((step) => step.id === currentStep),
    [currentStep, steps],
  );
  const currentStepDef = stepIndex >= 0 ? steps[stepIndex] : null;
  const totalSteps = steps.length;

  const markComplete = useCallback(
    (stepId: OnboardingStepId) => {
      setCompletedSteps((prev) => {
        const next = new Set(prev);
        next.add(stepId);
        return next;
      });
    },
    [],
  );

  const goNext = useCallback(() => {
    markComplete(currentStep);
    let next = stepIndex >= 0 && stepIndex < steps.length - 1 ? steps[stepIndex + 1]?.id ?? null : null;
    if (!managedDeployment && next === "agents" && agentCount === 0) {
      markComplete("agents");
      next = "company";
    }
    if (next) {
      setCurrentStep(next);
    } else {
      onComplete();
    }
  }, [agentCount, currentStep, managedDeployment, markComplete, onComplete, stepIndex, steps]);

  const goPrev = useCallback(() => {
    const prev = stepIndex > 0 ? steps[stepIndex - 1]?.id ?? null : null;
    if (prev) setCurrentStep(prev);
  }, [stepIndex, steps]);

  const canGoNext = useMemo(() => {
    if (currentStep === "connect" && !gatewayConnected) return false;
    if (currentStep === "byok" && !managedByokReady) return false;
    return true;
  }, [currentStep, gatewayConnected, managedByokReady]);

  const renderStepContent = () => {
    switch (currentStep) {
      case "welcome":
        return <WelcomeStep />;
      case "prerequisites":
        return <PrerequisitesStep />;
      case "connect":
        return (
          <ConnectStep
            gatewayUrl={gatewayUrl}
            token={token}
            onGatewayUrlChange={onGatewayUrlChange}
            onTokenChange={onTokenChange}
            onConnect={onConnect}
            connected={gatewayConnected}
            connecting={connecting}
            error={connectionError}
          />
        );
      case "byok":
        return <ManagedByokStep onReadyChange={setManagedByokReady} />;
      case "agents":
        return <AgentsStep agentCount={agentCount} connected={gatewayConnected} />;
      case "company":
        return (
          <CompanyStep
            connected={gatewayConnected}
            agentCount={agentCount}
            onOpenCompanyBuilder={onOpenCompanyBuilder}
          />
        );
      case "complete":
        return (
          <CompleteStep
            companyCreated={companyCreated}
            companyName={createdCompanyName}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative mx-4 flex h-[min(92vh,640px)] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0d1117] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {currentStepDef?.title ?? "Onboarding"}
            </h2>
            <p className="mt-0.5 text-xs text-white/60">
              {currentStepDef?.description}
            </p>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            onClick={onComplete}
            aria-label="Close onboarding"
            title="Skip onboarding"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5 px-6 pt-4">
          {steps.map((step, idx) => (
            <div
              key={step.id}
              className={`h-1 flex-1 rounded-full transition-colors ${
                idx <= stepIndex
                  ? "bg-amber-400"
                  : completedSteps.has(step.id)
                    ? "bg-amber-400/40"
                    : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{renderStepContent()}</div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
          <div>
            {stepIndex > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                onClick={goPrev}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40">
              {stepIndex + 1} / {totalSteps}
            </span>
            {currentStep === "complete" ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-xs font-semibold text-[#1a1206] transition-colors hover:bg-amber-400"
                onClick={onComplete}
              >
                Enter Office
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={goNext}
                disabled={!canGoNext}
              >
                {currentStep === "connect" && !gatewayConnected
                  ? "Connect first"
                  : currentStep === "byok" && !managedByokReady
                    ? "Add key first"
                  : "Next"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
