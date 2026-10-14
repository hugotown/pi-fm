import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { ROOT } from "../lib/home.ts";

test("pifm version command", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const output = execFileSync(join(ROOT, "bin/pifm"), ["version"], { encoding: "utf8" }).trim();
  assert.equal(output, pkg.version);
});
