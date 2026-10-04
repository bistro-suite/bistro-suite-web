import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";

export default {
  targets: [{
    name: "bistro-web-chromium",
    engine: web(),
    app: {
      url: "http://127.0.0.1:0",
      command: {
        executable: "npm",
        args: ["run", "dev", "--", "--host", "127.0.0.1", "--port", "{port}", "--strictPort"],
        env: {
          VITE_ADMIN_DEMO_ENABLED: "true",
          VITE_ADMIN_DEMO_READ_ONLY: "true",
          VITE_ADMIN_DEMO_EMAIL: "demo@example.test",
          VITE_ADMIN_DEMO_PASSWORD: "Demo-Only-Local-2026!",
          VITE_ADMIN_DEMO_MESSAGE: "Puedes explorar el portal, pero el demo no permite guardar cambios.",
        },
        log: ".e2e/logs/vite.log",
      },
    },
  }],
  workers: 1,
} satisfies E2EConfig;
