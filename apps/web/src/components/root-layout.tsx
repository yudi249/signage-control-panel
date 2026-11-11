import { Link, Outlet } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const navLink = "rounded-md px-3 py-2 text-sm font-medium transition-colors";

export function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <span className="text-sm font-semibold tracking-wide">Signage Control Panel</span>
          <nav className="flex gap-1">
            <Link
              to="/devices"
              className={navLink}
              activeProps={{ className: cn(navLink, "bg-accent text-accent-foreground") }}
              inactiveProps={{ className: cn(navLink, "text-muted-foreground hover:bg-accent/60") }}
            >
              Devices
            </Link>
            <Link
              to="/contents"
              className={navLink}
              activeProps={{ className: cn(navLink, "bg-accent text-accent-foreground") }}
              inactiveProps={{ className: cn(navLink, "text-muted-foreground hover:bg-accent/60") }}
            >
              Contents
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
