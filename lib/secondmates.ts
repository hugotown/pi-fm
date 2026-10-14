// Local secondmates: a persistent second supervisor with its own home and charter, running in its
// own herdr tab. The parent routes work to it through its inbox (task id sm-<name>), and it reports
// back by appending status lines to the parent's sm-<name> log.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, paths, ROOT } from "./home.ts";
import { mustRun, run } from "./exec.ts";
import { writeMeta } from "./meta.ts";

export interface Secondmate {
  name: string;
  scope: string;
  home: string;
}

const registry = () => join(paths().data, "secondmates.md");
const LINE_RE = /^- ([a-z0-9][a-z0-9-]*) - scope: (.*) \(home: ([^;)]+)/;

export function listSecondmates(): Secondmate[] {
  if (!existsSync(registry())) return [];
  return readFileSync(registry(), "utf8")
    .split("\n")
    .map((l) => LINE_RE.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ name: m[1], scope: m[2], home: m[3] }));
}

export function addSecondmate(name: string, scope: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(name)) throw new Error(`invalid secondmate name ${name}`);
  if (listSecondmates().some((s) => s.name === name)) throw new Error(`secondmate ${name} exists`);
  const home = join(paths().home, "secondmates", name);
  ensureDir(home);
  mustRun(join(ROOT, "bin", "pifm"), ["init"], { env: { ...process.env, PIFM_HOME: home } });
  writeFileSync(
    join(home, "data", "charter.md"),
    `# Charter: ${name}

Scope: ${scope}

- You are a pi-fm secondmate. Your parent supervisor's home is ${paths().home}.
- Stay idle until the parent routes work to you. Work only within your scope.
- Report every outcome to the parent by appending a status line to its log:
  PIFM_HOME=${paths().home} ${ROOT}/bin/pifm status sm-${name} <verb> [--key <slug>] "<one line>"
  Use done when a routed request is finished, needs-decision when the captain must decide.
- Your own crew, backlog and holds live in your home (${home}).
`,
  );
  const line = `- ${name} - scope: ${scope.replace(/[()]/g, "")} (home: ${home}; added ${new Date().toISOString().slice(0, 10)})\n`;
  writeFileSync(registry(), (existsSync(registry()) ? readFileSync(registry(), "utf8") : "# Secondmates\n\n") + line);
  writeMeta(`sm-${name}`, { kind: "secondmate", stage: "idle", home });
  return `secondmate ${name} seeded at ${home}`;
}

export function startSecondmate(name: string): string {
  const sm = listSecondmates().find((s) => s.name === name);
  if (!sm) throw new Error(`unknown secondmate ${name}`);
  if (!process.env.HERDR_WORKSPACE_ID) throw new Error("secondmates start in a herdr tab; run the supervisor inside herdr");
  const tab = JSON.parse(mustRun("herdr", ["tab", "create", "--workspace", process.env.HERDR_WORKSPACE_ID, "--cwd", sm.home, "--label", `pifm sm ${name}`, "--no-focus"]));
  const pane: string = tab.result.root_pane.pane_id;
  const env = `PIFM_HOME=${sm.home} PIFM_PARENT_HOME=${paths().home} PIFM_SECONDMATE=${name}`;
  run("herdr", ["pane", "run", pane, `${env} ${join(ROOT, "bin", "pi-fm")}`], { timeoutMs: 15_000 });
  writeMeta(`sm-${name}`, { mechanism: "pane", pane_id: pane, tab_id: tab.result.tab.tab_id, stage: "running" });
  return `secondmate ${name} running in pane ${pane}`;
}
