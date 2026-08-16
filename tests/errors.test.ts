import { describe, expect, it } from "vitest";

import {
  AuthenticationError,
  ConnectionError,
  MarkdownTimeoutError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TierError,
  TropMailError,
  ValidationError,
} from "../src/index.js";
import { errorResponse, MAILBOX_ID, makeClient } from "./helpers.js";

describe("error mapping", () => {
  it.each([
    [400, ValidationError],
    [401, AuthenticationError],
    [403, TierError],
    [404, NotFoundError],
    [500, ServerError],
    [503, ServerError],
  ])("maps HTTP %i", async (status, expected) => {
    const { client } = makeClient(() => errorResponse(status, "boom"));
    await expect(client.mailboxes.get(MAILBOX_ID)).rejects.toBeInstanceOf(expected);
  });

  it("keeps status, message and request id on the error", async () => {
    const { client } = makeClient(() => errorResponse(404, "Email not found"));
    const error = await client.emails.get(MAILBOX_ID, "nope").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    const typed = error as NotFoundError;
    expect(typed.status).toBe(404);
    expect(typed.message).toBe("Email not found");
    expect(typed.requestId).toBe("req-err");
  });

  it("handles the plain-text 404 from unknown routes", async () => {
    const { client } = makeClient(() => new Response("Not Found", { status: 404 }));
    const error = await client.mailboxes.get(MAILBOX_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).message).toBe("Not Found");
  });

  it("exposes retry-after on rate limit errors", async () => {
    const { client } = makeClient(() =>
      errorResponse(429, "Rate limit exceeded", { "Retry-After": "2" }),
    );
    const error = await client.mailboxes.get(MAILBOX_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfter).toBe(2);
  });

  it("uses a dedicated type for the markdown timeout", async () => {
    const { client } = makeClient(() => errorResponse(504, "Markdown conversion timed out"));
    await expect(client.emails.getMarkdown(MAILBOX_ID, "abc")).rejects.toBeInstanceOf(
      MarkdownTimeoutError,
    );
  });

  it("wraps transport failures", async () => {
    const { client } = makeClient(() => {
      throw new Error("network down");
    });
    await expect(client.mailboxes.get(MAILBOX_ID)).rejects.toBeInstanceOf(ConnectionError);
  });

  it("treats success:false as an error even on HTTP 200", async () => {
    const { client } = makeClient(
      () =>
        new Response(
          JSON.stringify({ success: false, message: "nope", data: null, error: "nope" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const error = await client.mailboxes.get(MAILBOX_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TropMailError);
    expect((error as TropMailError).message).toBe("nope");
  });

  it("every error is an instance of the base class", async () => {
    const { client } = makeClient(() => errorResponse(403, "Basic tier"));
    await expect(client.mailboxes.get(MAILBOX_ID)).rejects.toBeInstanceOf(TropMailError);
  });
});

describe("abort", () => {
  it("propagates an aborted signal as a connection error", async () => {
    const controller = new AbortController();
    controller.abort();
    const { client } = makeClient(() => {
      throw new DOMException("Aborted", "AbortError");
    });

    await expect(client.mailboxes.get(MAILBOX_ID, { signal: controller.signal })).rejects.toBeInstanceOf(
      ConnectionError,
    );
  });
});
