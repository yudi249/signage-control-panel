import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import type { Content, ContentType, CreateContent, UpdateContent } from "@signage/shared";
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES } from "@signage/shared";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContentPreview, contentTypeLabels as typeLabels } from "@/components/content-preview";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Terjadi kesalahan";
}

const TIPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: "text", label: "Teks" },
  { value: "url", label: "URL" },
  { value: "image", label: "Gambar (URL)" },
  { value: "video", label: "Video (URL)" },
];

export function ContentsPage() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Content | null>(null);
  const [deleting, setDeleting] = useState<Content | null>(null);
  const [viewing, setViewing] = useState<Content | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadJudul, setUploadJudul] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

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
      setNotice("Konten berhasil disimpan.");
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

  const uploadMutation = useMutation({
    mutationFn: async ({ judul, file }: { judul: string; file: File }) => {
      const form = new FormData();
      form.append("judul", judul);
      form.append("file", file);
      return api.postForm<Content>("/api/contents/upload", form);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contents"] });
      setUploadJudul("");
      setUploadFile(null);
      setUploadError(null);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      setUploadOpen(false);
      setNotice("File berhasil diunggah. Konten siap ditambahkan ke playlist.");
    },
    onError: (err) => setUploadError(errorMessage(err)),
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

  function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadError(null);
    const judul = uploadJudul.trim();
    if (!judul) {
      setUploadError("Judul wajib diisi.");
      return;
    }
    if (!uploadFile) {
      setUploadError("Pilih file gambar atau video untuk diunggah.");
      return;
    }
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(uploadFile.type as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number])) {
      setUploadError("Tipe file tidak didukung. Gunakan gambar (jpeg, png, webp, gif) atau video (mp4, webm).");
      return;
    }
    if (uploadFile.size > MAX_UPLOAD_SIZE_BYTES) {
      setUploadError("Ukuran file melebihi batas 50 MB.");
      return;
    }
    uploadMutation.mutate({ judul, file: uploadFile });
  }

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

  const filteredContents = useMemo(() => (contentsQuery.data ?? []).filter((content) => content.judul.toLowerCase().includes(search.toLowerCase()) && (typeFilter === "all" || content.tipe === typeFilter)), [contentsQuery.data, search, typeFilter]);

  return (
    <div className="page-stack">
      <div className="page-heading"><div><p className="eyebrow">Materi tayangan</p><h1>Pustaka konten</h1><p>Simpan materi sekali, gunakan di playlist berbagai Device.</p></div><div className="heading-actions"><Button variant="outline" onClick={openCreate}>Tambah Teks/URL</Button><Button onClick={() => { setUploadError(null); setUploadOpen(true); }}><span aria-hidden="true">↑</span> Unggah file</Button></div></div>
      {notice && <p className="success-notice" role="status">{notice}</p>}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen} title="Unggah gambar atau video">
      <Card>
        <CardHeader className="space-y-1">
          <p className="text-sm text-muted-foreground">
            JPEG, PNG, WebP, GIF, MP4, atau WebM. Maksimal 50 MB per file.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submitUpload}>
            <div className="space-y-1">
              <Label htmlFor="upload-judul">Judul</Label>
              <Input
                id="upload-judul"
                value={uploadJudul}
                onChange={(e) => setUploadJudul(e.target.value)}
                placeholder="Nama materi tayangan"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="upload-file">File gambar/video</Label>
              <Input
                id="upload-file"
                ref={uploadInputRef}
                type="file"
                accept={ALLOWED_UPLOAD_MIME_TYPES.join(",")}
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? "Mengunggah..." : "Unggah"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      </Dialog>

      <Card>
        <CardHeader className="list-toolbar">
          <CardTitle>Semua konten <span className="count-label">{contentsQuery.data?.length ?? "—"}</span></CardTitle>
          <div className="toolbar-filters"><Input aria-label="Cari konten" placeholder="Cari judul konten…" value={search} onChange={(e) => setSearch(e.target.value)} /><select aria-label="Filter jenis konten" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">Semua jenis</option>{TIPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label.replace(" (URL)", "")}</option>)}</select></div>
        </CardHeader>
        <CardContent>
          {contentsQuery.isLoading && <p className="text-sm text-muted-foreground">Memuat...</p>}
          {contentsQuery.isError && (
            <p className="text-sm text-destructive">{errorMessage(contentsQuery.error)}</p>
          )}
          {contentsQuery.isSuccess && (
            filteredContents.length === 0 ? <div className="empty-state"><strong>{contentsQuery.data?.length ? "Konten tidak ditemukan" : "Siapkan materi tayangan pertama"}</strong><p>{contentsQuery.data?.length ? "Coba judul atau jenis konten lain." : "Unggah gambar atau video, atau tambahkan teks dan tautan web."}</p></div> :
            <div className="content-gallery">
              {filteredContents.map((content) => <article className="gallery-card" key={content.id}>
                <div className={`gallery-preview preview-${content.tipe}`}><ContentPreview key={`${content.id}-${content.payload}`} content={content} /></div>
                <div className="gallery-card-info"><div className="gallery-card-title"><h3 title={content.judul}>{content.judul}</h3><div className="gallery-actions" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuId((current) => current === content.id ? null : current); }} onKeyDown={(event) => { if (event.key === "Escape") { setMenuId(null); event.currentTarget.querySelector('button')?.focus(); } }}>
                  <button type="button" className="gallery-menu-button" aria-label={`Aksi ${content.judul}`} aria-expanded={menuId === content.id} onClick={() => setMenuId(menuId === content.id ? null : content.id)}>•••</button>
                  {menuId === content.id && <div className="gallery-action-list"><button type="button" onClick={() => { setMenuId(null); setViewing(content); }}>Lihat detail</button><button type="button" onClick={() => { setMenuId(null); openEdit(content); }}>Ubah konten</button><button type="button" className="delete-action" onClick={() => { setMenuId(null); setActionError(null); setDeleting(content); }}>Hapus konten</button></div>}
                </div></div><div className="gallery-card-meta"><span className="type-badge">{typeLabels[content.tipe]}</span><time dateTime={content.createdAt}>{new Date(content.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</time></div></div>
              </article>)}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)} title="Detail konten">
        {viewing && <div className="space-y-4"><div className={`gallery-preview detail-preview preview-${viewing.tipe}`}><ContentPreview key={`${viewing.id}-${viewing.payload}`} content={viewing} detail /></div><dl className="content-detail"><div><dt>Judul</dt><dd>{viewing.judul}</dd></div><div><dt>Jenis</dt><dd>{typeLabels[viewing.tipe]}</dd></div><div><dt>Dibuat</dt><dd>{new Date(viewing.createdAt).toLocaleString("id-ID")}</dd></div>{viewing.tipe !== "text" && <div><dt>URL sumber</dt><dd>{viewing.payload}</dd></div>}</dl><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setViewing(null)}>Tutup detail</Button><Button onClick={() => { setViewing(null); openEdit(viewing); }}>Ubah konten</Button></div></div>}
      </Dialog>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        title={editing ? "Ubah konten" : "Tambah Teks/URL"}
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
                <Label htmlFor="payload">Isi teks atau URL konten</Label>
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
