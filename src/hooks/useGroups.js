import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  getGroupsSnapshot,
  registerRemoteGroupEntries,
  subscribeToGroups,
} from "../data/groups";
import { fetchGroups } from "../utils/groupsApi";

let remoteGroupsPromise = null;

function fetchAndRegisterGroups() {
  return fetchGroups().then((entries) => {
    registerRemoteGroupEntries(entries);
    return entries;
  });
}

function ensureRemoteGroupsLoaded() {
  if (!remoteGroupsPromise) {
    remoteGroupsPromise = fetchAndRegisterGroups().catch((error) => {
      remoteGroupsPromise = null;
      throw error;
    });
  }
  return remoteGroupsPromise;
}

export function loadRemoteGroups() {
  return ensureRemoteGroupsLoaded();
}

const getSnapshot = () => getGroupsSnapshot();
const getServerSnapshot = () => getGroupsSnapshot();

export function useGroups() {
  const [status, setStatus] = useState(() =>
    remoteGroupsPromise ? "loading" : "idle"
  );
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    ensureRemoteGroupsLoaded()
      .then(() => {
        if (active) {
          setStatus("ready");
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err);
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const groups = useSyncExternalStore(
    subscribeToGroups,
    getSnapshot,
    getServerSnapshot
  );

  const reload = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const promise = fetchAndRegisterGroups();
      remoteGroupsPromise = promise.catch((err) => {
        remoteGroupsPromise = null;
        throw err;
      });
      const entries = await promise;
      setStatus("ready");
      return entries;
    } catch (err) {
      setError(err);
      setStatus("error");
      throw err;
    }
  }, []);

  const list = useMemo(() => {
    return Object.entries(groups || {}).map(([id, entry]) => ({
      id,
      name: entry?.name || id,
      description: entry?.description || "",
      banner: entry?.banner || "",
      logo: entry?.logo || "",
      createdAt: entry?.createdAt || null,
      updatedAt: entry?.updatedAt || entry?.createdAt || null,
    }));
  }, [groups]);

  list.sort((a, b) => {
    if (a.updatedAt && b.updatedAt) {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
    if (a.updatedAt) return -1;
    if (b.updatedAt) return 1;
    return a.name.localeCompare(b.name, "tr", { sensitivity: "base" });
  });

  return { groups, list, status, error, reload };
}

export function useGroup(groupId) {
  const { groups } = useGroups();
  return useMemo(() => {
    if (!groupId) return null;
    return groups[groupId] || null;
  }, [groups, groupId]);
}