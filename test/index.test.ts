import * as sinon from "sinon";
import { sandbox, stubAWSAPI } from "./helper";

import * as CloudWatchLogs from "aws-sdk/clients/cloudwatchlogs";

import { CloudWatchLogsConsumer } from "../src/consumer";

describe("cloudwatch-logs-actions", () => {
  it("should work", async () => {
    const fakeTimer = sandbox.useFakeTimers(1000);

    const createLogGroupFake = sinon.fake.resolves({});
    stubAWSAPI(CloudWatchLogs, "createLogGroup", createLogGroupFake);

    const putRetentionPolicyFake = sinon.fake.resolves({});
    stubAWSAPI(CloudWatchLogs, "putRetentionPolicy", putRetentionPolicyFake);

    const createLogStreamFake = sinon.fake.resolves({});
    stubAWSAPI(CloudWatchLogs, "createLogStream", createLogStreamFake);

    const putLogEventsFake = sinon.fake.resolves({ nextSequenceToken: "token" });
    stubAWSAPI(CloudWatchLogs, "putLogEvents", putLogEventsFake);

    const res = new CloudWatchLogsConsumer({
      region: "us-east-1",
      group: "group-name",
      stream: "stream-name",
      retentionInDays: 7,
    });

    await res.consume("foo");
    expect(createLogGroupFake.callCount).toEqual(0);
    expect(putRetentionPolicyFake.callCount).toEqual(0);
    expect(createLogStreamFake.callCount).toEqual(0);
    expect(putLogEventsFake.callCount).toEqual(0);

    fakeTimer.tick(60000);

    await res.flush();
    expect(createLogGroupFake.callCount).toEqual(1);
    expect(createLogGroupFake.firstCall.args).toEqual([{
      logGroupName: "group-name",
    }]);

    expect(putRetentionPolicyFake.callCount).toEqual(1);
    expect(putRetentionPolicyFake.firstCall.args).toEqual([{
      logGroupName: "group-name",
      retentionInDays: 7,
    }]);

    expect(createLogStreamFake.callCount).toEqual(1);
    expect(createLogStreamFake.firstCall.args).toEqual([{
      logGroupName: "group-name",
      logStreamName: "stream-name",
    }]);
    expect(putLogEventsFake.callCount).toEqual(1);
    expect(putLogEventsFake.firstCall.args).toEqual([{
      logGroupName: "group-name",
      logStreamName: "stream-name",
      logEvents: [{
        message: "foo",
        timestamp: 1000,
      }],
    }]);

    await res.flush();
    await res.flush();
    await res.flush();

    expect(createLogGroupFake.callCount).toEqual(1);
    expect(putRetentionPolicyFake.callCount).toEqual(1);
    expect(createLogStreamFake.callCount).toEqual(1);
    expect(putLogEventsFake.callCount).toEqual(1);

    await res.consume(""); // empty line
    await res.flush();

    expect(createLogGroupFake.callCount).toEqual(1);
    expect(putRetentionPolicyFake.callCount).toEqual(1);
    expect(createLogStreamFake.callCount).toEqual(1);
    expect(putLogEventsFake.callCount).toEqual(1);

    await res.consume("bar");

    fakeTimer.tick(60000);

    await res.consume("baz");

    await res.flush();

    expect(createLogGroupFake.callCount).toEqual(1);
    expect(putRetentionPolicyFake.callCount).toEqual(1);
    expect(createLogStreamFake.callCount).toEqual(1);

    expect(putLogEventsFake.callCount).toEqual(2);
    expect(putLogEventsFake.secondCall.args).toEqual([{
      logGroupName: "group-name",
      logStreamName: "stream-name",
      logEvents: [{
        message: "bar",
        timestamp: 61000,
      }, {
        message: "baz",
        timestamp: 121000,
      }],
      sequenceToken: "token",
    }]);
  });
});
