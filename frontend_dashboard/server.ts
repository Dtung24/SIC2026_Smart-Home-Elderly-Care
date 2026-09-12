import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import os from "os";

const app = express();
const PORT = Number(process.env.PORT) || 5173;

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }

  return "localhost";
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");

    app.use(express.static(distPath));

    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const ip = getLocalIp();

    console.log("ElderHome AI Frontend running on:");
    console.log(`  > Local:   http://localhost:${PORT}`);
    console.log(`  > Network: http://${ip}:${PORT}`);
    console.log("  > Backend API: port 3000");
  });
}

startServer().catch((error) => {
  console.error("Failed to start frontend server:", error);
  process.exit(1);
});
