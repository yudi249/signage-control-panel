import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "@/components/root-layout";
import { ContentsPage } from "@/pages/contents-page";
import { DeviceClientPage } from "@/pages/device-client-page";
import { DevicesPage } from "@/pages/devices-page";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const dashboardLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "dashboard",
  component: RootLayout,
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
  dashboardLayoutRoute.addChildren([indexRoute, devicesRoute, contentsRoute]),
  deviceClientRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
