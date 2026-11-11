import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { Content, ContentType, CreateContent, UpdateContent } from "@signage/shared";
import { api, ApiError } from "@/lib/api";
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

const columnHelper = createColumnHelper<Content>();
const TIPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: "text", label: "Teks" },
  { value: "url", label: "URL" },
  { value: "image", label: "Gambar (URL)" },
  { value: "video", label: "Video (URL)" },
];

export function ContentsPage() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Content | null>(null);
  const [deleting, setDeleting] = useState<Content | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const contentsQuery = useQuery({
    queryKey: ["contents"],
    queryFn: () => api.get<Content[]>("/api/contents"),
  });

  const saveMutation = useMutation({
    mutationFn: async (values: CreateContent | UpdateContent) => {
      if (editing) return api.patch<Content>(`/api/contents/${editing.id}`, values);
      return api.post<Content>("/api/contents", values);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contents"] });
      setFormOpen(false);
      setEditing(null);
      setActionError(null);
    },
    onError: (err) => setActionError(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/contents/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contents"] });
      setDeleting(null);
      setActionError(null);
    },
    onError: (err) => setActionError(errorMessage(err)),
  });

  const form = useForm({
    defaultValues: {
      judul: editing?.judul ?? "",
      tipe: (editing?.tipe ?? "text") as ContentType,
      payload: editing?.payload ?? "",
    },
    onSubmit: async ({ value }) => {
      setActionError(null);
      await saveMutation.mutateAsync({
        judul: value.judul.trim(),
        tipe: value.tipe,
        payload: value.payload,
      });
    },
  });

  function openCreate() {
    setEditing(null);
    setActionError(null);
    form.reset({ judul: "", tipe: "text", payload: "" });
    setFormOpen(true);
  }

  function openEdit(content: Content) {
    setEditing(content);
    setActionError(null);
    form.reset({ judul: content.judul, tipe: content.tipe, payload: content.payload });
    setFormOpen(true);
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor("judul", { header: "Judul", cell: (info) => info.getValue() }),
      columnHelper.accessor("tipe", { header: "Tipe", cell: (info) => info.getValue() }),
      columnHelper.accessor("payload", {
        header: "Payload/URL",
        cell: (info) => {
          const v = info.getValue();
          return <span className="block max-w-xs truncate" title={v}>{v}</span>;
        },
      }),
      columnHelper.accessor("createdAt", {
        header: "Dibuat",
        cell: (info) => new Date(info.getValue()).toLocaleString(),
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
    [],
  );

  const table = useReactTable({
    data: contentsQuery.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Contents</CardTitle>
          <Button onClick={openCreate}>Tambah Content</Button>
        </CardHeader>
        <CardContent>
          {contentsQuery.isLoading && <p className="text-sm text-muted-foreground">Memuat...</p>}
          {contentsQuery.isError && (
            <p className="text-sm text-destructive">{errorMessage(contentsQuery.error)}</p>
          )}
          {contentsQuery.isSuccess && (
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
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Belum ada content.
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
        title={editing ? "Ubah Content" : "Tambah Content"}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="judul">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="judul">Judul</Label>
                <Input
                  id="judul"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          </form.Field>
          <form.Field name="tipe">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="tipe">Tipe</Label>
                <select
                  id="tipe"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value as ContentType)}
                >
                  {TIPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}
          </form.Field>
          <form.Field name="payload">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="payload">Payload / URL</Label>
                <textarea
                  id="payload"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Teks untuk tipe teks, atau URL untuk tipe lain"
                  required
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

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)} title="Hapus Content">
        <div className="space-y-4">
          <p className="text-sm">
            Hapus content <strong>{deleting?.judul}</strong>? Tindakan ini tidak dapat dibatalkan.
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
