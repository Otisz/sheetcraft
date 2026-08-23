import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Sheetcraft",
      },
      // Shipped alongside the manifest as a belt-and-braces trigger for Add to
      // Home Screen. Precedence when both are present is undocumented; harmless.
      {
        name: "apple-mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "theme-color",
        content: "#0a0a0a",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // `display: standalone` in here is the only genuinely load-bearing field
      // for iOS: it is what makes Add to Home Screen install a web app rather
      // than a bookmark, and only a web app is exempt from WebKit's 7-day
      // deletion of script-writable storage. **No service worker ships** — one
      // is required by neither iOS nor Chromium for installability, and offline
      // mode is out of scope. See CONTEXT.md § Installed.
      {
        rel: "manifest",
        href: "/manifest.webmanifest",
      },
      // Takes precedence over the manifest icons on iOS, per WebKit — so this
      // is required rather than legacy cruft. The manifest's 192/512 remain for
      // Chromium's install criteria.
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        href: "/icon-192.png",
        type: "image/png",
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
