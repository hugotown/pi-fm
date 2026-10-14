import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { appendStatus, formatStatus, openDecisions, parseStatus, readStatus } from "../lib/status.ts";
import { addItem, completeItem, loadBacklog, setHeld, startItem, tagValue } from "../lib/backlog.ts";
import { ack, enqueue, pending } from "../lib/wake.ts";
import { triage } from "../lib/triage.ts";
import { checkTask } from "../lib/brief.ts";
import { blockedCommand, blockedPath, proxyAllowed } from "../lib/guard.ts";
import { readMeta, writeMeta } from "../lib/meta.ts";
import { answer, hold, listHolds } from "../lib/holds.ts";
import { integrate } from "../lib/integrate.ts";
import { assertId, paths } from "../lib/home.ts";

beforeEach(() => {
  process.env.PIFM_HOME = mkdtempSync(join(tmpdir(), "pifm-test-"));
});

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();

test("status lines round-trip and keyed decisions close on resolved", () => {
  const line = formatStatus({ verb: "needs-decision", key: "db", at: 5, text: "which db?\nsqlite or postgres" });
  assert.equal(line, "needs-decision key=db at=5: which db? sqlite or postgres");
  assert.deepEqual(parseStatus(line), { verb: "needs-decision", key: "db", at: 5, text: "which db? sqlite or postgres" });
  assert.equal(parseStatus("nonsense"), null);
  appendStatus("t1", "needs-decision", "which db?", "db");
  appendStatus("t1", "blocked", "no docker", "docker");
  appendStatus("t1", "resolved", "sqlite", "db");
  assert.deepEqual(openDecisions(readStatus("t1")).map((d) => d.key), ["docker"]);
  assert.throws(() => appendStatus("t1", "shouting", "x"));
});

test("backlog moves items through its sections and refuses held starts", () => {
  addItem("a-one", "First", { project: "p", epic: "e" });
  addItem("a-two", "Second", { project: "p", kind: "scout" });
  assert.throws(() => addItem("a-one", "dup", { project: "p" }));
  startItem("a-one");
  setHeld("a-two", "pick a colour (red or blue)");
  assert.throws(() => startItem("a-two"), /held/);
  setHeld("a-two", null);
  completeItem("a-one", "merged https://example/pr/1");
  const b = loadBacklog();
  assert.equal(b["In flight"].length, 0);
  assert.deepEqual(b.Queued.map((i) => i.id), ["a-two"]);
  assert.equal(b.Done[0].done, true);
  assert.match(b.Done[0].line, /\(done \d{4}-\d{2}-\d{2}: merged https:\/\/example\/pr\/1\)$/);
  assert.equal(tagValue(b.Queued[0], "kind"), "scout");
  assert.match(readFileSync(join(paths().data, "backlog.md"), "utf8"), /^# Backlog\n\n## In flight\n\n## Queued\n\n- \[ \] a-two/);
});

test("wake queue dedupes open keys and compacts on ack", () => {
  assert.ok(enqueue("signal", "t:done", "t done"));
  assert.equal(enqueue("signal", "t:done", "again"), null);
  const w2 = enqueue("check", "t:pr", "pr green")!;
  assert.equal(pending().length, 2);
  assert.equal(ack(w2.seq - 1), 1);
  assert.deepEqual(pending().map((w) => w.key), ["t:pr"]);
  ack(w2.seq);
  assert.equal(pending().length, 0);
  assert.equal(enqueue("signal", "t:done", "new episode")!.seq, w2.seq + 1);
});

test("triage folds reviewer prose into an outcome", () => {
  const dir = join(paths().data, "t2", "review", "round-1");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "intent.md"), "Looks fine.\nFinding: P2 action=auto-fix README.md:3 - typo\nMerge verdict: OK with notes\n");
  writeFileSync(join(dir, "tests.md"), "Finding: P1 action=auto-fix src/a.ts:9 - total ignores discount\nMerge verdict: BLOCK\n");
  writeFileSync(join(dir, "simplicity-security.md"), "nothing to add\n");
  const v = triage("t2", 1);
  assert.equal(v.outcome, "fix");
  assert.deepEqual(v.blocking, ["tests"]);
  assert.deepEqual(v.missing, ["simplicity-security"]);
  writeFileSync(join(dir, "simplicity-security.md"), "Finding: P1 action=ask-user src/pay.ts:1 - charges real cards\nMerge verdict: BLOCK\n");
  assert.equal(triage("t2", 1).outcome, "ask-user");
  writeFileSync(join(dir, "tests.md"), "Merge verdict: OK\n");
  writeFileSync(join(dir, "simplicity-security.md"), "Merge verdict: OK\n");
  assert.equal(triage("t2", 1).outcome, "clean");
  assert.match(readFileSync(join(dir, "verdict.md"), "utf8"), /# Review round 1: clean/);
});

