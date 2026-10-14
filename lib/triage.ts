// Folds reviewer prose into one verdict. Reviewers write markdown files containing lines like
//   Finding: P1 action=auto-fix src/app.ts:42 - total ignores the discount
//   Merge verdict: BLOCK
// No model emits JSON; this module only greps those lines.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { taskDir } from "./home.ts";

export interface Finding {
  reviewer: string;
  severity: "P0" | "P1" | "P2";
  action: "auto-fix" | "ask-user";
  where: string;
  text: string;
}

export interface Verdict {
  round: number;
  reviewers: string[];
  findings: Finding[];
  blocking: string[]; // reviewers whose merge verdict is BLOCK
  missing: string[]; // reviewers without a merge verdict line
  outcome: "clean" | "fix" | "ask-user";
}

const FINDING_RE = /^\s*[-*]?\s*Finding:\s*(P[012])\s+action=(auto-fix|ask-user)\s+(\S+)\s+[-–]\s+(.+)$/;
const VERDICT_RE = /^\s*[-*]?\s*Merge verdict:\s*(BLOCK|OK with notes|OK)\b/i;

export const roundDir = (id: string, round: number) => join(taskDir(id), "review", `round-${round}`);

export function triage(id: string, round: number): Verdict {
  const dir = roundDir(id, round);
  if (!existsSync(dir)) throw new Error(`no reviews in ${dir}`);
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "verdict.md").sort();
  if (!files.length) throw new Error(`no reviewer files in ${dir}`);
  const v: Verdict = { round, reviewers: [], findings: [], blocking: [], missing: [], outcome: "clean" };
  for (const f of files) {
    const reviewer = f.replace(/\.md$/, "");
    v.reviewers.push(reviewer);
    let verdict: string | null = null;
    for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
      const m = FINDING_RE.exec(line);
      if (m) v.findings.push({ reviewer, severity: m[1] as Finding["severity"], action: m[2] as Finding["action"], where: m[3], text: m[4].trim() });
      const vm = VERDICT_RE.exec(line);
      if (vm) verdict = vm[1].toUpperCase();
    }
    if (!verdict) v.missing.push(reviewer);
    else if (verdict === "BLOCK") v.blocking.push(reviewer);
  }
  // P2 findings are notes; P0/P1 and any BLOCK need another round. A missing verdict counts as BLOCK.
  if (v.findings.some((f) => f.action === "ask-user")) v.outcome = "ask-user";
  else if (v.findings.some((f) => f.severity !== "P2") || v.blocking.length || v.missing.length) v.outcome = "fix";
  writeFileSync(join(dir, "verdict.md"), renderVerdict(v));
  return v;
}

export function renderVerdict(v: Verdict): string {
  const line = (f: Finding) => `- ${f.severity} ${f.action} ${f.where} - ${f.text} (${f.reviewer})`;
  const group = (pred: (f: Finding) => boolean) => v.findings.filter(pred).map(line).join("\n") || "- none";
  return `# Review round ${v.round}: ${v.outcome}

Reviewers: ${v.reviewers.join(", ")}
Blocking: ${v.blocking.join(", ") || "none"}
Missing verdict: ${v.missing.join(", ") || "none"}

## Ask the captain
${group((f) => f.action === "ask-user")}

## Fix now
${group((f) => f.action === "auto-fix" && f.severity !== "P2")}

## Notes (P2)
${group((f) => f.action === "auto-fix" && f.severity === "P2")}
`;
}
