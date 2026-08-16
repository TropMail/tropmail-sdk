import { describe, expect, it } from "vitest";

import { DEFAULT_BASE_URL, TropMail, ValidationError, VERSION } from "../src/index.js";
import {
  API_KEY,
  BASE_URL,
  EMAIL_DETAIL,
  EMAIL_ITEM,
  MAILBOX_ID,
  jsonResponse,
  makeClient,
} from "./helpers.js";

describe("client construction", () => {
  it("rejects a malformed api key before any request", () => {
    expect(() => new TropMail({ apiKey: "too-short" })).toThrow(ValidationError);
  });

  it("requires an api key", () => {
    expect(() => new TropMail({})).toThrow(ValidationError);
  });

  it("falls back to TROPMAIL_API_KEY when constructed with no options", () => {
    const previous = process.env.TROPMAIL_API_KEY;
    process.env.TROPMAIL_API_KEY = API_KEY;
    try {
      expect(new TropMail().baseUrl).toBe(DEFAULT_BASE_URL);
    } finally {
      if (previous === undefined) {
        delete process.env.TROPMAIL_API_KEY;
      } else {
        process.env.TROPMAIL_API_KEY = previous;
      }
    }
  });

  it("strips a trailing slash from the base url", () => {
    const client = new TropMail({ apiKey: API_KEY, baseUrl: `${BASE_URL}/` });
    expect(client.baseUrl).toBe(BASE_URL);
  });
});

describe("requests", () => {
  it("sends bearer auth and a correlation id", async () => {
    const { client, calls } = makeClient(() => jsonResponse({ id: "m1", email: "a@b.dev" }));
    await client.mailboxes.get(MAILBOX_ID);

    expect(calls[0]?.headers.get("Authorization")).toBe(`Bearer ${API_KEY}`);
    expect(calls[0]?.headers.get("User-Agent")).toBe(`@tropmail/sdk/${VERSION}`);
    expect(calls[0]?.headers.get("X-Request-ID")).toBeTruthy();
    expect(calls[0]?.url.pathname).toBe(`/api/v1/mailboxes/${MAILBOX_ID}`);
  });

  it("omits authorization on the health probe", async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({ status: "ok", version: "1.0.0", timestamp: "t" }),
    );
    const health = await client.health();

    expect(calls[0]?.headers.get("Authorization")).toBeNull();
    expect(health.status).toBe("ok");
  });

  it("unwraps the envelope", async () => {
    const { client } = makeClient(() =>
      jsonResponse({
        id: "m1",
        email: "user@tropmail.com",
        opened_count: 3,
        closed_count: 2,
        favorite_count: 1,
      }),
    );
    const mailbox = await client.mailboxes.get(MAILBOX_ID);

    expect(mailbox.email).toBe("user@tropmail.com");
    expect(mailbox.opened_count).toBe(3);
  });

  it("sends list parameters as query", async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({ emails: [EMAIL_ITEM], total: 5, limit: 25, page: 2 }),
    );
    await client.emails.list({ mailboxId: MAILBOX_ID, limit: 25, page: 2, status: "Favorite" });

    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url.searchParams.get("limit")).toBe("25");
    expect(calls[0]?.url.searchParams.get("page")).toBe("2");
    expect(calls[0]?.url.searchParams.get("status")).toBe("Favorite");
  });

  it("uses the bare path for the html view and appends other views", async () => {
    const { client, calls } = makeClient(() => jsonResponse(EMAIL_DETAIL));
    await client.emails.get(MAILBOX_ID, "abc");
    await client.emails.get(MAILBOX_ID, "abc", { view: "text" });

    expect(calls.map((c) => c.url.pathname)).toEqual([
      `/api/v1/mailboxes/${MAILBOX_ID}/emails/abc`,
      `/api/v1/mailboxes/${MAILBOX_ID}/emails/abc/text`,
    ]);
  });

  it("forwards the timestamp carried by an email object", async () => {
    const { client, calls } = makeClient(() => jsonResponse(EMAIL_DETAIL));
    await client.emails.get(MAILBOX_ID, EMAIL_ITEM);

    expect(calls[0]?.url.searchParams.get("timestamp")).toBe("2026-01-01T00:00:00Z");
  });

  it("tracks the rate-limit window", async () => {
    const { client } = makeClient(() =>
      jsonResponse(
        { id: "m1", email: "a@b.dev" },
        {
          headers: {
            "X-RateLimit-Limit": "3",
            "X-RateLimit-Remaining": "2",
            "X-RateLimit-Reset": "1767225600",
          },
        },
      ),
    );

    expect(client.rateLimit.limit).toBeNull();
    await client.mailboxes.get(MAILBOX_ID);
    expect(client.rateLimit).toMatchObject({ limit: 3, remaining: 2, reset: 1767225600 });
  });

  it("parses an email detail with attachments", async () => {
    const { client } = makeClient(() => jsonResponse(EMAIL_DETAIL));
    const detail = await client.emails.get(MAILBOX_ID, "abc");

    expect(detail.attachments[0]?.filename).toBe("invoice.pdf");
    expect(detail.to[0]?.address).toBe("me@tropmail.com");
  });
});

describe("actions", () => {
  it("requires at least one field", async () => {
    const { client } = makeClient(() => jsonResponse({}));
    await expect(client.emails.update(MAILBOX_ID, "abc", {})).rejects.toThrow(TypeError);
  });

  it("sends the block action and parses the sender", async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({ action_status: "Block", sender_email: "spam@bad.test" }),
    );
    const result = await client.emails.block(MAILBOX_ID, "abc");

    expect(calls[0]?.body).toEqual({ action_status: "Block" });
    expect(result.sender_email).toBe("spam@bad.test");
  });

  it("clears an action with an empty string", async () => {
    const { client, calls } = makeClient(() => jsonResponse({ action_status: null }));
    await client.emails.clearAction(MAILBOX_ID, "abc");

    expect(calls[0]?.body).toEqual({ action_status: "" });
  });

  it("includes the timestamp from an email object", async () => {
    const { client, calls } = makeClient(() => jsonResponse({ email_id: "x" }));
    await client.emails.favorite(MAILBOX_ID, EMAIL_ITEM);

    expect(calls[0]?.body).toEqual({
      action_status: "Favorite",
      timestamp: "2026-01-01T00:00:00Z",
    });
  });
});
