import React from "react";

export interface WizardStep {
  label: string;
  key: string;
}

interface WizardStepRailProps {
  steps: WizardStep[];
  currentStep: number;
}

export function WizardStepRail({ steps, currentStep }: WizardStepRailProps) {
  return (
    <div className="flex items-center justify-center gap-0 px-4 py-3">
      {steps.map((step, i) => {
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;
        const isFuture = i > currentStep;

        return (
          <React.Fragment key={step.key}>
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <div
                className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                  transition-all duration-300
                  ${isCompleted
                    ? "bg-brand-500 text-white"
                    : isActive
                    ? "bg-brand-500/20 text-brand-400 ring-2 ring-brand-500/50 animate-glow"
                    : "bg-gray-800 text-gray-600"
                  }
                `}
              >
                {isCompleted ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  isActive
                    ? "text-brand-400"
                    : isCompleted
                    ? "text-brand-500/70"
                    : "text-gray-600"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connecting line */}
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-px mx-1 mb-5 min-w-[16px] max-w-[40px] transition-colors ${
                  i < currentStep ? "bg-brand-500" : "bg-gray-800"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
