import { useState, useEffect, useCallback } from "react";
import { fetchWorkflows, fetchWorkflow } from "../lib/workflow-api";
import type { TaskWorkflow } from "../lib/workflow-types";

export function useWorkflows(filters?: {
  wallet?: string;
  role?: string;
  status?: string;
  refreshKey?: number;
}) {
  const [workflows, setWorkflows] = useState<TaskWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkflows(filters);
      setWorkflows(data.workflows);
    } catch (err: any) {
      setError(err.message || "Failed to fetch workflows");
    } finally {
      setLoading(false);
    }
  }, [filters?.wallet, filters?.role, filters?.status, filters?.refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { workflows, loading, error, refetch: load };
}

export function useWorkflow(id: string | null) {
  const [workflow, setWorkflow] = useState<(TaskWorkflow & { slaExpiresAt?: string; slaBreached?: boolean }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setWorkflow(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkflow(id);
      setWorkflow(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch workflow");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return { workflow, loading, error, refetch: load };
}
