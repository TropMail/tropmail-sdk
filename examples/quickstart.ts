/**
 * Print a mailbox summary and read the newest message.
 *
 *   export TROPMAIL_API_KEY=...
 *   npx tsx examples/quickstart.ts
 */
import { NotFoundError, TropMail, TropMailError } from "../src/index.js";

async function main(): Promise<void> {
  const client = new TropMail();

  const { mailboxes } = await client.mailboxes.list();
  if (mailboxes.length === 0) {
    console.log("This API key has no mailboxes.");
    return;
  }
  const mailbox = mailboxes[0]!;
  console.log(
    `${mailbox.email} — ${mailbox.opened_count} open, ` +
      `${mailbox.closed_count} closed, ${mailbox.favorite_count} favorite\n`,
  );

  const page = await client.emails.list({ mailboxId: mailbox.id, limit: 5 });
  if (page.emails.length === 0) {
    console.log("The mailbox is empty.");
    return;
  }

  for (const email of page.emails) {
    console.log(
      `${email.from.address.padEnd(24)} ${email.subject.slice(0, 40).padEnd(40)} ${email.timestamp}`,
    );
  }

  const newest = page.emails[0]!;
  try {
    const detail = await client.emails.get(mailbox.id, newest, { view: "text", timeout: 30_000 });
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
