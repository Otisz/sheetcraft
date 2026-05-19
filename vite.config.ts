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
