import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { AppState } from "../shared/types";

export interface Toast {
  id: number;
  message: string;
  tone: "ok" | "error" | "info";
}

interface RunResult<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  payload?: any;
  status?: number;
}

interface StudioValue {
  state: AppState | null;
  loading: boolean;
  busy: string | null;
  fatal: string | null;
  toasts: Toast[];
  refresh: () => Promise<void>;
  run: <T = any>(label: string, fn: () => Promise<T>, success?: string) => Promise<RunResult<T>>;
  setState: (state: AppState) => void;
  toast: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
}

const StudioContext = createContext<StudioValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(1);

  const toast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = toastId.current++;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), tone === "error" ? 9000 : 5200);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const refresh = useCallback(async () => {
    try {
      const next = await api.state();
      setState(next);
      setFatal(null);
    } catch (err) {
      setFatal(err instanceof Error ? err.message : "Could not load the studio.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async <T,>(label: string, fn: () => Promise<T>, success?: string): Promise<RunResult<T>> => {
      setBusy(label);
      try {
        const data = await fn();
        const maybeState = (data as any)?.state as AppState | undefined;
        if (maybeState) setState(maybeState);
        if (success) toast(success, "ok");
        return { ok: true, data };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        const payload = err instanceof ApiError ? err.payload : null;
        toast(message, "error");
        return { ok: false, error: message, payload, status: err instanceof ApiError ? err.status : 500 };
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );

  const value = useMemo<StudioValue>(
    () => ({ state, loading, busy, fatal, toasts, refresh, run, setState, toast, dismissToast }),
    [state, loading, busy, fatal, toasts, refresh, run, toast, dismissToast],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used inside StudioProvider");
  return ctx;
}

export function useHashRoute(): [string, (route: string) => void] {
  const read = () => window.location.hash.replace(/^#\/?/, "") || "dashboard";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((next: string) => {
    window.location.hash = `#/${next}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  return [route, navigate];
}
