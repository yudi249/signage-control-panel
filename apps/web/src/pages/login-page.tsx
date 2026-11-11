import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { adminLoginResponseSchema } from "@signage/shared";
import { api, ApiError } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Terjadi kesalahan";
}

export function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { username: "", password: "" },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const res = await api.post<unknown>("/api/auth/login", {
          username: value.username,
          password: value.password,
        });
        const parsed = adminLoginResponseSchema.parse(res);
        setToken(parsed.token);
        await router.navigate({ to: "/devices" });
      } catch (err) {
        setError(errorMessage(err));
      }
    },
  });

  return (
    <div className="login-layout">
      <div className="login-intro"><span className="brand"><span className="brand-mark">s</span> Signage Control Panel</span><div><p className="eyebrow">Workspace administrator</p><h1>Konten yang tepat.<br />Di setiap layar.</h1><p>Kelola Device, susun playlist, dan pantau koneksi layar dari satu tempat.</p><div className="login-capabilities"><span>Device & presence</span><span>Pustaka konten</span><span>Playlist & Push</span></div></div><p>Signage Control Panel</p></div>
      <div className="login-form-area"><Card className="w-full max-w-sm">
        <CardHeader>
          <p className="eyebrow">Akses administrator</p><CardTitle>Masuk ke workspace</CardTitle><p className="text-sm text-muted-foreground">Gunakan akun Admin untuk mengelola tayangan.</p>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.Field name="username">
              {(field) => (
                <div className="space-y-1">
                  <Label htmlFor="username">Nama pengguna</Label>
                  <Input
                    id="username"
                    autoComplete="username"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <div className="space-y-1">
                  <Label htmlFor="password">Kata sandi</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                  />
                </div>
              )}
            </form.Field>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? "Memproses..." : "Masuk"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
