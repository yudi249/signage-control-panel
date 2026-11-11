import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ContentsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contents</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Halaman Contents. Daftar, form, dan penghapusan Content akan ditambahkan pada tiket 03.
      </CardContent>
    </Card>
  );
}
