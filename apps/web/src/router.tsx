import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "@/components/root-layout";
import { ContentsPage } from "@/pages/contents-page";
import { DevicesPage } from "@/pages/devices-page";

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/devices" });
  },
});

const devicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/devices",
  component: DevicesPage,
});

const contentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contents",
  component: ContentsPage,
});

const routeTree = rootRoute.addChildren([indexRoute, devicesRoute, contentsRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
