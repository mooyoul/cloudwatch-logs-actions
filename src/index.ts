import * as core from "@actions/core";
import { exec } from "@actions/exec";

import { CloudWatchLogsConsumer } from "./consumer";

const ALLOWED_RETENTION_DAYS = new Set<number>([
  1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653,
]);

type Shell = {
  program: string;
  args: string[];
};

(async () => {
  const region = core.getInput("region") || process.env.AWS_REGION || "us-east-1";
  const group = core.getInput("group");
  const stream = core.getInput("stream");
  const retentionInDays = (() => {
    const raw = core.getInput("retention");
    const parsed = parseInt(raw, 10);

    return ALLOWED_RETENTION_DAYS.has(parsed) ? parsed : undefined;
  })();
  const run = core.getInput("run");
  const shellName = core.getInput("shell") || "sh";

  const shell = getShell(shellName);

  const consumer = new CloudWatchLogsConsumer({
    region,
    group,
    stream,
    retentionInDays,
  });

  await exec(shell.program, shell.args, {
    input: Buffer.from(run, "utf8"),
    silent: true,
    listeners: {
      stdline(line: string) {
        consumer.consume(line).catch(() => { /* swallow error */ });
      },
      errline(line: string) {
        consumer.consume(line).catch(() => { /* swallow error */ });
      },
    },
  });

  await consumer.flush();
})().catch((e) => {
  console.error(e.stack); // tslint:disable-line
  core.setFailed(e.message);
});


function getShell(name: string): Shell {
  const normalizedName = name.toLowerCase();

  switch (normalizedName) {
    case "bash":
      return {
        program: "bash",
        args: ["--noprofile", "--norc", "-eo", "pipefail"],
      };
    default:
      return {
        program: "sh",
        args: ["-e"],
      };
  }
}
