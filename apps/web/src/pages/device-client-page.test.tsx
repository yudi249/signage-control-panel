import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeviceClientPage } from "./device-client-page";

const route = vi.hoisted(() => ({ id: "11111111-1111-4111-8111-111111111111" }));
vi.mock("@tanstack/react-router", () => ({ useParams: () => route }));

class TestSocket {
  static OPEN = 1;
  static instances: TestSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; });
  constructor(public url: string) { TestSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
  disconnect(code = 1006, reason = "") {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

const content = (payload: string) => ({
  id: "22222222-2222-4222-8222-222222222222", judul: payload,
  tipe: "text", payload, createdAt: "2026-01-01T00:00:00.000Z",
});
const push = (payload: string) => ({ type: "sync", mode: "push", pushed: content(payload), playlist: [] });
const playlist = (first = "Pertama", second = "Kedua") => ({
  type: "sync", mode: "playlist", pushed: null,
  playlist: [first, second].map((text, position) => ({ position, durationSeconds: 2, content: content(text) })),
});
const socket = () => TestSocket.instances.at(-1)!;
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
function start() {
  const view = render(<DeviceClientPage />);
  act(() => socket().open());
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.stubGlobal("WebSocket", TestSocket);
  TestSocket.instances = [];
  localStorage.clear();
  localStorage.setItem(`device-token:${route.id}`, "token-rahasia");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("connect yang macet dibatalkan pada 15 detik lalu retry dengan backoff bertambah", () => {
  render(<DeviceClientPage />);
  const old = socket();
  const lateOpen = old.onopen;
  const lateMessage = old.onmessage;
  const lateClose = old.onclose;
  const lateError = old.onerror;
  advance(14999);
  expect(old.close).not.toHaveBeenCalled();
  advance(1);
  expect(old.close).toHaveBeenCalledOnce();
  expect(screen.getByText("Menghubungkan perangkat...")).toBeTruthy();
  advance(499);
  expect(TestSocket.instances).toHaveLength(1);
  advance(1);
  act(() => {
    lateOpen?.();
    lateMessage?.({ data: JSON.stringify(push("Usang")) });
    lateClose?.({ code: 1008, reason: "Usang" });
    lateError?.();
  });
  expect(old.send).not.toHaveBeenCalled();
  expect(screen.queryByText("Usang")).toBeNull();
  advance(15000);
  expect(socket().close).toHaveBeenCalledOnce();
  advance(999);
  expect(TestSocket.instances).toHaveLength(2);
  advance(1);
  expect(TestSocket.instances).toHaveLength(3);
});

it("sync pertama dibatasi 15 detik sejak open; pesan malformed tidak menunda retry", () => {
  render(<DeviceClientPage />);
  advance(14000);
  act(() => socket().open());
  const old = socket();
  const lateMessage = old.onmessage;
  const lateClose = old.onclose;
  const lateError = old.onerror;
  advance(1000);
  expect(old.close).not.toHaveBeenCalled();
  advance(13999);
  act(() => {
    old.message({ type: "sync" });
    old.onmessage?.({ data: "bukan JSON" });
  });
  expect(old.close).not.toHaveBeenCalled();
  advance(1);
  expect(old.close).toHaveBeenCalledOnce();
  expect(screen.getByText("Menghubungkan perangkat...")).toBeTruthy();
  advance(500);
  expect(TestSocket.instances).toHaveLength(2);
  act(() => socket().open());
  advance(15000);
  advance(999);
  expect(TestSocket.instances).toHaveLength(2);
  advance(1);
  expect(TestSocket.instances).toHaveLength(3);
  act(() => {
    socket().open();
    socket().message(push("Sync terbaru"));
    lateMessage?.({ data: JSON.stringify(push("Sync usang")) });
    lateClose?.({ code: 1008, reason: "Usang" });
    lateError?.();
  });
  advance(15000);
  expect(screen.getByText("Sync terbaru")).toBeTruthy();
  expect(screen.queryByText("Sync usang")).toBeNull();
  expect(TestSocket.instances).toHaveLength(3);
});

it("open dan sync valid tepat sebelum batas membatalkan timeout masing-masing fase", () => {
  render(<DeviceClientPage />);
  advance(14999);
  act(() => socket().open());
  advance(14999);
  act(() => socket().message(push("Berhasil sebelum batas")));
  advance(15001);
  expect(screen.getByText("Berhasil sebelum batas")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Coba sekarang" })).toBeNull();
  expect(socket().close).not.toHaveBeenCalled();
  expect(TestSocket.instances).toHaveLength(1);
});

it.each(["connect", "sync"])("retry manual membatalkan timeout %s lama tanpa mematikan percobaan baru", (phase) => {
  render(<DeviceClientPage />);
  if (phase === "sync") act(() => socket().open());
  const old = socket();
  advance(14000);
  fireEvent.click(screen.getByRole("button", { name: "Coba sekarang" }));
  const current = socket();
  advance(1000);
  expect(old.close).toHaveBeenCalledOnce();
  expect(current.close).not.toHaveBeenCalled();
  expect(TestSocket.instances).toHaveLength(2);
  act(() => { current.open(); current.message(push("Percobaan baru")); });
  advance(15000);
  expect(screen.getByText("Percobaan baru")).toBeTruthy();
  expect(TestSocket.instances).toHaveLength(2);
});

it.each(["connect", "sync"])("unmount membatalkan timeout %s dan semua callback percobaan", (phase) => {
  const view = render(<DeviceClientPage />);
  if (phase === "sync") act(() => socket().open());
  const old = socket();
  const callbacks = [old.onopen, old.onerror];
  const lateMessage = old.onmessage;
  const lateClose = old.onclose;
  advance(14000);
  view.unmount();
  act(() => {
    callbacks.forEach((callback) => callback?.());
    lateMessage?.({ data: JSON.stringify(push("Setelah unmount")) });
    lateClose?.({ code: 1006, reason: "" });
  });
  expect(vi.getTimerCount()).toBe(0);
  advance(120000);
  expect(TestSocket.instances).toHaveLength(1);
  expect(old.close).toHaveBeenCalledOnce();
});

it.each(["connect", "sync"])("pergantian Device membatalkan timeout %s dan callback identitas lama", (phase) => {
  const originalId = route.id;
  const view = render(<DeviceClientPage />);
  if (phase === "sync") act(() => socket().open());
  const old = socket();
  const lateOpen = old.onopen;
  const lateMessage = old.onmessage;
  const lateClose = old.onclose;
  const lateError = old.onerror;
  advance(14000);
  try {
    route.id = "33333333-3333-4333-8333-333333333333";
    localStorage.setItem(`device-token:${route.id}`, "token-baru");
    view.rerender(<DeviceClientPage />);
    act(() => {
      lateOpen?.();
      lateMessage?.({ data: JSON.stringify(push("Identitas lama")) });
      lateClose?.({ code: 1008, reason: "Usang" });
      lateError?.();
    });
    advance(1000);
    expect(socket().close).not.toHaveBeenCalled();
    act(() => { socket().open(); socket().message(push("Identitas baru")); });
    advance(15000);
    expect(screen.getByText("Identitas baru")).toBeTruthy();
    expect(screen.queryByText("Identitas lama")).toBeNull();
    expect(TestSocket.instances).toHaveLength(2);
  } finally { route.id = originalId; }
});

it("penggantian token membatalkan timeout sync dan callback token lama", () => {
  start();
  const old = socket();
  const lateMessage = old.onmessage;
  const lateClose = old.onclose;
  const lateError = old.onerror;
  advance(14000);
  act(() => old.disconnect(1008, "Token ditolak"));
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Ganti token" }));
  fireEvent.change(screen.getByLabelText("Token perangkat"), { target: { value: "token-pengganti" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan dan hubungkan" }));
  act(() => {
    lateMessage?.({ data: JSON.stringify(push("Token lama")) });
    lateClose?.({ code: 1008, reason: "Usang" });
    lateError?.();
  });
  advance(1000);
  expect(socket().close).not.toHaveBeenCalled();
  act(() => { socket().open(); socket().message(push("Token baru")); });
  expect(socket().send).toHaveBeenCalledWith(JSON.stringify({ type: "hello", deviceId: route.id, token: "token-pengganti" }));
  advance(15000);
  expect(screen.getByText("Token baru")).toBeTruthy();
  expect(TestSocket.instances).toHaveLength(2);
});

it.each(["push", "playlist"])("tayangan %s tetap berjalan selama timeout connect dan sync serta retry", (mode) => {
  start();
  act(() => socket().message(mode === "push" ? push("Tetap tampil") : playlist()));
  act(() => socket().disconnect());
  advance(500);
  // Langkah kecil membiarkan React menjadwalkan item Playlist berikutnya.
  for (let i = 0; i < 7; i++) advance(2000);
  advance(1000);
  expect(socket().close).toHaveBeenCalledOnce();
  expect(screen.getByText(mode === "push" ? "Tetap tampil" : "Kedua")).toBeTruthy();
  advance(1000);
  act(() => socket().open());
  for (let i = 0; i < 7; i++) advance(2000);
  advance(1000);
  expect(socket().close).toHaveBeenCalledOnce();
  expect(screen.getByText(mode === "push" ? "Tetap tampil" : "Kedua")).toBeTruthy();
  advance(2000);
  act(() => { socket().open(); socket().message(playlist("Pulih dari awal", "Lanjut")); });
  expect(screen.getByText("Pulih dari awal")).toBeTruthy();
});

it.each([0, 0.5, 1])("retry berjitter tanpa batas (%s) dan hanya sync valid me-reset backoff", (random) => {
  vi.mocked(Math.random).mockReturnValue(random);
  start();
  for (const cap of [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]) {
    const count = TestSocket.instances.length;
    act(() => { socket().message({ type: "sync" }); socket().disconnect(); });
    const delay = cap * (0.5 + random * 0.5);
    advance(delay - 1);
    expect(TestSocket.instances).toHaveLength(count);
    advance(1);
    expect(TestSocket.instances).toHaveLength(count + 1);
    act(() => socket().open());
  }
  act(() => { socket().message(push("Pulih")); socket().disconnect(); });
  const count = TestSocket.instances.length;
  advance(1000 * (0.5 + random * 0.5) - 1);
  expect(TestSocket.instances).toHaveLength(count);
  advance(1);
  expect(TestSocket.instances).toHaveLength(count + 1);
});

it("retry manual tidak me-reset backoff, membatalkan socket aktif, dan mengabaikan callback lama", () => {
  start();
  act(() => { socket().message(push("Tetap tampil")); socket().disconnect(); });
  advance(500);
  const old = socket();
  const lateOpen = old.onopen;
  const lateMessage = old.onmessage;
  const lateClose = old.onclose;
  const lateError = old.onerror;
  fireEvent.click(screen.getByRole("button", { name: "Coba sekarang" }));
  expect(old.close).toHaveBeenCalled();
  act(() => {
    lateOpen?.();
    lateMessage?.({ data: JSON.stringify(push("Pesan usang")) });
    lateClose?.({ code: 1008, reason: "Usang" });
    lateError?.();
  });
  expect(screen.getByText("Tetap tampil")).toBeTruthy();
  expect(screen.queryByText("Pesan usang")).toBeNull();
  act(() => { socket().open(); socket().disconnect(); });
  advance(999);
  expect(TestSocket.instances).toHaveLength(3);
  advance(1);
  expect(TestSocket.instances).toHaveLength(4);
});

it("1008 menghentikan tayangan dan retry sampai pengguna mengganti token", () => {
  start();
  act(() => socket().message(playlist()));
  act(() => socket().disconnect(1008, "Token ditolak"));
  expect(screen.getByText("Token ditolak")).toBeTruthy();
  expect(screen.queryByText("Pertama")).toBeNull();
  advance(120000);
  expect(TestSocket.instances).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Ganti token" }));
  expect(localStorage.getItem(`device-token:${route.id}`)).toBeNull();
  fireEvent.change(screen.getByLabelText("Token perangkat"), { target: { value: "token-baru" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan dan hubungkan" }));
  act(() => socket().open());
  expect(socket().send).toHaveBeenCalledWith(JSON.stringify({ type: "hello", deviceId: route.id, token: "token-baru" }));
  expect(screen.queryByText("Pertama")).toBeNull();
});

it("4009 menghentikan playback dan seluruh timer sampai Hubungkan kembali memverifikasi token tersimpan", () => {
  start();
  act(() => socket().message(playlist()));
  const old = socket();
  const lateMessage = old.onmessage;
  const lateError = old.onerror;
  act(() => old.disconnect(4009, "Replaced"));
  expect(screen.getByText("Device digunakan di tempat lain")).toBeTruthy();
  expect(screen.queryByText("Pertama")).toBeNull();
  advance(120000);
  expect(TestSocket.instances).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Hubungkan kembali" }));
  expect(TestSocket.instances).toHaveLength(2);
  act(() => {
    lateMessage?.({ data: JSON.stringify(push("Usang")) });
    lateError?.();
    socket().open();
  });
  expect(socket().send).toHaveBeenCalledWith(JSON.stringify({ type: "hello", deviceId: route.id, token: "token-rahasia" }));
  expect(screen.queryByText("Usang")).toBeNull();
  act(() => socket().disconnect(1008, "Token dirotasi"));
  expect(screen.getByRole("button", { name: "Ganti token" })).toBeTruthy();
  advance(120000);
  expect(TestSocket.instances).toHaveLength(2);
  expect(vi.getTimerCount()).toBe(0);
});

it("Hubungkan kembali memulai satu percobaan dan menerapkan sync terbaru dari awal", () => {
  start();
  act(() => socket().message(playlist()));
  advance(2000);
  act(() => socket().disconnect(4009));
  fireEvent.click(screen.getByRole("button", { name: "Hubungkan kembali" }));
  act(() => { socket().open(); socket().message(playlist("Terbaru", "Selanjutnya")); });
  expect(screen.getByText("Terbaru")).toBeTruthy();
  advance(15000);
  expect(TestSocket.instances).toHaveLength(2);
  expect(socket().send).toHaveBeenCalledWith(JSON.stringify({ type: "heartbeat" }));
  expect(screen.queryByRole("button", { name: "Hubungkan kembali" })).toBeNull();
});

it("error jaringan menjadwalkan satu retry meski disusul close dari percobaan lama", () => {
  start();
  act(() => socket().message(push("Tetap tersedia")));
  const old = socket();
  const lateClose = old.onclose;
  act(() => { old.onerror?.(); lateClose?.({ code: 1006, reason: "" }); });
  advance(499);
  expect(TestSocket.instances).toHaveLength(1);
  advance(1);
  expect(TestSocket.instances).toHaveLength(2);
  expect(screen.getByText("Tetap tersedia")).toBeTruthy();
});

it("kegagalan membuat socket tetap mencoba lagi sebelum sync pertama", () => {
  let first = true;
  vi.stubGlobal("WebSocket", class extends TestSocket {
    constructor(url: string) {
      if (first) { first = false; throw new Error("Jaringan gagal"); }
      super(url);
    }
  });
  render(<DeviceClientPage />);
  expect(screen.getByText("Menghubungkan perangkat...")).toBeTruthy();
  advance(500);
  expect(TestSocket.instances).toHaveLength(1);
  act(() => { socket().open(); socket().message({ type: "sync", mode: "idle", pushed: null, playlist: [] }); });
  expect(screen.getByText("Menunggu konten")).toBeTruthy();
});

it.each([false, true])("unmount membersihkan heartbeat, playback, retry dan callback (retry tertunda: %s)", (pendingRetry) => {
  const view = start();
  act(() => socket().message(playlist()));
  const old = socket();
  const lateMessage = old.onmessage;
  const lateClose = old.onclose;
  if (pendingRetry) act(() => old.disconnect());
  view.unmount();
  act(() => {
    lateMessage?.({ data: JSON.stringify(push("Usang")) });
    lateClose?.({ code: 1006, reason: "" });
  });
  advance(120000);
  expect(TestSocket.instances).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("pergantian Device membersihkan percobaan dan tidak membawa token/tayangan Device lama", () => {
  const originalId = route.id;
  const view = start();
  act(() => socket().message(push("Device lama")));
  const old = socket();
  const lateMessage = old.onmessage;
  try {
    route.id = "33333333-3333-4333-8333-333333333333";
    localStorage.setItem(`device-token:${route.id}`, "token-device-baru");
    view.rerender(<DeviceClientPage />);
    expect(old.close).toHaveBeenCalled();
    act(() => {
      lateMessage?.({ data: JSON.stringify(push("Pesan Device lama")) });
      socket().open();
      socket().message(push("Device baru"));
    });
    expect(screen.queryByText("Device lama")).toBeNull();
    expect(screen.queryByText("Pesan Device lama")).toBeNull();
    expect(socket().send).toHaveBeenCalledWith(JSON.stringify({ type: "hello", deviceId: route.id, token: "token-device-baru" }));
    advance(30000);
    expect(TestSocket.instances).toHaveLength(2);
  } finally { route.id = originalId; }
});

it("mempertahankan Content saat 1011 dan memulihkan Push terbaru tanpa reload", () => {
  start();
  expect(screen.getByText("Menghubungkan perangkat...")).toBeTruthy();
  act(() => socket().message(push("Tayangan lama")));
  act(() => socket().disconnect(1011));
  expect(screen.getByText("Tayangan lama")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Coba sekarang" })).toBeTruthy();
  advance(500);
  act(() => { socket().open(); socket().message(push("Push terbaru")); });
  expect(screen.getByText("Push terbaru")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Coba sekarang" })).toBeNull();
});

it("watchdog mulai setelah sync, heartbeat tiap 15 detik, dan pesan malformed tidak menunda pemulihan 45 detik", () => {
  start();
  advance(14999);
  expect(TestSocket.instances).toHaveLength(1);
  act(() => socket().message(push("Tetap tampil")));
  const current = socket();
  current.send.mockClear();
  advance(15000);
  expect(current.send.mock.calls).toEqual([[JSON.stringify({ type: "heartbeat" })]]);
  advance(29999);
  act(() => {
    current.message({ type: "sync" });
    current.message({ type: "heartbeat_ack", mode: "idle" });
    current.onmessage?.({ data: "bukan json" });
  });
  expect(current.close).not.toHaveBeenCalled();
  advance(1);
  expect(current.close).toHaveBeenCalledOnce();
  expect(screen.getByText("Tetap tampil")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Coba sekarang" })).toBeTruthy();
  advance(499);
  expect(TestSocket.instances).toHaveLength(1);
  advance(1);
  expect(TestSocket.instances).toHaveLength(2);
});

it("ack sebelum sync tidak memperpanjang timeout sync pertama 15 detik", () => {
  start();
  const current = socket();
  advance(14999);
  act(() => current.message({ type: "heartbeat_ack" }));
  expect(current.close).not.toHaveBeenCalled();
  advance(1);
  expect(current.close).toHaveBeenCalledOnce();
  advance(500);
  expect(TestSocket.instances).toHaveLength(2);
});

it("ack memperpanjang watchdog tanpa me-reset posisi atau durasi Playlist; sync baru memperbarui batas", () => {
  start();
  act(() => socket().message(playlist()));
  advance(2000);
  advance(1000);
  act(() => socket().message({ type: "heartbeat_ack" }));
  expect(screen.getByText("Kedua")).toBeTruthy();
  advance(999);
  expect(screen.getByText("Kedua")).toBeTruthy();
  advance(1);
  expect(screen.getByText("Pertama")).toBeTruthy();
  advance(40000);
  const current = socket();
  act(() => current.message(push("Push baru")));
  advance(40000);
  expect(current.close).not.toHaveBeenCalled();
  act(() => current.message({ type: "heartbeat_ack" }));
  advance(44999);
  expect(current.close).not.toHaveBeenCalled();
  expect(screen.getByText("Push baru")).toBeTruthy();
  advance(1);
  expect(current.close).toHaveBeenCalledOnce();
});

it("ack sebelum sync tidak menyelesaikan pemulihan atau me-reset backoff", () => {
  start();
  act(() => socket().disconnect());
  advance(500);
  act(() => { socket().open(); socket().message({ type: "heartbeat_ack" }); });
  expect(screen.getByRole("button", { name: "Coba sekarang" })).toBeTruthy();
  act(() => socket().disconnect());
  advance(999);
  expect(TestSocket.instances).toHaveLength(2);
  advance(1);
  expect(TestSocket.instances).toHaveLength(3);
});

it("retry manual membatalkan watchdog lama; ack callback lama tidak memperpanjang koneksi baru", () => {
  start();
  act(() => socket().message(push("Tayangan")));
  advance(30000);
  const old = socket();
  const lateMessage = old.onmessage;
  // Gangguan mengaktifkan tindakan manual dan harus membersihkan watchdog lama.
  act(() => old.disconnect());
  fireEvent.click(screen.getByRole("button", { name: "Coba sekarang" }));
  act(() => { socket().open(); socket().message(push("Pulih")); });
  const current = socket();
  advance(30000);
  expect(current.close).not.toHaveBeenCalled();
  act(() => lateMessage?.({ data: JSON.stringify({ type: "heartbeat_ack" }) }));
  advance(15000);
  expect(current.close).toHaveBeenCalledOnce();
  expect(old.send.mock.calls.filter(([data]) => data === JSON.stringify({ type: "heartbeat" }))).toHaveLength(2);
  expect(screen.getByText("Pulih")).toBeTruthy();
});

it("Playlist terus berputar saat Offline; retry manual mempertahankan token dan Release terbaru mulai dari awal", () => {
  start();
  act(() => socket().message(playlist()));
  advance(2000);
  expect(screen.getByText("Kedua")).toBeTruthy();
  const old = socket();
  act(() => old.disconnect());
  advance(200);
  fireEvent.click(screen.getByRole("button", { name: "Coba sekarang" }));
  expect(TestSocket.instances).toHaveLength(2);
  expect(screen.getByText("Kedua")).toBeTruthy();
  act(() => socket().open());
  expect(socket().send).toHaveBeenCalledWith(JSON.stringify({ type: "hello", deviceId: route.id, token: "token-rahasia" }));
  advance(1800);
  expect(TestSocket.instances).toHaveLength(2);
  expect(screen.getByText("Pertama")).toBeTruthy();
  act(() => socket().message(push("Push saat Offline")));
  act(() => socket().disconnect());
  advance(500);
  act(() => { socket().open(); socket().message(playlist("Playlist baru", "Berikutnya")); });
  expect(screen.getByText("Playlist baru")).toBeTruthy();
  advance(2000);
  expect(screen.getByText("Berikutnya")).toBeTruthy();
  act(() => socket().message(playlist("Playlist baru", "Berikutnya")));
  expect(screen.getByText("Playlist baru")).toBeTruthy();
});
