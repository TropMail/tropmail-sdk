import { describe, expect, it } from "vitest";

import { RateLimitError, ServerError } from "../src/index.js";
import { errorResponse, jsonResponse, makeClient, page } from "./helpers.js";

describe("auto pagination", () => {
  it("stops on a short page rather than trusting total", async () => {
    const pages = [page(10, 999), page(10, 999), page(3, 999)];
    const { client, calls } = makeClient((_req, i) => jsonResponse(pages[i]));

    const collected = [];
    for await (const email of client.emails.iterate({ limit: 10 })) {
      collected.push(email);
    }

    expect(collected).toHaveLength(23);
    expect(calls.map((c) => (c.body as { page: number }).page)).toEqual([1, 2, 3]);
  });

  it("stops immediately on an empty page", async () => {
    const { client, calls } = makeClient(() => jsonResponse(page(0, 42)));

    const collected = [];
    for await (const email of client.emails.iterate({ limit: 10 })) {
      collected.push(email);
    }

    expect(collected).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });

  it("pages search results even though total is always zero", async () => {
    const pages = [page(5), page(2)];
    const { client } = makeClient((_req, i) => jsonResponse(pages[i]));

    const collected = [];
    for await (const email of client.emails.searchIterate("invoice", { limit: 5 })) {
      collected.push(email);
    }

    expect(collected).toHaveLength(7);
  });
});

describe("retries", () => {
  it("retries a 429 and then succeeds", async () => {
    const { client, calls } = makeClient(
      (_req, i) =>
        i < 2
          ? errorResponse(429, "Rate limit exceeded", { "Retry-After": "0" })
          : jsonResponse({ id: "m1", email: "a@b.dev" }),
      { maxRetries: 3 },
    );

    const mailbox = await client.mailbox.get();
    expect(calls).toHaveLength(3);
    expect(mailbox.id).toBe("m1");
  });

  it("gives up once the retry budget is spent", async () => {
    const { client, calls } = makeClient(
      () => errorResponse(429, "Rate limit exceeded", { "Retry-After": "0" }),
      { maxRetries: 2 },
    );

    await expect(client.mailbox.get()).rejects.toBeInstanceOf(RateLimitError);
    expect(calls).toHaveLength(3);
  });

  it("never retries a mutation", async () => {
    const { client, calls } = makeClient(() => errorResponse(503, "Database unavailable"), {
      maxRetries: 3,
    });

    await expect(client.emails.favorite("abc")).rejects.toBeInstanceOf(ServerError);
    expect(calls).toHaveLength(1);
  });

  it("never retries a non-retryable status", async () => {
    const { client, calls } = makeClient(() => errorResponse(404, "Email not found"), {
      maxRetries: 3,
    });

    await expect(client.emails.get("abc")).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("retries read-only posts", async () => {
    const { client, calls } = makeClient(
      (_req, i) => (i < 1 ? errorResponse(503, "unavailable") : jsonResponse(page(0))),
      { maxRetries: 2 },
    );

    await client.emails.list();
    expect(calls).toHaveLength(2);
  });

  it("retries the markdown 504 until it converts", async () => {
    const detail = {
      id: "abc",
      timestamp: "2026-01-01T00:00:00Z",
      subject: "s",
      from: { name: "", address: "a@b.dev" },
      to: [],
      cc: [],
      content: "# Heading",
      email_state: "Open",
      status: "Open",
      attachments: [],
      headers: {},
      security: {},
    };
    const { client, calls } = makeClient(
      (_req, i) =>
        i < 2 ? errorResponse(504, "Markdown conversion timed out") : jsonResponse(detail),
      { maxRetries: 3 },
    );

    const result = await client.emails.getMarkdown("abc");
    expect(calls).toHaveLength(3);
    expect(result.content).toBe("# Heading");
  });
});
