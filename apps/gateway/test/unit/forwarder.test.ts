import { describe, expect, it } from "vitest";
import { forwardRequest } from "../../src/proxy/forwarder.js";
import { startFlakyServer } from "../setup/flakyServer.js";

describe("forwardRequest retries (§16.2)", () => {
  it("retries an idempotent GET against a failing upstream up to PROXY_MAX_RETRIES times", async () => {
    const flaky = await startFlakyServer(500);
    try {
      const result = await forwardRequest(flaky.url, "/", "", "GET", {}, undefined);
      expect(result.status).toBe(500);
      expect(result.attempts).toBe(3); // 1 initial + 2 retries (default PROXY_MAX_RETRIES=2)
      expect(flaky.callCount()).toBe(3);
    } finally {
      await flaky.close();
    }
  });

  it("does not retry a POST without an Idempotency-Key", async () => {
    const flaky = await startFlakyServer(500);
    try {
      const result = await forwardRequest(flaky.url, "/", "", "POST", {}, { hello: "world" });
      expect(result.attempts).toBe(1);
      expect(flaky.callCount()).toBe(1);
    } finally {
      await flaky.close();
    }
  });

  it("retries a POST that carries an Idempotency-Key header", async () => {
    const flaky = await startFlakyServer(500);
    try {
      const result = await forwardRequest(flaky.url, "/", "", "POST", { "idempotency-key": "abc-123" }, { a: 1 });
      expect(result.attempts).toBe(3);
      expect(flaky.callCount()).toBe(3);
    } finally {
      await flaky.close();
    }
  });

  it("does not retry a successful response", async () => {
    const flaky = await startFlakyServer(200);
    try {
      const result = await forwardRequest(flaky.url, "/", "", "GET", {}, undefined);
      expect(result.attempts).toBe(1);
      expect(flaky.callCount()).toBe(1);
    } finally {
      await flaky.close();
    }
  });
});
