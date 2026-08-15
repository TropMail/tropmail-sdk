/**
 * Print a mailbox summary and read the newest message.
 *
 *   export TROPMAIL_API_KEY=...
 *   npx tsx examples/quickstart.ts
 */
import { NotFoundError, TropMail, TropMailError } from "../src/index.js";

async function main(): Promise<void> {
  // No apiKey option: the client reads TROPMAIL_API_KEY and validates the
  // format locally, so a malformed key fails before spending a round trip.
  const client = new TropMail();

  const mailbox = await client.mailbox.get();
  console.log(
    `${mailbox.email} — ${mailbox.opened_count} open, ` +
      `${mailbox.closed_count} closed, ${mailbox.favorite_count} favorite\n`,
  );

  const page = await client.emails.list({ limit: 5 });
  if (page.emails.length === 0) {
    console.log("The mailbox is empty.");
    return;
  }

  for (const email of page.emails) {
    console.log(
      `${email.from.address.padEnd(24)} ${email.subject.slice(0, 40).padEnd(40)} ${email.timestamp}`,
    );
  }

  // Passing the email object rather than its id forwards the timestamp
  // for a faster lookup.
  const newest = page.emails[0]!;
  try {
    const detail = await client.emails.get(newest, { view: "text", timeout: 30_000 });
    console.log(`\n--- ${detail.subject} ---`);
    console.log(detail.content.slice(0, 500));
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.log("\nThat message was deleted between listing and reading it.");
      return;
    }
    if (error instanceof TropMailError) {
      console.error(`\nRead failed (${error.status}, request ${error.requestId}): ${error.message}`);
      return;
    }
    throw error;
  }
}

await main();
