import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import type { Content, SyncMessage } from "@signage/shared";
import { syncMessageSchema } from "@signage/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function tokenStorageKey(deviceId: string) {
  return `device-token:${deviceId}`;
}

function getStoredToken(deviceId: string): string | null {
  try {
    return window.localStorage.getItem(tokenStorageKey(deviceId));
  } catch {
    return null;
  }
}

function setStoredToken(deviceId: string, token: string) {
  window.localStorage.setItem(tokenStorageKey(deviceId), token);
}

function clearStoredToken(deviceId: string) {
  try {
    window.localStorage.removeItem(tokenStorageKey(deviceId));
  } catch {
    // ignore
  }
}

function renderContent(content: Content) {
  switch (content.tipe) {
    case "text":
      return (
        <div className="flex h-full items-center justify-center p-12">
          <p className="whitespace-pre-wrap text-center text-4xl font-medium leading-snug">
            {content.payload}
          </p>
        </div>
      );
    case "image":
      return (
        <div className="flex h-full items-center justify-center bg-black">
          <img src={content.payload} alt={content.judul} className="max-h-full max-w-full object-contain" />
        </div>
      );
    case "video":
      return (
        <div className="flex h-full items-center justify-center bg-black">
          <video src={content.payload} className="max-h-full max-w-full" autoPlay />
        </div>
      );
    case "url":
      return <iframe src={content.payload} title={content.judul} className="h-full w-full border-0" />;
    default:
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground">Tipe konten tidak dikenal.</p>
        </div>
      );
  }
}

type ScreenState =
  | { kind: "needs-token"; notice?: string }
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "error"; message: string; canReplaceToken: boolean };

export function DeviceClientPage() {
  const { id } = useParams({ from: "/device/$id" });
  const [token, setToken] = useState<string | null>(() => getStoredToken(id));
  const [tokenDraft, setTokenDraft] = useState("");
  const [sync, setSync] = useState<SyncMessage | undefined>(undefined);
  const [playlistIndex, setPlaylistIndex] = useState(0);
  const [state, setState] = useState<ScreenState>(() =>
    getStoredToken(id) ? { kind: "connecting" } : { kind: "needs-token" },
  );
  const hbRef = useRef<number | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  const wsUrl = useMemo(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/device`;
  }, []);

  useEffect(() => {
    setToken(getStoredToken(id));
    setSync(undefined);
    setPlaylistIndex(0);
    attemptRef.current = 0;
    setState(getStoredToken(id) ? { kind: "connecting" } : { kind: "needs-token" });
  }, [id]);

  useEffect(() => {
    if (sync) setPlaylistIndex(0);
  }, [sync]);

  useEffect(() => {
    if (!sync || sync.mode !== "playlist" || sync.playlist.length === 0) return;
    const item = sync.playlist[playlistIndex % sync.playlist.length];
    if (!item) return;
    const timeoutId = window.setTimeout(() => {
      setPlaylistIndex((i) => (i + 1) % sync.playlist.length);
    }, item.durationSeconds * 1000);
    return () => window.clearTimeout(timeoutId);
  }, [sync, playlistIndex]);

  const clearReconnect = () => {
    if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
    reconnectRef.current = null;
  };

  const replaceToken = useCallback(
    (notice?: string) => {
      clearStoredToken(id);
      setToken(null);
      setTokenDraft("");
      setSync(undefined);
      setPlaylistIndex(0);
      attemptRef.current = 0;
      setState({ kind: "needs-token", notice });
    },
    [id],
  );

  useEffect(() => {
    if (!token) return;

    let ws: WebSocket | null = null;
    let closed = false;

    function cleanupHeartbeat() {
      if (hbRef.current) window.clearInterval(hbRef.current);
      hbRef.current = null;
    }

    function scheduleReconnect() {
      if (closed) return;
      const delay = Math.min(1000 * 2 ** attemptRef.current, 30000);
      attemptRef.current = Math.min(attemptRef.current + 1, 10);
      setState({ kind: "connecting" });
      clearReconnect();
      reconnectRef.current = window.setTimeout(connect, delay);
    }

    function connect() {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        if (closed) return;
        attemptRef.current = 0;
        setState({ kind: "connected" });
        ws?.send(JSON.stringify({ type: "hello", deviceId: id, token }));
        hbRef.current = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "heartbeat" }));
        }, 15000);
      };

      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data));
          const msg = syncMessageSchema.safeParse(parsed) as
            | { success: true; data: SyncMessage }
            | { success: false };
          if (msg.success) setSync(msg.data);
        } catch {
          // ignore non-json
        }
      };

      ws.onclose = (ev) => {
        cleanupHeartbeat();
        if (closed) return;
        if (ev.code === 1008) {
          closed = true;
          clearReconnect();
          const reason = ev.reason?.trim() || "Autentikasi atau identitas perangkat ditolak.";
          setState({ kind: "error", message: reason, canReplaceToken: true });
          return;
        }
        if (ev.code === 1011) {
          closed = true;
          clearReconnect();
          setState({
            kind: "error",
            message: ev.reason || "Server belum siap.",
            canReplaceToken: false,
          });
          return;
        }
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose handles reconnect/state
      };
    }

    connect();

    return () => {
      closed = true;
      clearReconnect();
      cleanupHeartbeat();
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };
  }, [id, token, wsUrl]);

  if (state.kind === "needs-token") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 p-6 text-neutral-100">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Device Client</h1>
            <p className="text-sm text-neutral-400">Masukkan device token untuk perangkat ini.</p>
          </div>
          {state.notice && <p className="text-sm text-amber-400">{state.notice}</p>}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const value = tokenDraft.trim();
              if (!value) return;
              setStoredToken(id, value);
              setToken(value);
              setSync(undefined);
              setPlaylistIndex(0);
              attemptRef.current = 0;
              setState({ kind: "connecting" });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="device-token">Token perangkat</Label>
              <Input
                id="device-token"
                type="password"
                autoComplete="off"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                placeholder="Tempel token di sini"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={!tokenDraft.trim()}>
              Simpan dan hubungkan
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-neutral-100">
        <div className="space-y-4 text-center">
          <div className="space-y-2">
            <p className="text-xl font-semibold">Device Client</p>
            <p className="text-sm text-red-400">{state.message}</p>
          </div>
          {state.canReplaceToken && (
            <Button variant="outline" onClick={() => replaceToken()}>
              Ganti token
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (state.kind === "connecting" || sync === undefined) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-neutral-100">
        <p className="text-sm text-neutral-400">Menghubungkan perangkat...</p>
      </div>
    );
  }

  if (sync.mode === "push" && sync.pushed) {
    return <div className="h-screen w-screen bg-black text-white">{renderContent(sync.pushed)}</div>;
  }

  if (sync.mode === "playlist" && sync.playlist.length > 0) {
    const item = sync.playlist[playlistIndex % sync.playlist.length];
    if (item) {
      return <div className="h-screen w-screen bg-black text-white">{renderContent(item.content)}</div>;
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-neutral-100">
      <div className="space-y-2 text-center">
        <p className="text-2xl font-semibold">Menunggu konten</p>
        <p className="text-sm text-neutral-400">Belum ada konten aktif untuk perangkat ini.</p>
      </div>
    </div>
  );
}
