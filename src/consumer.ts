import { Sema } from "async-sema";
import * as CloudWatchLogs from "aws-sdk/clients/cloudwatchlogs";

export type CloudWatchLogsConsumerOptions = {
  region: string;
  group: string;
  stream: string;
};

const MAX_RECORDS = 5000;
const MAX_SIZE = 1024 * 800; // 800 KB
const MAX_DELAY = 5000; // 5 sec

export class CloudWatchLogsConsumer {
  private readonly cwlogs: CloudWatchLogs;
  private readonly group: string;
  private readonly stream: string;

  private readonly sema = new Sema(1, { capacity: 512 });
  private flushedAt: number = Date.now();
  private initialized = false;

  private buffer: CloudWatchLogs.InputLogEvent[] = [];
  private bufferSize: number = 0;

  public constructor(options: CloudWatchLogsConsumerOptions) {
    this.cwlogs = new CloudWatchLogs({ region: options.region });
    this.group = options.group;
    this.stream = options.stream;
  }

  public async consume(line: string) {
    this.queue(line);

    if (this.shouldFlush()) {
      await this.flush();
    }
  }

  public async flush() {
    const events = this.buffer;
    this.buffer = [];
    this.bufferSize = 0;

    await this.sema.acquire();

    try {
      await this.prepareStream();
      await this.cwlogs.putLogEvents({
        logGroupName: this.group,
        logStreamName: this.stream,
        logEvents: events,
      }).promise();

      this.flushedAt = Date.now();
    } finally {
      this.sema.release();
    }
  }

  private async prepareStream() {
    if (!this.initialized) {
      this.initialized = true;

      await this.cwlogs
        .createLogGroup({
          logGroupName: this.group,
        })
        .promise()
        .catch((e) => e.name === "ResourceAlreadyExistsException" ? Promise.resolve() : Promise.reject(e));

      await this.cwlogs
        .createLogStream({
          logGroupName: this.group,
          logStreamName: this.stream,
        })
        .promise()
        .catch((e) => e.name === "ResourceAlreadyExistsException" ? Promise.resolve() : Promise.reject(e));
    }
  }

  private shouldFlush() {
    if (this.buffer.length > MAX_RECORDS) {
      return true;
    }

    if (this.bufferSize > MAX_SIZE) {
      return true;
    }

    return Date.now() - this.flushedAt > MAX_DELAY;
  }

  private queue(line: string) {
    const size = Buffer.byteLength(line) + 26;

    this.buffer.push({
      message: line,
      timestamp: Date.now(),
    });
    this.bufferSize += size;
  }
}
