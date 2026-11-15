import assert from "node:assert/strict";
import test from "node:test";
import { runExternalTask } from "../src/lib/work-queue";

test("single-flight coalesces identical concurrent upstream work", async () => {
  let calls = 0;
  const operation = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "ok";
  };
  const key = `test-${Date.now()}`;
  const [first, second] = await Promise.all([
    runExternalTask(key, operation),
    runExternalTask(key, operation),
  ]);
  assert.equal(first, "ok");
  assert.equal(second, "ok");
  assert.equal(calls, 1);
});
