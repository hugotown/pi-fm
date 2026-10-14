// pi-subagents workflow: run the review angles in parallel and return their prose between markers.
// args.tasks: [{ key, agent, task, cwd, model? }]
const results = await runs.all(
  args.tasks.map((t) => ({
    key: t.key,
    label: `review ${t.key}`,
    agent: t.agent,
    task: t.task,
    cwd: t.cwd,
    ...(t.model ? { model: t.model } : {}),
  })),
);
return results
  .map((r, i) => `=== REVIEW ${args.tasks[i].key} ===\n${r.output ?? ""}\n=== END ${args.tasks[i].key} ===`)
  .join("\n");
