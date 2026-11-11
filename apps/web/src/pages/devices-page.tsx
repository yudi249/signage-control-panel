import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DevicesPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Halaman Devices. Daftar, form, dan penghapusan Device akan ditambahkan pada tiket 02.
      </CardContent>
    </Card>
  );
}
