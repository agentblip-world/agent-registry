import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  registerAgent,
  createTask,
  completeTask,
  rateAgent,
  type RegisterAgentParams,
  type CreateTaskParams,
  type CompleteTaskParams,
} from "../lib/program";

interface TxState {
  loading: boolean;
  error: string | null;
  signature: string | null;
}

const INITIAL_STATE: TxState = { loading: false, error: null, signature: null };

export function useRegisterAgent() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = useState<TxState>(INITIAL_STATE);

  const execute = useCallback(
    async (params: RegisterAgentParams) => {
      setState({ loading: true, error: null, signature: null });
      try {
        const sig = await registerAgent(connection, wallet, params);
        setState({ loading: false, error: null, signature: sig });
        return sig;
      } catch (err: any) {
        const message = err?.message || "Transaction failed";
        setState({ loading: false, error: message, signature: null });
        throw err;
      }
    },
    [connection, wallet]
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, execute, reset };
}

export function useCreateTask() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = useState<TxState>(INITIAL_STATE);

  const execute = useCallback(
    async (params: CreateTaskParams) => {
      setState({ loading: true, error: null, signature: null });
      try {
        const sig = await createTask(connection, wallet, params);
        setState({ loading: false, error: null, signature: sig });
        return sig;
      } catch (err: any) {
        const message = err?.message || "Transaction failed";
        setState({ loading: false, error: message, signature: null });
        throw err;
      }
    },
    [connection, wallet]
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, execute, reset };
}

export function useCompleteTask() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = useState<TxState>(INITIAL_STATE);

  const execute = useCallback(
    async (params: CompleteTaskParams) => {
      setState({ loading: true, error: null, signature: null });
      try {
        const sig = await completeTask(connection, wallet, params);
        setState({ loading: false, error: null, signature: sig });
        return sig;
      } catch (err: any) {
        const message = err?.message || "Transaction failed";
        setState({ loading: false, error: message, signature: null });
        throw err;
      }
    },
    [connection, wallet]
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, execute, reset };
}

export function useRateAgent() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = useState<TxState>(INITIAL_STATE);

  const execute = useCallback(
    async (params: {
      taskEscrowPubkey: PublicKey;
      agentProfilePubkey: PublicKey;
      rating: number;
    }) => {
      setState({ loading: true, error: null, signature: null });
      try {
        const sig = await rateAgent(connection, wallet, params);
        setState({ loading: false, error: null, signature: sig });
        return sig;
      } catch (err: any) {
        const message = err?.message || "Transaction failed";
        setState({ loading: false, error: message, signature: null });
        throw err;
      }
    },
    [connection, wallet]
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, execute, reset };
}
