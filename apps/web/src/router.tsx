import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "@/components/root-layout";
import { isAuthenticated } from "@/lib/auth";
import { ContentsPage } from "@/pages/contents-page";
import { DeviceClientPage } from "@/pages/device-client-page";
import { DevicesPage } from "@/pages/devices-page";
import { LoginPage } from "@/pages/login-page";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

function requireAuth() {
  if (!isAuthenticated()) {
    throw redirect({ to: "/login" });
  }
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
  beforeLoad: () => {
    if (isAuthenticated()) {
      throw redirect({ to: "/devices" });
    }
  },
});

const dashboardLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "dashboard",
  component: RootLayout,
  beforeLoad: () => {
    requireAuth();
  },
});

const indexRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/devices" });
  },
});

const devicesRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/devices",
  component: DevicesPage,
});

const contentsRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/contents",
  component: ContentsPage,
});

const deviceClientRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/device/$id",
  component: DeviceClientPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  dashboardLayoutRoute.addChildren([indexRoute, devicesRoute, contentsRoute]),
  deviceClientRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
