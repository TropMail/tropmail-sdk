/**
 * Walk the whole mailbox, favorite anything matching a term, and block senders
 * whose mail the API flagged as phishing.
 *
 *   export TROPMAIL_API_KEY=...
 *   npx tsx examples/triage.ts invoice
 */
import { NotFoundError, RateLimitError, TropMail } from "../src/index.js";

async function main(): Promise<void> {
  const term = (process.argv[2] ?? "invoice").toLowerCase();
  const client = new TropMail();

  // Give the whole run one deadline; every request inherits the signal.
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 5 * 60_000);

  let favorited = 0;
  let blocked = 0;

  try {
  const { mailboxes } = await client.mailboxes.list({ signal: controller.signal });
    const mailboxId = mailboxes[0]?.id;
    if (!mailboxId) {
      console.log("This API key has no mailboxes.");
      return;
    }

    // The iterator pages for you and stops on the first short page. Requests
    // are paced to the tier's rate limit, so a full walk never collects 429s.
    for await (const email of client.emails.iterate({ mailboxId, signal: controller.signal })) {
      try {
        if (email.action_status === "Phishing") {
          await client.emails.block(mailboxId, email, { signal: controller.signal });
          blocked += 1;
        } else if (email.subject.toLowerCase().includes(term)) {
          await client.emails.favorite(mailboxId, email, { signal: controller.signal });
          favorited += 1;
        }
      } catch (error) {
        // A message deleted mid-walk is expected, not fatal.
        if (!(error instanceof NotFoundError)) {
          throw error;
        }
      }
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.error(`Rate limited; retry after ${error.retryAfter}s`);
      return;
    }
    throw error;
  } finally {
    clearTimeout(deadline);
  }

  console.log(`favorited ${favorited} matching "${term}", blocked ${blocked} phishing senders`);
}

await main();
