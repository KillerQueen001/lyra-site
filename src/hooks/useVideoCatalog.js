import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAllVideoDetails } from "../utils/videoDetailsApi";
import { buildVideoCatalog } from "../utils/videoCatalog";

export function useVideoCatalog() {
  const [detailsMap, setDetailsMap] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const loadDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      const entries = await fetchAllVideoDetails();
      setDetailsMap(entries);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setIsLoading(true);
      try {
        const entries = await fetchAllVideoDetails();
        if (!cancelled) {
          setDetailsMap(entries);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const catalog = useMemo(() => buildVideoCatalog(detailsMap), [detailsMap]);
  const catalogMap = useMemo(() => {
    const map = {};
    for (const entry of catalog) {
      map[entry.id] = entry;
    }
    return map;
  }, [catalog]);

  return { catalog, catalogMap, isLoading, reload: loadDetails };
}