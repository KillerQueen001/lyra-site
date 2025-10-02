import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getVideoLibrarySnapshot,
  registerRemoteVideoEntries,
  subscribeToVideoLibrary,
} from "../data/videoLibrary";
import { fetchVideoLibraryEntries } from "../utils/videoLibraryApi";

let remoteLibraryPromise = null;

function fetchAndRegisterVideoLibrary() {
  return fetchVideoLibraryEntries().then((entries) => {
    registerRemoteVideoEntries(entries);
    return entries;
  });
}

function ensureRemoteLibraryLoaded() {
  if (!remoteLibraryPromise) {
    remoteLibraryPromise = fetchAndRegisterVideoLibrary().catch((error) => {
      remoteLibraryPromise = null;
      throw error;
    });
  }
  return remoteLibraryPromise;
}

export function loadRemoteVideoLibrary() {
  return ensureRemoteLibraryLoaded();
}

const getSnapshot = () => getVideoLibrarySnapshot();
const getServerSnapshot = () => getVideoLibrarySnapshot();

export function useVideoLibrary() {
  const [status, setStatus] = useState(() =>
    remoteLibraryPromise ? "loading" : "idle"
  );
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    ensureRemoteLibraryLoaded()
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

  const library = useSyncExternalStore(
    subscribeToVideoLibrary,
    getSnapshot,
    getServerSnapshot
  );

  const reload = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const promise = fetchAndRegisterVideoLibrary();
      remoteLibraryPromise = promise.catch((err) => {
        remoteLibraryPromise = null;
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

  return { library, status, error, reload };
}

export function useVideoLibraryEntries() {
  return useVideoLibrary().library;
}

export function useVideoEntry(videoId) {
  const { library } = useVideoLibrary();
  return useMemo(() => {
    if (!videoId) return null;
    return library[videoId] || null;
  }, [library, videoId]);
}