test("task files need intent and spec without placeholders", () => {
  assert.deepEqual(checkTask("## Intent\nBuild it\n\n## Spec\nDo X\n"), []);
  assert.equal(checkTask("## Intent\n\n## Spec\nDo X\n").length, 1);
  assert.equal(checkTask("## Intent\nA\n## Spec\nTODO\n").length, 1);
});

test("guard keeps the supervisor out of project code", () => {
  const p = paths();
  assert.equal(blockedPath("data/x/task.md", p.home), null);
  assert.ok(blockedPath(join(p.projects, "app", "a.ts"), p.home));
  assert.ok(blockedPath(join(p.worktrees, "t", "a.ts"), p.home));
  assert.ok(blockedPath("/etc/passwd", p.home));
  assert.ok(blockedCommand("git -C projects/app commit -m x"));
  assert.ok(blockedCommand("gh pr merge 3 --squash"));
  assert.ok(blockedCommand(`rm -rf ${p.worktrees}/t`));
  assert.equal(blockedCommand("git log --oneline -5"), null);
  assert.equal(blockedCommand("pifm ship t"), null);
  assert.equal(blockedCommand("gh pr view 3"), null);
});

test("the form proxy only lets the token page through with the token", () => {
  assert.equal(proxyAllowed("/", "tok"), false);
  assert.equal(proxyAllowed("/?session=bad", "tok"), false);
  assert.equal(proxyAllowed("/?session=tok", "tok"), true);
  assert.equal(proxyAllowed("/script.js", "tok"), true);
  assert.equal(proxyAllowed("/submit", "tok"), true);
});

test("meta and holds keep one-line facts and the captain's exact words", () => {
  writeMeta("t3", { project: "p", stage: "building" });
  writeMeta("t3", { stage: "" });
  assert.deepEqual(readMeta("t3"), { project: "p" });
  assert.throws(() => writeMeta("t3", { x: "a\nb" }));
  addItem("t3", "Third", { project: "p" });
  hold("t3", "Merge the PR?", { key: "merge" });
  assert.match(loadBacklog().Queued[0].line, /\(held: Merge the PR\?\)/);
  answer("t3", "Yes, merge it.");
  assert.equal(listHolds().length, 0);
  assert.doesNotMatch(loadBacklog().Queued[0].line, /held/);
  assert.match(readFileSync(join(paths().data, "t3", "decisions.md"), "utf8"), /Captain: Yes, merge it\./);
  assert.equal(readStatus("t3").at(-1)?.verb, "resolved");
});

test("ids are safe directory and branch names", () => {
  assert.equal(assertId("kiosk-menu"), "kiosk-menu");
  for (const bad of ["../x", "Kiosk", "captain", "a b", ""]) assert.throws(() => assertId(bad));
});

test("integrate commits a pi-subagents patch on the task branch, once", () => {
  const origin = mkdtempSync(join(tmpdir(), "pifm-origin-"));
  sh(origin, "init", "-q", "-b", "main");
  writeFileSync(join(origin, "README.md"), "hi\n");
  sh(origin, "add", ".");
  sh(origin, "commit", "-qm", "init");
  const clone = join(paths().projects, "app");
  mkdirSync(paths().projects, { recursive: true });
  execFileSync("git", ["clone", "-q", origin, clone]);
  const base = sh(clone, "rev-parse", "HEAD");
  const patch = join(paths().home, "p.patch");
  writeFileSync(patch, "diff --git a/a.txt b/a.txt\nnew file mode 100644\nindex 0000000..ce01362\n--- /dev/null\n+++ b/a.txt\n@@ -0,0 +1 @@\n+hello\n");
  const manifest = join(paths().home, "h.json");
  writeFileSync(manifest, JSON.stringify({ runId: "r1", groups: [{ baseCommit: base, children: [{ status: "completed", patch: { path: patch, changed: true } }] }] }));
  writeMeta("t4", { project: "app", run_id: "r1" });
  mkdirSync(join(paths().data, "t4"), { recursive: true });
  writeFileSync(join(paths().data, "t4", "report.md"), "Add a greeting file\n\n## Changes\n");
  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = "t";
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = "t@t";
  const r = integrate("t4", manifest);
  const wt = readMeta("t4").worktree;
  assert.ok(existsSync(join(wt, "a.txt")));
  assert.equal(sh(wt, "log", "-1", "--format=%s"), "Add a greeting file");
  assert.equal(sh(wt, "rev-parse", "--abbrev-ref", "HEAD"), "pifm/t4");
  assert.equal(readMeta("t4").head, r.head);
  assert.throws(() => integrate("t4", manifest), /already integrated/);
});
