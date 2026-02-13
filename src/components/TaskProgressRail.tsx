import React from "react";
import { WorkflowStatus } from "../lib/workflow-types";

const LIFECYCLE_STEPS = [
  { key: "draft", label: "Draft", statuses: [WorkflowStatus.Draft] },
  { key: "scope", label: "Scope", statuses: [WorkflowStatus.ScopeReview] },
  { key: "quote", label: "Quote", statuses: [WorkflowStatus.QuoteReview] },
  { key: "escrow", label: "Escrow", statuses: [WorkflowStatus.AwaitingEscrow] },
  { key: "progress", label: "In Progress", statuses: [WorkflowStatus.InProgress] },
  { key: "uat", label: "UAT", statuses: [WorkflowStatus.UnderReview, WorkflowStatus.RevisionRequested] },
  { key: "completed", label: "Completed", statuses: [WorkflowStatus.Completed] },
  { key: "rated", label: "Rated", statuses: [WorkflowStatus.Rated] },
];

const TERMINAL_STATUSES = [WorkflowStatus.Cancelled, WorkflowStatus.Refunded];

function getStepIndex(status: WorkflowStatus): number {
  const idx = LIFECYCLE_STEPS.findIndex((s) => s.statuses.includes(status));
  return idx >= 0 ? idx : -1;
}

interface TaskProgressRailProps {
  status: WorkflowStatus;
  revisionCount?: number;
  maxRevisions?: number;
}

export function TaskProgressRail({ status, revisionCount = 0, maxRevisions = 2 }: TaskProgressRailProps) {
  const isTerminal = TERMINAL_STATUSES.includes(status);
  const activeIndex = isTerminal ? -1 : getStepIndex(status);

  return (
    <div className="w-full">
      <div className="flex items-center gap-0 overflow-x-auto pb-1">
        {LIFECYCLE_STEPS.map((step, i) => {
          const isCompleted = !isTerminal && i < activeIndex;
          const isActive = !isTerminal && i === activeIndex;
          const isFuture = isTerminal || i > activeIndex;

          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center gap-1 min-w-0 flex-shrink-0">
                <div
                  className={`
                    w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                    transition-all
                    ${isCompleted
                      ? "bg-brand-500 text-white"
                      : isActive
                      ? "bg-brand-500/20 text-brand-400 ring-2 ring-brand-500/50"
                      : "bg-gray-800/60 text-gray-600"
                    }
                  `}
                >
                  {isCompleted ? (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-[9px] font-medium whitespace-nowrap ${
                  isActive ? "text-brand-400" : isCompleted ? "text-brand-500/60" : "text-gray-600"
                }`}>
                  {step.label}
                  {step.key === "uat" && revisionCount > 0 && (
                    <span className="ml-0.5 text-orange-400">{revisionCount}/{maxRevisions}</span>
                  )}
                </span>
              </div>
              {i < LIFECYCLE_STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-0.5 mb-4 min-w-[8px] ${
                  isCompleted ? "bg-brand-500" : "bg-gray-800/60"
                }`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Terminal status indicator */}
      {isTerminal && (
        <div className={`mt-1 text-center text-xs font-medium px-3 py-1 rounded-lg ${
          status === WorkflowStatus.Cancelled
            ? "text-red-400 bg-red-500/10"
            : "text-rose-400 bg-rose-500/10"
        }`}>
          {status === WorkflowStatus.Cancelled ? "Cancelled" : "Refunded"}
        </div>
      )}
    </div>
  );
}
