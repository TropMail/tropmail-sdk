/**
 * Fails when the SDK stops covering every canonical route in the OpenAPI spec.
 *
 * Docs list inboxes at `/mailboxes` and every other operation at `/mailbox/{id}`.
 * The client still calls the `/mailboxes/{id}` alias; those requests are mapped
 * onto the documented singular templates.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { jsonResponse, MAILBOX_ID, makeClient } from "./helpers.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");
const SPEC_PATH = join(PACKAGE_ROOT, "spec", "openapi.json");
const DOC_SPEC_PATH = join(PACKAGE_ROOT, "..", "..", "Docs", "Doc", "openapi.json");

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

interface OpenApiSpec {
  paths: Record<string, Record<string, unknown>>;
}

function loadSpec(path: string): OpenApiSpec {
  return JSON.parse(readFileSync(path, "utf8")) as OpenApiSpec;
}

function specOperations(): Set<string> {
  const spec = loadSpec(SPEC_PATH);
  const operations = new Set<string>();
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const method of Object.keys(methods)) {
      if (HTTP_METHODS.has(method.toLowerCase())) {
        operations.add(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return operations;
}

function templatize(pathname: string): string {
  let path = pathname.replace(/^\/api\/v1/, "");
  if (path.startsWith("/mailboxes/")) {
    path = `/mailbox/${path.slice("/mailboxes/".length)}`;
  }
  const rules: [RegExp, string][] = [
    [
      /^\/mailbox\/[^/]+\/emails\/[^/]+\/(text|html|markdown)$/,
      "/mailbox/{id}/emails/{emailId}/{view}",
    ],
    [/^\/mailbox\/[^/]+\/emails\/search$/, "/mailbox/{id}/emails/search"],
    [
      /^\/mailbox\/[^/]+\/emails\/[^/]+\/scan-attachments$/,
      "/mailbox/{id}/emails/{emailId}/scan-attachments",
    ],
    [
      /^\/mailbox\/[^/]+\/emails\/[^/]+\/download-attachments$/,
      "/mailbox/{id}/emails/{emailId}/download-attachments",
    ],
    [
      /^\/mailbox\/[^/]+\/attachments\/[^/]+\/scan$/,
      "/mailbox/{id}/attachments/{attId}/scan",
    ],
    [
      /^\/mailbox\/[^/]+\/attachments\/[^/]+\/download$/,
      "/mailbox/{id}/attachments/{attId}/download",
    ],
    [/^\/mailbox\/[^/]+\/attachments\/[^/]+$/, "/mailbox/{id}/attachments/{attId}"],
    [/^\/mailbox\/[^/]+\/emails\/[^/]+$/, "/mailbox/{id}/emails/{emailId}"],
    [/^\/mailbox\/[^/]+\/emails$/, "/mailbox/{id}/emails"],
    [/^\/mailbox\/[^/]+$/, "/mailbox/{id}"],
  ];
  for (const [pattern, template] of rules) {
    if (pattern.test(path)) {
      return path.replace(pattern, template);
    }
  }
  return path;
}

const ANY_PAYLOAD = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "user@tropmail.com",
  timestamp: "2026-01-01T00:00:00Z",
  from: { name: "Sender", address: "sender@example.com" },
  attachment_id: "22222222-2222-2222-2222-222222222222",
  status: "ok",
  mailboxes: [],
};

async function exerciseEveryMethod(): Promise<Set<string>> {
  const seen = new Set<string>();
  const { client } = makeClient((request) => {
    seen.add(`${request.method.toUpperCase()} ${templatize(request.url.pathname)}`);
    if (request.url.pathname.endsWith("/download")) {
      return new Response("%PDF-1.4 mock", {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="invoice.pdf"',
        },
      });
    }
    return request.url.pathname.endsWith("-attachments")
      ? jsonResponse([])
      : jsonResponse(ANY_PAYLOAD);
  });

  await client.health();
  await client.mailboxes.list();
  await client.mailboxes.get(MAILBOX_ID);
  await client.emails.list({ mailboxId: MAILBOX_ID });
  await client.emails.search({ mailboxId: MAILBOX_ID, query: "q" });
  await client.emails.get(MAILBOX_ID, "id");
  await client.emails.get(MAILBOX_ID, "id", { view: "markdown" });
  await client.emails.update(MAILBOX_ID, "id", { emailState: "Open" });
  await client.emails.scanAttachments(MAILBOX_ID, "id");
  await client.emails.downloadAttachments(MAILBOX_ID, "id");
  await client.attachments.get(MAILBOX_ID, "aid");
  await client.attachments.scan(MAILBOX_ID, "aid");
  await client.attachments.download(MAILBOX_ID, "aid");

  return seen;
}

describe("openapi contract", () => {
  it("ships the spec", () => {
    expect(existsSync(SPEC_PATH)).toBe(true);
  });

  it("matches the spec published by the docs site", () => {
    if (!existsSync(DOC_SPEC_PATH)) {
      return;
    }
    expect(loadSpec(DOC_SPEC_PATH)).toEqual(loadSpec(SPEC_PATH));
  });

  it("covers every documented canonical route", async () => {
    const covered = await exerciseEveryMethod();
    const missing = [...specOperations()].filter((op) => !covered.has(op));
    expect(missing).toEqual([]);
  });

  it("calls no undocumented route", async () => {
    const spec = specOperations();
    const extra = [...(await exerciseEveryMethod())].filter((op) => !spec.has(op));
    expect(extra).toEqual([]);
  });
});
