import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { AdminServerMessage, Content, CreateDevice, Device, UpdateDevice } from "@signage/shared";
import { adminClientMessageSchema, adminServerMessageSchema } from "@signage/shared";
import { api, ApiError } from "@/lib/api";
import { getToken, handleAuthFailure } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [editing, setEditing] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeContentError, setActiveContentError] = useState<string | null>(null);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);

  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.get<Device[]>("/api/devices"),
  });

  const contentsQuery = useQuery({
    queryKey: ["contents"],
    queryFn: () => api.get<Content[]>("/api/contents"),
  });

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
      return api.post<Device>("/api/devices", values);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["devices"] });
      setFormOpen(false);
      setEditing(null);
      setActionError(null);
    },
    onError: (err) => setActionError(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/devices/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["devices"] });
      setDeleting(null);
      setActionError(null);
    },
    onError: (err) => setActionError(errorMessage(err)),
  });

  const setActiveContentMutation = useMutation({
    mutationFn: async ({ deviceId, contentId }: { deviceId: string; contentId: string }) => {
      setPendingDeviceId(deviceId);
      return api.put<Device>(`/api/devices/${deviceId}/active-content`, { contentId });
    },
    onSuccess: async () => {
      setActiveContentError(null);
      await qc.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: (err) => setActiveContentError(errorMessage(err)),
    onSettled: () => setPendingDeviceId(null),
  });

  const clearActiveContentMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      setPendingDeviceId(deviceId);
      return api.delete<Device>(`/api/devices/${deviceId}/active-content`);
    },
    onSuccess: async () => {
      setActiveContentError(null);
      await qc.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: (err) => setActiveContentError(errorMessage(err)),
    onSettled: () => setPendingDeviceId(null),
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

  const columns = useMemo(
    () => [
      columnHelper.accessor("nama", { header: "Nama", cell: (info) => info.getValue() }),
      columnHelper.accessor("lokasi", { header: "Lokasi", cell: (info) => info.getValue() || "-" }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <span className={info.getValue() === "online" ? "text-green-600" : "text-muted-foreground"}>
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("lastSeen", {
        header: "Terakhir terlihat",
        cell: (info) => {
          const v = info.getValue();
          return v ? new Date(v).toLocaleString() : "-";
        },
      }),
      columnHelper.accessor("pushedContentId", {
        header: "Konten aktif",
        cell: ({ row }) => {
          const device = row.original;
          const busy = pendingDeviceId === device.id;
          const contents = contentsQuery.data ?? [];
          return (
            <div className="flex items-center gap-2">
              <select
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={device.pushedContentId ?? ""}
                disabled={busy || contentsQuery.isLoading}
                onChange={(e) => {
                  const value = e.target.value;
                  setActiveContentError(null);
                  if (!value) return;
                  setActiveContentMutation.mutate({ deviceId: device.id, contentId: value });
                }}
              >
                <option value="">(tidak ada)</option>
                {contents.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.judul}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !device.pushedContentId}
                onClick={() => {
                  setActiveContentError(null);
                  clearActiveContentMutation.mutate(device.id);
                }}
              >
                Kosongkan
              </Button>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "Aksi",
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => openEdit(row.original)}>
              Ubah
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
          </div>
        ),
      }),
    ],
    [clearActiveContentMutation, contentsQuery.data, contentsQuery.isLoading, pendingDeviceId, setActiveContentMutation],
  );

  const table = useReactTable({
    data: devicesQuery.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Devices</CardTitle>
          <Button onClick={openCreate}>Tambah Device</Button>
        </CardHeader>
        <CardContent>
          {devicesQuery.isLoading && <p className="text-sm text-muted-foreground">Memuat...</p>}
          {devicesQuery.isError && (
            <p className="text-sm text-destructive">{errorMessage(devicesQuery.error)}</p>
          )}
          {activeContentError && <p className="mb-2 text-sm text-destructive">{activeContentError}</p>}
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
                      Belum ada device.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
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
    </div>
  );
}
