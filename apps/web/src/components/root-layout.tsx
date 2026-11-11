import { Link, Outlet } from "@tanstack/react-router";
import { clearToken } from "@/lib/auth";
import { Button } from "./ui/button";

export function RootLayout() {
  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main-content">Lewati ke konten</a>
      <aside className="sidebar">
          <Link to="/devices" className="brand"><span className="brand-mark" aria-hidden="true">s</span><span>Signage<span className="brand-subtitle">Control Panel</span></span></Link>
          <p className="nav-label">Workspace</p>
          <nav aria-label="Navigasi utama" className="main-nav">
            <Link
              to="/devices"
              className="nav-item"
              activeProps={{ className: "nav-item is-active", "aria-current": "page" }}
            >
              <span aria-hidden="true">▣</span> Device
            </Link>
            <Link
              to="/contents"
              className="nav-item"
              activeProps={{ className: "nav-item is-active", "aria-current": "page" }}
            >
              <span aria-hidden="true">▤</span> Pustaka konten
            </Link>
          </nav>
          <div className="sidebar-foot"><span className="avatar">A</span><div>Administrator<span className="brand-subtitle">Pengelola signage</span></div><Button variant="ghost" onClick={() => { clearToken(); window.location.assign("/login"); }}>Keluar</Button></div>
      </aside>
      <div className="workspace">
      <header className="workspace-bar"><span>Workspace / <strong>Pengelolaan signage</strong></span><span className="workspace-tag">Admin</span></header>
      <main id="main-content" className="workspace-main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="workspace-footer">Signage Control Panel <span>Device · Konten · Playlist</span></footer>
      </div>
    </div>
  );
}
