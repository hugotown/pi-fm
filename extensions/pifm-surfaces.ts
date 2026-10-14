// Publishes pi-interview and pi-design-deck forms beyond loopback. Both servers bind 127.0.0.1 and
// reject foreign Host headers, so each live session gets a small proxy that rewrites Host and
// insists on the session token. The public URL is the Coder port subdomain (from VSCODE_PROXY_URI)
// and, when tailscale is installed, a Tailscale Serve handler on a free HTTPS port.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import http from "node:http";
import net from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { hasCommand, run } from "../lib/exec.ts";
import { logEvent } from "../lib/events.ts";
import { isPrimary, proxyAllowed } from "../lib/guard.ts";

const SESSION_FILES: Record<string, string> = {
  interview: join(homedir(), ".pi", "interview-sessions.json"),
  deck: join(homedir(), ".pi", "deck-sessions.json"),
};
const PROXY_BASE_PORT = 18377;

interface Surface {
  kind: string;
  upstream: URL;
  server: http.Server;
  port: number;
  servePort?: number;
}

function portFree(port: number): Promise<boolean> {
  return new Promise((res) => {
    const probe = net.createServer().once("error", () => res(false));
    probe.once("listening", () => probe.close(() => res(true))).listen(port, "127.0.0.1");
  });
}

async function freePort(from: number): Promise<number> {
  for (let p = from; p < from + 200; p++) if (await portFree(p)) return p;
  throw new Error(`no free port from ${from}`);
}

function startProxy(upstream: URL, token: string, port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (!proxyAllowed(req.url ?? "/", token)) {
      res.writeHead(403, { "Content-Type": "text/plain" }).end("pi-fm: session token required");
      return;
    }
    const fwd = http.request(
      { host: "127.0.0.1", port: upstream.port, method: req.method, path: req.url, headers: { ...req.headers, host: `127.0.0.1:${upstream.port}` } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    fwd.on("error", () => res.headersSent || res.writeHead(502).end("upstream unavailable"));
    req.pipe(fwd);
  });
  server.listen(port, "127.0.0.1");
  return server;
}

function tailscaleServe(proxyPort: number): { servePort: number; url: string } | null {
  if (!hasCommand("tailscale")) return null;
  const status = run("tailscale", ["status", "--json"], { timeoutMs: 10_000 });
  const serve = run("tailscale", ["serve", "status", "--json"], { timeoutMs: 10_000 });
  if (status.code !== 0) return null;
  const dns = String(JSON.parse(status.stdout).Self?.DNSName ?? "").replace(/\.$/, "");
  const used = serve.stdout;
  const listening = (p: number) => run("bash", ["-c", `ss -ltnH "( sport = :${p} )" | grep -q .`], { timeoutMs: 5_000 }).code === 0;
  const candidates = [443, ...Array.from({ length: 50 }, (_, i) => 8443 + i)];
  const servePort = candidates.find((p) => !listening(p) && !used.includes(`:${p}"`));
  if (!dns || !servePort) return null;
  if (run("tailscale", ["serve", "--bg", `--https=${servePort}`, `http://127.0.0.1:${proxyPort}`], { timeoutMs: 20_000 }).code !== 0) return null;
  return { servePort, url: `https://${dns}${servePort === 443 ? "" : `:${servePort}`}` };
}

export default function (pi: ExtensionAPI) {
  if (!isPrimary()) return;
  const live = new Map<string, Surface>();
  let timer: NodeJS.Timeout | undefined;

  async function sync(ctx: ExtensionContext): Promise<void> {
    const seen = new Set<string>();
    for (const [kind, file] of Object.entries(SESSION_FILES)) {
      if (!existsSync(file)) continue;
      let sessions: { id: string; url: string; cwd: string }[] = [];
      try {
        sessions = JSON.parse(readFileSync(file, "utf8")).sessions ?? [];
      } catch {
        continue;
      }
      for (const s of sessions) {
        if (s.cwd !== ctx.cwd) continue; // only this supervisor's own forms
        const key = `${kind}:${s.id}`;
        seen.add(key);
        if (live.has(key)) continue;
        const upstream = new URL(s.url);
        const token = upstream.searchParams.get("session");
        if (!token) continue;
        const port = await freePort(PROXY_BASE_PORT);
        const server = startProxy(upstream, token, port);
        const surface: Surface = { kind, upstream, server, port };
        live.set(key, surface);
        const links = [`local=${s.url}`];
        const coder = process.env.VSCODE_PROXY_URI;
        if (coder?.includes("{{port}}")) links.push(`coder=${coder.replace("{{port}}", String(port))}/?session=${token}`);
        const ts = tailscaleServe(port);
        if (ts) {
          surface.servePort = ts.servePort;
          links.push(`tailscale=${ts.url}/?session=${token}`);
        }
        logEvent("surface", `kind=${kind} id=${s.id} ${links.join(" ")}`);
        ctx.ui.notify(`${kind} form ready:\n${links.join("\n")}`, "info");
      }
    }
    for (const [key, surface] of live) {
      if (seen.has(key)) continue;
      surface.server.close();
      if (surface.servePort) run("tailscale", ["serve", `--https=${surface.servePort}`, "off"], { timeoutMs: 20_000 });
      live.delete(key);
      logEvent("surface", `closed ${key}`);
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    timer = setInterval(() => void sync(ctx).catch((e) => logEvent("surface-error", String(e))), 2_000);
  });

  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
    for (const s of live.values()) {
      s.server.close();
      if (s.servePort) run("tailscale", ["serve", `--https=${s.servePort}`, "off"], { timeoutMs: 20_000 });
    }
    live.clear();
  });
}
