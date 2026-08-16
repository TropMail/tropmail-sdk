# @tropmail/sdk

Official TypeScript SDK for the [TropMail API](https://api.tropmail.com).

**Zero runtime dependencies.** Built on `fetch`, so it runs on Node 18+, Bun, Deno,
and other fetch runtimes, including the browser.

```bash
npm install @tropmail/sdk
```

## Quick start

```ts
import { TropMail } from "@tropmail/sdk";

const client = new TropMail({ apiKey: process.env.TROPMAIL_API_KEY! });

const { mailboxes } = await client.mailboxes.list();
const mailbox = mailboxes[0]!;
console.log(`${mailbox.email}: ${mailbox.opened_count} opened`);

for await (const email of client.emails.iterate({ mailboxId: mailbox.id, status: "Open" })) {
  console.log(email.timestamp, email.from.address, email.subject);
}
```

On Node the key is read from `TROPMAIL_API_KEY` when you omit `apiKey`.

## Fetch runtimes

No `node:` imports and no globals beyond `fetch`:

```ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const client = new TropMail({ apiKey: env.TROPMAIL_API_KEY });
    const { mailboxes } = await client.mailboxes.list();
    const mailboxId = mailboxes[0]?.id;
    if (!mailboxId) {
      return Response.json({ emails: [] });
    }
    const page = await client.emails.list({ mailboxId, limit: 25 });
    return Response.json(page);
  },
};
```

## Reading an email

`get()` returns the HTML view by default. Pass the email object you already have
rather than a bare id and the SDK forwards its timestamp for a faster lookup.

```ts
const page = await client.emails.list({ mailboxId, limit: 10 });
const email = page.emails[0]!;

const detail = await client.emails.get(mailboxId, email, { view: "text" });
console.log(detail.content);

for (const attachment of detail.attachments) {
  console.log(attachment.filename, attachment.size, attachment.scan_status);
}
```

### Markdown

The markdown view is generated on demand and the server can block for up to a
minute before answering `504`. `getMarkdown()` handles that retry for you:

```ts
const detail = await client.emails.getMarkdown(mailboxId, email);
```

## Actions

```ts
await client.emails.favorite(mailboxId, email);
await client.emails.close(mailboxId, email);
await client.emails.block(mailboxId, email);        // also blocks the sender
await client.emails.clearAction(mailboxId, email);  // clears it, unblocking the sender
```

All of them are shorthands for `update()`:

```ts
await client.emails.update(mailboxId, email, { emailState: "Open", actionStatus: "Favorite" });
```

## Attachments

```ts
const info = await client.attachments.get(mailboxId, attachmentId);
const link = await client.attachments.download(mailboxId, attachmentId);
const bytes = await client.attachments.downloadBytes(mailboxId, attachmentId);

// Stream it anywhere — the raw Response is yours.
const response = await client.attachments.fetchContent(mailboxId, attachmentId);
await response.body?.pipeTo(destination);
```

Downloads use your API key on the same host as the rest of the API.

## Search

```ts
const page = await client.emails.search({ mailboxId, query: "invoice", limit: 25 });

for await (const email of client.emails.searchIterate("invoice", { mailboxId })) {
  console.log(email.subject);
}
```

The API always reports `total: 0` for search. The iterators page until they see a
short page rather than trusting `total`.

## Errors

```ts
import { NotFoundError, RateLimitError, TropMailError } from "@tropmail/sdk";

try {
  await client.emails.get(mailboxId, "does-not-exist");
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log(error.status, error.requestId);
  } else if (error instanceof RateLimitError) {
    console.log("retry after", error.retryAfter);
  } else if (error instanceof TropMailError) {
    console.log("request failed:", error.message);
  }
}
```

Every error carries `status`, `message`, and the `requestId` echoed by the API,
which is what support needs to trace a call.

| Class | HTTP |
|---|---|
| `ValidationError` | 400 |
| `AuthenticationError` | 401 |
| `TierError` | 403 |
| `NotFoundError` | 404 |
| `RateLimitError` | 429 |
| `MarkdownTimeoutError` | 504 |
| `ServerError` | 5xx |
| `ConnectionError` | transport failure |

## Rate limits

Budgets are per account, per second: Pro 3, Ultimate 10, Enterprise 50.

The client reads the limit from response headers and stays within your
account budget:

```ts
console.log(client.rateLimit); // { limit: 3, remaining: 2, reset: 1767225600, retryAfter: null }
```

Pass `throttle: false` if you manage concurrency yourself.

## Cancellation and timeouts

Every method takes `signal` and `timeout`:

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 1_000);

await client.emails.list({ mailboxId, signal: controller.signal });
await client.emails.list({ mailboxId, timeout: 5_000 });
```

## Configuration

```ts
new TropMail({
  apiKey: "…",                                  // else TROPMAIL_API_KEY
  baseUrl: "https://api.tropmail.com/api/v1",
  timeout: 120_000,                             // markdown can block ~60s
  maxRetries: 3,
  throttle: true,
  fetch: customFetch,
});
```

Retries with backoff on 429, 502, 503, 504, and
transport errors. Reads retry automatically; mutations never do.

## Examples

Runnable scripts live in [`examples/`](examples/): a quickstart, a bulk triage
walk with a shared `AbortSignal`, and a fetch-based worker entry.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Docs

Guides and API reference: [docs.tropmail.com](https://docs.tropmail.com/sdks/typescript/).

## License

MIT
