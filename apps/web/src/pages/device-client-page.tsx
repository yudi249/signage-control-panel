import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import type { Content, SyncMessage } from "@signage/shared";
import { syncMessageSchema } from "@signage/shared";

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
          <video src={content.payload} className="max-h-full max-w-full" controls autoPlay loop />
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

export function DeviceClientPage() {
  const { id } = useParams({ from: "/device/$id" });
  const [content, setContent] = useState<Content | null | undefined>(undefined);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const hbRef = useRef<number | null>(null);

  const wsUrl = useMemo(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/device`;
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;

    function cleanup() {
      if (hbRef.current) window.clearInterval(hbRef.current);
      hbRef.current = null;
    }

    try {
      ws = new WebSocket(wsUrl);
    } catch {
      setStatus("error");
      setError("Gagal membuka koneksi WebSocket.");
      return;
    }

    const token = window.localStorage.getItem(`device-token:${id}`) ?? "";
    ws.onopen = () => {
      if (closed) return;
      ws?.send(JSON.stringify({ type: "hello", deviceId: id, token }));
      setStatus("connected");
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
        if (msg.success) setContent(msg.data.content);
      } catch {
        // ignore non-json
      }
    };

    ws.onclose = (ev) => {
      cleanup();
      if (closed) return;
      if (ev.code === 1008) {
        setStatus("error");
        setError(ev.reason || "Identifikasi device ditolak.");
      } else if (ev.code === 1011) {
        setStatus("error");
        setError(ev.reason || "Server belum siap.");
      } else {
        setStatus("error");
        setError("Koneksi terputus.");
      }
    };

    ws.onerror = () => {
      // onclose will handle state
    };

    return () => {
      closed = true;
      cleanup();
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };
  }, [id, wsUrl]);

  if (status === "error") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-neutral-100">
        <div className="space-y-2 text-center">
          <p className="text-xl font-semibold">Device Client</p>
          <p className="text-sm text-red-400">{error ?? "Terjadi kesalahan koneksi."}</p>
        </div>
      </div>
    );
  }

  if (status === "connecting" || content === undefined) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-neutral-100">
        <p className="text-sm text-neutral-400">Menghubungkan perangkat...</p>
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-neutral-100">
        <div className="space-y-2 text-center">
          <p className="text-2xl font-semibold">Menunggu konten</p>
          <p className="text-sm text-neutral-400">Belum ada konten aktif untuk perangkat ini.</p>
        </div>
      </div>
    );
  }

  return <div className="h-screen w-screen bg-black text-white">{renderContent(content)}</div>;
}
