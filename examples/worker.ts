/**
 * A fetch handler that exposes the mailbox as JSON.
 *
 * The SDK has no dependencies and no `node:` imports, so it runs unchanged on
 * fetch-based runtimes. Pass the API key from the environment:
 *
 *   env.TROPMAIL_API_KEY
 */
import { TropMail, TropMailError } from "../src/index.js";

interface Env {
  TROPMAIL_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Workers have no process.env, so the key is passed explicitly.
    const client = new TropMail({ apiKey: env.TROPMAIL_API_KEY });

    const url = new URL(request.url);
    try {
      const { mailboxes } = await client.mailboxes.list({ signal: request.signal });
      const mailboxId = mailboxes[0]?.id;
      if (!mailboxId) {
        return Response.json({ emails: [], count: 0 });
      }

      const query = url.searchParams.get("q");
      const result = query
        ? await client.emails.search({ mailboxId, query, limit: 20, signal: request.signal })
        : await client.emails.list({ mailboxId, limit: 20, status: "Open", signal: request.signal });

      return Response.json({
        count: result.emails.length,
        emails: result.emails.map((email) => ({
          id: email.id,
          from: email.from.address,
          subject: email.subject,
          at: email.timestamp,
        })),
      });
    } catch (error) {
      if (error instanceof TropMailError) {
        // Pass the upstream status through, and the request id with it, so a
        // failure here is traceable in the API's logs.
        return Response.json(
          { error: error.message, request_id: error.requestId },
          { status: error.status ?? 502 },
        );
      }
      throw error;
    }
  },
};
