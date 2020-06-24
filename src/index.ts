import * as core from "@actions/core";
import { exec } from "@actions/exec";

import { CloudWatchLogsConsumer } from "./consumer";

(async () => {
  const region = core.getInput("region") || process.env.AWS_REGION || "us-east-1";
  const group = core.getInput("group");
  const stream = core.getInput("stream");
  const run = core.getInput("run");

  const consumer = new CloudWatchLogsConsumer({
    region,
    group,
    stream,
  });

  await exec(run, undefined, {
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
