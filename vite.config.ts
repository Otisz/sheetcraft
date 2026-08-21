import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  base: "/",
  plugins: [
    devtools(),
    tailwindcss({
      optimize: true,
    }),
    tanstackStart({
      router: {
        quoteStyle: "double",
        semicolons: true,
      },
      // Static pages are prerendered; everything under /dnd is client-only and
      // ships via the SPA shell mask. See docs/adr/0003-spa-shell-and-prerender.md.
      spa: {
        enabled: true,
        maskPath: "/dnd",
      },
      pages: [{ path: "/" }, { path: "/games" }],
      prerender: {
        enabled: true,
        crawlLinks: false,
        // Route autodiscovery finds /dnd/ and would SSR the client-only tree.
        // Drop those, but keep the mask itself: the SPA shell is appended to
        // `pages` as an ordinary page at exactly `/dnd` and rendered by this
        // same pass, so a blanket startsWith("/dnd") filter silently drops the
        // shell and the SPA route ships nothing at all.
        filter: (page) => page.path === "/dnd" || !page.path.startsWith("/dnd"),
      },
    }),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    ws: { clientPort: +(process.env.FORWARD_FE_PORT || 3000) },
    watch: { usePolling: true },
  },
});

export default config;
