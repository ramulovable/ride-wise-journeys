// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
        // Browser builds otherwise turn `events` into an empty stub, breaking the LiveAvatar SDK.
        name: "liveavatar-events-shim",
        enforce: "pre",
        resolveId(id: string, importer?: string) {
          if ((id === "events" || id === "node:events") && importer?.includes("liveavatar-web-sdk")) {
            return fileURLToPath(new URL("./node_modules/events/events.js", import.meta.url));
          }
          return null;
        },
      },
    ],
  },
});
