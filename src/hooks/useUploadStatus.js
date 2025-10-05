import { useCallback, useEffect, useState } from "react";
import {
  getCachedUploadStatus,
  loadUploadStatus,
  refreshUploadStatus,
} from "../utils/uploadApi";

function getInitialState() {
  const cached = getCachedUploadStatus();
  if (cached) {
    return { status: "ready", data: cached, error: null };
  }
  return { status: "loading", data: null, error: null };
}

export function useUploadStatus() {
  const [{ status, data, error }, setState] = useState(() => getInitialState());

  useEffect(() => {
    if (status !== "loading") return;
    let active = true;
    loadUploadStatus()
      .then((next) => {
        if (!active) return;
        setState({ status: "ready", data: next, error: null });
      })
      .catch((err) => {
        if (!active) return;
        setState({ status: "error", data: null, error: err });
      });
    return () => {
      active = false;
    };
  }, [status]);

  const reload = useCallback(async () => {
    setState((prev) => ({ status: "loading", data: prev.data, error: null }));
    try {
      const next = await refreshUploadStatus();
      setState({ status: "ready", data: next, error: null });
      return next;
    } catch (err) {
      setState({ status: "error", data: null, error: err });
      throw err;
    }
  }, []);

  const available = Boolean(data?.available);
  const cdnBaseUrl = data?.cdnBaseUrl || "";

  return {
    status,
    available,
    cdnBaseUrl,
    error,
    reload,
  };
}