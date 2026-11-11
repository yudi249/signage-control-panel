import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  AdminServerMessage,
  Content,
  CreateDevice,
  Device,
  DeviceWithToken,
  PlaylistItemResponse,
  UpdateDevice,
} from "@signage/shared";
import {
  adminClientMessageSchema,
  adminServerMessageSchema,
  deviceWithTokenSchema,
  playlistResponseSchema,
} from "@signage/shared";
import { api, ApiError } from "@/lib/api";
import { getToken, handleAuthFailure } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContentPreview, contentTypeLabels } from "@/components/content-preview";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Terjadi kesalahan";
}

const columnHelper = createColumnHelper<Device>();

export function DevicesPage() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [idCopyNotice, setIdCopyNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [pushSelection, setPushSelection] = useState<Record<string, string>>({});
  const [playbackMode, setPlaybackMode] = useState<"playlist" | "direct">("playlist");
  const [rotating, setRotating] = useState<Device | null>(null);
  const [editing, setEditing] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [tokenReveal, setTokenReveal] = useState<{
    token: string;
    deviceName: string;
    context: "create" | "rotate";
  } | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
  const [playlistDevice, setPlaylistDevice] = useState<Device | null>(null);
  const [playlistItems, setPlaylistItems] = useState<PlaylistItemResponse[]>([]);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [playlistNotice, setPlaylistNotice] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerType, setPickerType] = useState("all");
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  async function copyDeviceId(device: Device) {
    try {
      await navigator.clipboard.writeText(device.id);
      setIdCopyNotice(`ID ${device.nama} berhasil disalin.`);
    } catch {
      setIdCopyNotice(`Gagal menyalin. Salin ID Device ini secara manual: ${device.id}`);
    }
  }

  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.get<Device[]>("/api/devices"),
  });

  const contentsQuery = useQuery({
    queryKey: ["contents"],
    queryFn: () => api.get<Content[]>("/api/contents"),
  });

  const playlistQuery = useQuery({
    queryKey: ["playlist", playlistDevice?.id],
    queryFn: async () => {
      const res = await api.get<PlaylistItemResponse[]>(`/api/devices/${playlistDevice!.id}/playlist`);
      return playlistResponseSchema.parse(res);
    },
    enabled: !!playlistDevice,
  });

  useEffect(() => {
    if (playlistQuery.data) {
      setPlaylistItems(playlistQuery.data);
    }
  }, [playlistQuery.data]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      handleAuthFailure();
      return;
    }

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/admin`);
    let opened = false;

    const failAuth = () => {
      handleAuthFailure();
    };

    const onOpen = () => {
      opened = true;
      const authMsg = adminClientMessageSchema.parse({ type: "auth", token });
      ws.send(JSON.stringify(authMsg));
    };

    const onMessage = (ev: MessageEvent) => {
      try {
        const parsed = adminServerMessageSchema.safeParse(JSON.parse(String(ev.data)));
        if (!parsed.success) return;
        const msg: AdminServerMessage = parsed.data;
        qc.setQueryData<Device[]>(["devices"], (prev) => {
          if (!prev) return prev;
          if (msg.type === "snapshot") {
            const byId = new Map(msg.devices.map((d) => [d.deviceId, d]));
            return prev.map((d) => {
              const p = byId.get(d.id);
              return p ? { ...d, status: p.status, lastSeen: p.lastSeen } : d;
            });
          }
          if (msg.type === "presence") {
            return prev.map((d) =>
              d.id === msg.deviceId ? { ...d, status: msg.status, lastSeen: msg.lastSeen } : d,
            );
          }
          return prev;
        });
      } catch {
        // ignore malformed messages
      }
    };

    const onClose = () => {
      if (!opened) {
        failAuth();
        return;
      }
      failAuth();
    };

    const onError = () => {
      failAuth();
    };

    ws.addEventListener("open", onOpen);
    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onError);
    return () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("close", onClose);
      ws.removeEventListener("error", onError);
      try { ws.close(); } catch { /* ignore */ }
    };
  }, [qc]);

  const saveMutation = useMutation({
    mutationFn: async (values: CreateDevice | UpdateDevice) => {
      if (editing) return api.patch<Device>(`/api/devices/${editing.id}`, values);
      const res = await api.post<DeviceWithToken>("/api/devices", values);
      return deviceWithTokenSchema.parse(res);
    },
    onSuccess: async (result, _values, _ctx) => {
      await qc.invalidateQueries({ queryKey: ["devices"] });
      setFormOpen(false);
      const wasEditing = !!editing;
      const name = editing?.nama;
      setEditing(null);
      setActionError(null);
      if (!wasEditing) {
        const created = result as DeviceWithToken;
        setCopyNotice(null);
        setTokenReveal({
          token: created.token,
          deviceName: created.device.nama,
          context: "create",
        });
      } else if (name) {
        // no token reveal on edit
        void name;
      }
    },
    onError: (err) => setActionError(errorMessage(err)),
  });

  const rotateTokenMutation = useMutation({
    mutationFn: async (device: Device) => {
      setRotatingId(device.id);
      const res = await api.post<DeviceWithToken>(`/api/devices/${device.id}/token`, {});
      return { parsed: deviceWithTokenSchema.parse(res), deviceName: device.nama };
    },
    onSuccess: async ({ parsed, deviceName }) => {
      await qc.invalidateQueries({ queryKey: ["devices"] });
      setRotateError(null);
      setCopyNotice(null);
      setTokenReveal({ token: parsed.token, deviceName, context: "rotate" });
    },
    onError: (err) => setRotateError(errorMessage(err)),
    onSettled: () => setRotatingId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/devices/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["devices"] });
      setDeleting(null);
      setActionError(null);
      setRotateError(null);
    },
    onError: (err) => setActionError(errorMessage(err)),
  });

  const pushMutation = useMutation({
    mutationFn: async ({ deviceId, contentId }: { deviceId: string; contentId: string }) => {
      setPendingDeviceId(deviceId);
      return api.post<Device>(`/api/devices/${deviceId}/push`, { contentId });
    },
    onSuccess: async () => {
      setPushError(null);
      await qc.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: (err) => setPushError(errorMessage(err)),
    onSettled: () => setPendingDeviceId(null),
  });

  const releaseMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      setPendingDeviceId(deviceId);
      return api.delete<Device>(`/api/devices/${deviceId}/push`);
    },
    onSuccess: async () => {
      setPushError(null);
      await qc.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: (err) => setPushError(errorMessage(err)),
    onSettled: () => setPendingDeviceId(null),
  });

  const savePlaylistMutation = useMutation({
    mutationFn: async ({ deviceId, items }: { deviceId: string; items: PlaylistItemResponse[] }) => {
      const payload = {
        items: items.map((item, index) => ({
          contentId: item.content.id,
          position: index,
          durationSeconds: item.durationSeconds,
        })),
      };
      const res = await api.put<PlaylistItemResponse[]>(`/api/devices/${deviceId}/playlist`, payload);
      return playlistResponseSchema.parse(res);
    },
    onSuccess: (data) => {
      setPlaylistItems(data);
      setPlaylistError(null);
      setPlaylistNotice("Playlist berhasil disimpan.");
      void qc.invalidateQueries({ queryKey: ["playlist", playlistDevice?.id] });
    },
    onError: (err) => {
      setPlaylistNotice(null);
      setPlaylistError(errorMessage(err));
    },
  });

  const form = useForm({
    defaultValues: { nama: editing?.nama ?? "", lokasi: editing?.lokasi ?? "" },
    onSubmit: async ({ value }) => {
      setActionError(null);
      await saveMutation.mutateAsync({
        nama: value.nama.trim(),
        lokasi: value.lokasi.trim(),
      });
    },
  });

  function openCreate() {
    setEditing(null);
    setActionError(null);
    form.reset({ nama: "", lokasi: "" });
    setFormOpen(true);
  }

  function openEdit(device: Device) {
    setEditing(device);
    setActionError(null);
    form.reset({ nama: device.nama, lokasi: device.lokasi });
    setFormOpen(true);
  }

  function openPlaylist(device: Device) {
    setPlaybackMode(device.pushedContentId ? "direct" : "playlist");
    setPushSelection((previous) => ({ ...previous, [device.id]: device.pushedContentId ?? "" }));
    setPushError(null);
    setPlaylistItems([]);
    setPlaylistDevice(device);
    setPlaylistError(null);
    setPlaylistNotice(null);
    setPickerOpen(false);
    setPickedIds([]);
  }

  function addPlaylistItem() {
    setPlaylistError(null);
    setPlaylistNotice(null);
    const byId = new Map((contentsQuery.data ?? []).map((content) => [content.id, content]));
    const selected = pickedIds.flatMap((id) => { const content = byId.get(id); return content ? [content] : []; });
    setPlaylistItems((previous) => [...previous, ...selected.map((content, index) => ({ position: previous.length + index, durationSeconds: 10, content }))]);
    setPickedIds([]);
    setPickerOpen(false);
  }

  function updatePlaylistDuration(index: number, value: string) {
    setPlaylistNotice(null);
    const duration = Number.parseInt(value, 10);
    setPlaylistItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, durationSeconds: Number.isNaN(duration) ? 0 : duration }
          : item,
      ),
    );
  }

  function movePlaylistItem(index: number, direction: -1 | 1) {
    setPlaylistNotice(null);
    setPlaylistItems((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      if (!moved) return prev;
      copy.splice(nextIndex, 0, moved);
      return copy.map((item, i) => ({ ...item, position: i }));
    });
  }

  function removePlaylistItem(index: number) {
    setPlaylistNotice(null);
    setPlaylistItems((prev) =>
      prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, position: i })),
    );
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor("nama", { header: "Device", cell: (info) => <div className="device-name"><span className="device-glyph" aria-hidden="true">▣</span><div><strong>{info.getValue()}</strong><div className="device-id-row"><span className="device-id" title={info.row.original.id}>{info.row.original.id}</span><button type="button" className="copy-id-button" aria-label={`Salin ID ${info.getValue()}`} title="Salin ID Device" onClick={() => void copyDeviceId(info.row.original)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4" /></svg></button></div></div></div> }),
      columnHelper.accessor("lokasi", { header: "Lokasi", cell: (info) => info.getValue() || "-" }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <span className={`status-badge ${info.getValue() === "online" ? "status-online" : "status-offline"}`}>
            <span aria-hidden="true">●</span>{info.getValue() === "online" ? "Online" : "Offline"}
          </span>
        ),
      }),
      columnHelper.accessor("lastSeen", {
        header: "Terakhir terlihat",
        cell: (info) => {
          const v = info.getValue();
          return v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Belum terhubung";
        },
      }),
      columnHelper.accessor("pushedContentId", {
        header: "Pemutaran",
        cell: ({ row }) => {
          const device = row.original;
          const contents = contentsQuery.data ?? [];
          return (
            <div>
              <p className="playback-status">{device.pushedContentId ? `Konten langsung: ${contents.find((content) => content.id === device.pushedContentId)?.judul ?? "Memuat konten…"}` : "Playlist dipilih · idle jika playlist kosong"}</p>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "Aksi",
        cell: ({ row }) => (
          <div className="row-actions">
            <Button variant="outline" size="sm" onClick={() => openPlaylist(row.original)}>
              Atur konten
            </Button>
            <details className="action-menu"><summary aria-label={`Pengaturan ${row.original.nama}`}>•••</summary><div className="action-popover">
            <Button variant="ghost" size="sm" onClick={() => openEdit(row.original)}>Ubah Device</Button>
            <Button
              variant="outline"
              size="sm"
              disabled={rotatingId === row.original.id}
              onClick={() => {
                setRotateError(null);
                setRotating(row.original);
              }}
            >
              {rotatingId === row.original.id ? "Memutar..." : "Rotasi token"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setActionError(null);
                setDeleting(row.original);
              }}
            >
              Hapus
            </Button>
            </div></details>
          </div>
        ),
      }),
    ],
    [
      contentsQuery.data,
      contentsQuery.isLoading,
      pendingDeviceId,
      pushMutation,
      releaseMutation,
      rotateTokenMutation,
      rotatingId,
      pushSelection,
    ],
  );

  const filteredDevices = useMemo(() => (devicesQuery.data ?? []).filter((device) => `${device.nama} ${device.lokasi}`.toLowerCase().includes(search.toLowerCase()) && (statusFilter === "all" || device.status === statusFilter)), [devicesQuery.data, search, statusFilter]);
  const table = useReactTable({
    data: filteredDevices,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  async function copyToken() {
    if (!tokenReveal) return;
    try {
      await navigator.clipboard.writeText(tokenReveal.token);
      setCopyNotice("Token disalin.");
    } catch {
      setCopyNotice("Gagal menyalin otomatis. Salin token secara manual.");
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading"><div><p className="eyebrow">Pengelolaan layar</p><h1>Device</h1><p>Pantau koneksi dan atur konten yang tampil di setiap layar.</p></div><Button onClick={openCreate}><span aria-hidden="true">＋</span> Tambah Device</Button></div>
      {idCopyNotice && <p className="success-notice break-all" role="status">{idCopyNotice}</p>}
      <div className="device-summary" aria-label="Ringkasan device"><div><span>Seluruh Device</span><strong>{devicesQuery.data?.length ?? "—"}</strong></div><div><span><i className="online-dot" />Online</span><strong>{devicesQuery.data ? devicesQuery.data.filter((d) => d.status === "online").length : "—"}</strong></div><div><span>Offline</span><strong>{devicesQuery.data ? devicesQuery.data.filter((d) => d.status === "offline").length : "—"}</strong></div></div>
      <Card>
        <CardHeader className="list-toolbar">
          <CardTitle>Daftar Device</CardTitle>
          <div className="toolbar-filters"><Input aria-label="Cari Device" placeholder="Cari nama atau lokasi…" value={search} onChange={(e) => setSearch(e.target.value)} /><select aria-label="Filter status Device" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Semua status</option><option value="online">Online</option><option value="offline">Offline</option></select></div>
        </CardHeader>
        <CardContent>
          {devicesQuery.isLoading && <p className="text-sm text-muted-foreground">Memuat...</p>}
          {devicesQuery.isError && (
            <p className="text-sm text-destructive">{errorMessage(devicesQuery.error)}</p>
          )}
          {pushError && <p className="mb-2 text-sm text-destructive">{pushError}</p>}
          {rotateError && <p className="mb-2 text-sm text-destructive">{rotateError}</p>}
          {devicesQuery.isSuccess && (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id}>
                        {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      <div className="empty-state"><strong>{devicesQuery.data?.length ? "Device tidak ditemukan" : "Hubungkan layar pertama Anda"}</strong><p>{devicesQuery.data?.length ? "Coba nama, lokasi, atau status lain." : "Tambahkan Device, lalu gunakan token untuk memasangkan layar."}</p></div>
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} data-label={typeof cell.column.columnDef.header === "string" ? cell.column.columnDef.header : ""}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="context-help">Gunakan Atur konten untuk memilih satu materi langsung atau menyusun playlist berulang di setiap Device.</p>

      <Dialog open={!!rotating} onOpenChange={(open) => !open && setRotating(null)} title="Ganti token Device?"><div className="space-y-4"><p>Token lama untuk <strong>{rotating?.nama}</strong> akan berhenti berlaku. Pasangkan kembali Device Client menggunakan token baru.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRotating(null)}>Batal</Button><Button onClick={() => { if (rotating) rotateTokenMutation.mutate(rotating); setRotating(null); }}>Ganti token</Button></div></div></Dialog>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        title={editing ? "Ubah Device" : "Tambah Device"}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="nama">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="nama">Nama</Label>
                <Input
                  id="nama"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          </form.Field>
          <form.Field name="lokasi">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="lokasi">Lokasi</Label>
                <Input
                  id="lokasi"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Batal
            </Button>
            <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? "Menyimpan..." : "Simpan"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)} title="Hapus Device">
        <div className="space-y-4">
          <p className="text-sm">
            Hapus device <strong>{deleting?.nama}</strong>? Tindakan ini tidak dapat dibatalkan.
          </p>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              {deleteMutation.isPending ? "Menghapus..." : "Hapus"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!tokenReveal}
        onOpenChange={(open) => {
          if (!open) {
            setTokenReveal(null);
            setCopyNotice(null);
          }
        }}
        title={tokenReveal?.context === "rotate" ? "Token baru device" : "Token device baru"}
      >
        <div className="space-y-4">
          <p className="text-sm">
            Device token untuk <strong>{tokenReveal?.deviceName}</strong>{" "}
            {tokenReveal?.context === "rotate" ? "berhasil dirotasi." : "berhasil dibuat."}
          </p>
          <div className="rounded-md border bg-muted p-3">
            <p className="break-all font-mono text-sm">{tokenReveal?.token}</p>
          </div>
          <p className="text-sm font-medium text-destructive">
            Salin token ini sekarang. Token hanya ditampilkan sekali dan tidak akan ditampilkan lagi di daftar, detail, atau form ubah Device.{" "}
            {tokenReveal?.context === "rotate"
              ? "Token lama sudah tidak berlaku; perbarui token pada Device Client."
              : "Gunakan token ini untuk memasangkan Device Client."}
          </p>
          {copyNotice && <p className="text-sm text-muted-foreground">{copyNotice}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => void copyToken()}>
              Salin token
            </Button>
            <Button
              type="button"
              onClick={() => {
                setTokenReveal(null);
                setCopyNotice(null);
              }}
            >
              Saya sudah menyalin
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!playlistDevice}
        onOpenChange={(open) => {
          if (!open) {
            setPlaylistDevice(null);
            setPlaylistError(null);
            setPlaylistNotice(null);
          }
        }}
        title={pickerOpen ? playbackMode === "direct" ? "Pilih konten langsung" : "Pilih konten untuk playlist" : playlistDevice ? `Atur konten · ${playlistDevice.nama}` : "Atur konten"}
      >
        <div className="space-y-4">
          {pickerOpen ? <>
            <Button variant="ghost" onClick={() => setPickerOpen(false)}>← {playbackMode === "direct" ? "Kembali ke pengaturan" : "Kembali ke playlist"}</Button>
            <div className="toolbar-filters"><Input aria-label="Cari konten playlist" placeholder="Cari judul konten…" value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} /><select aria-label="Filter jenis konten playlist" value={pickerType} onChange={(event) => setPickerType(event.target.value)}><option value="all">Semua jenis</option>{Object.entries(contentTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            {contentsQuery.isLoading && <p role="status">Memuat konten…</p>}
            {contentsQuery.isError && <p role="alert" className="text-destructive">{errorMessage(contentsQuery.error)}</p>}
            <div className="content-picker-grid">
              {(contentsQuery.data ?? []).filter((content) => content.judul.toLowerCase().includes(pickerSearch.toLowerCase()) && (pickerType === "all" || content.tipe === pickerType)).map((content) => <label className={`picker-card ${pickedIds.includes(content.id) ? "is-selected" : ""}`} key={content.id}>
                <div className={`gallery-preview preview-${content.tipe}`}><ContentPreview key={`${content.id}-${content.payload}`} content={content} /></div>
                <div className="picker-card-label"><input type={playbackMode === "direct" ? "radio" : "checkbox"} name={playbackMode === "direct" ? "direct-content-choice" : undefined} aria-label={`Pilih ${content.judul}`} checked={pickedIds.includes(content.id)} onChange={(event) => setPickedIds((previous) => playbackMode === "direct" ? [content.id] : event.target.checked ? [...previous, content.id] : previous.filter((id) => id !== content.id))} /><div><strong>{content.judul}</strong><span>{contentTypeLabels[content.tipe]}</span></div></div>
              </label>)}
            </div>
            {contentsQuery.isSuccess && !(contentsQuery.data ?? []).some((content) => content.judul.toLowerCase().includes(pickerSearch.toLowerCase()) && (pickerType === "all" || content.tipe === pickerType)) && <p className="empty-state">Tidak ada konten yang sesuai. Coba pencarian atau filter lain.</p>}
            <div className="picker-footer"><p role="status">{playbackMode === "direct" ? `${pickedIds.length} dari 1 konten dipilih` : `${pickedIds.length} dipilih · durasi awal 10 detik/item`}</p><Button disabled={!pickedIds.length || contentsQuery.isError || contentsQuery.isLoading} onClick={() => { if (playbackMode === "direct") { const contentId = pickedIds[0]; if (playlistDevice && contentId) setPushSelection((previous) => ({ ...previous, [playlistDevice.id]: contentId })); setPickerOpen(false); } else addPlaylistItem(); }}>{playbackMode === "direct" ? "Gunakan konten ini" : `Tambahkan ${pickedIds.length || ""} konten`}</Button></div>
          </> : <>
          <div className="space-y-2"><Label htmlFor="playback-mode">Mode pemutaran</Label><select id="playback-mode" className="w-full" value={playbackMode} disabled={pendingDeviceId !== null || savePlaylistMutation.isPending} onChange={(event) => { setPlaybackMode(event.target.value as "playlist" | "direct"); setPushError(null); setPlaylistError(null); }}><option value="direct">Konten langsung</option><option value="playlist">Playlist berulang</option></select><p className="text-sm text-muted-foreground">{playbackMode === "direct" ? "Tampilkan satu konten sampai Anda menggantinya. Playlist yang tersimpan tetap tersedia." : "Susun urutan konten dan durasinya. Playlist kosong membuat layar menunggu konten."}</p></div>
          {playbackMode === "direct" && <div className="space-y-3"><p className="text-sm font-medium">Konten yang ditayangkan</p>{(() => { const selected = (contentsQuery.data ?? []).find((content) => playlistDevice && content.id === pushSelection[playlistDevice.id]); return selected ? <div className="gallery-card"><div className={`gallery-preview preview-${selected.tipe}`}><ContentPreview key={`${selected.id}-${selected.payload}`} content={selected} /></div><div className="gallery-card-info"><h3 className="text-sm font-medium">{selected.judul}</h3><span className="type-badge">{contentTypeLabels[selected.tipe]}</span></div></div> : <p className="text-sm text-muted-foreground">Belum ada konten dipilih.</p>; })()}<Button variant="outline" disabled={pendingDeviceId !== null} onClick={() => { setPickerSearch(""); setPickerType("all"); setPickedIds(playlistDevice && pushSelection[playlistDevice.id] ? [pushSelection[playlistDevice.id]!] : []); setPickerOpen(true); }}>Pilih dari galeri</Button>{contentsQuery.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(contentsQuery.error)}</p>}</div>}
          {playbackMode === "playlist" && <>

          {playlistQuery.isLoading && <p className="text-sm text-muted-foreground">Memuat playlist...</p>}
          {playlistQuery.isError && (
            <p className="text-sm text-destructive">{errorMessage(playlistQuery.error)}</p>
          )}

          {!playlistQuery.isLoading && !playlistQuery.isError && (
            <>
              {playlistItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada item di playlist.</p>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {playlistItems.map((item, index) => (
                    <div key={`${item.content.id}-${index}`} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {index + 1}. {item.content.judul}
                          </p>
                          <p className="text-xs text-muted-foreground">
                             {item.content.tipe}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={index === 0}
                            onClick={() => movePlaylistItem(index, -1)}
                            aria-label="Naikkan"
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={index === playlistItems.length - 1}
                            onClick={() => movePlaylistItem(index, 1)}
                            aria-label="Turunkan"
                          >
                            ↓
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => removePlaylistItem(index)}
                          >
                            Hapus
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Label htmlFor={`durasi-${index}`} className="text-xs">
                          Durasi (detik)
                        </Label>
                        <Input
                          id={`durasi-${index}`}
                          type="number"
                          min={1}
                          step={1}
                          className="h-8 w-24"
                          value={String(item.durationSeconds)}
                          onChange={(e) => updatePlaylistDuration(index, e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button type="button" variant="outline" onClick={() => { setPickerSearch(""); setPickerType("all"); setPickedIds([]); setPickerOpen(true); }}>＋ Tambah konten</Button>
            </>
          )}

          </>}
          {pushError && <p role="alert" className="text-sm text-destructive">{pushError}</p>}
          {playlistError && <p className="text-sm text-destructive">{playlistError}</p>}
          {playlistNotice && <p className="text-sm text-green-600">{playlistNotice}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPlaylistDevice(null);
                setPlaylistError(null);
                setPlaylistNotice(null);
              }}
            >
              Tutup
            </Button>
            <Button
              type="button"
              disabled={!playlistDevice || savePlaylistMutation.isPending || pendingDeviceId !== null || (playbackMode === "playlist" ? playlistQuery.isLoading || playlistQuery.isError : contentsQuery.isLoading || !pushSelection[playlistDevice.id])}
              onClick={() => {
                if (!playlistDevice) return;
                if (playbackMode === "direct") {
                  const contentId = pushSelection[playlistDevice.id];
                  if (contentId) pushMutation.mutate({ deviceId: playlistDevice.id, contentId }, { onSuccess: () => setPlaylistDevice(null) });
                  return;
                }
                setPlaylistNotice(null);
                const invalid = playlistItems.find(
                  (item) => !Number.isInteger(item.durationSeconds) || item.durationSeconds <= 0,
                );
                if (invalid) {
                  setPlaylistError("Durasi setiap item harus bilangan bulat lebih dari 0.");
                  return;
                }
                setPlaylistError(null);
                const deviceId = playlistDevice.id;
                savePlaylistMutation.mutate({ deviceId, items: playlistItems }, { onSuccess: () => {
                  releaseMutation.mutate(deviceId, { onSuccess: () => setPlaylistDevice(null) });
                } });
              }}
            >
              {savePlaylistMutation.isPending || pendingDeviceId !== null ? "Menerapkan…" : playbackMode === "direct" ? "Tayangkan konten" : "Simpan & gunakan playlist"}
            </Button>
          </div>
          </>}
        </div>
      </Dialog>
    </div>
  );
}
