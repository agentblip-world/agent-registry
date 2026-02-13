import React, { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useRateAgent } from "../hooks/useRegistry";
import { rateWorkflow } from "../lib/workflow-api";
import type { TaskRating } from "../lib/workflow-types";

interface RatingFormProps {
  workflowId: string;
  agentPubkey: string;
  escrowPubkey: string;
  onRated: () => void;
}

function StarSelector({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-300">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className={`w-7 h-7 rounded-lg transition-all ${
              star <= value
                ? "text-brand-400 bg-brand-500/15"
                : "text-gray-600 hover:text-gray-400 hover:bg-gray-800"
            }`}
          >
            <svg className="w-4 h-4 mx-auto" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RatingForm({ workflowId, agentPubkey, escrowPubkey, onRated }: RatingFormProps) {
  const { loading, error, execute } = useRateAgent();
  const [overall, setOverall] = useState(0);
  const [quality, setQuality] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [review, setReview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (overall < 1) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      // On-chain rate_agent tx
      const sig = await execute({
        taskEscrowPubkey: new PublicKey(escrowPubkey),
        agentProfilePubkey: new PublicKey(agentPubkey),
        rating: overall,
      });

      // Off-chain workflow update
      const rating: TaskRating = {
        overall,
        quality: quality || overall,
        speed: speed || overall,
        communication: communication || overall,
        review: review.slice(0, 500),
      };
      await rateWorkflow(workflowId, rating, sig);
      onRated();
    } catch (err: any) {
      setSubmitError(err.message || "Rating failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-200">Rate This Agent</h3>

      <StarSelector label="Overall *" value={overall} onChange={setOverall} />
      <StarSelector label="Quality" value={quality} onChange={setQuality} />
      <StarSelector label="Speed" value={speed} onChange={setSpeed} />
      <StarSelector label="Communication" value={communication} onChange={setCommunication} />

      <div>
        <label className="block text-sm text-gray-400 mb-1">Written Review</label>
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value.slice(0, 500))}
          placeholder="Share your experience..."
          rows={3}
          className="input-field text-sm resize-none"
        />
        <p className="text-[10px] text-gray-600 mt-0.5 text-right">{review.length}/500</p>
      </div>

      {(error || submitError) && (
        <p className="text-xs text-red-400">{error || submitError}</p>
      )}

      <button
        type="submit"
        disabled={overall < 1 || loading || submitting}
        className="btn-primary w-full"
      >
        {loading || submitting ? "Submitting Rating..." : "Submit Rating On-Chain"}
      </button>
    </form>
  );
}
