/**
 * Fails when the SDK stops covering every route in the OpenAPI spec.
 *
 * The spec lives in this package (`spec/openapi.json`). When `Docs/` is
 * checked out next to `Sdk/` in the TropMail workspace, the test also
 * asserts they match.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { jsonResponse, makeClient } from "./helpers.js";

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

/** Turn a concrete request path back into its OpenAPI template. */
function templatize(pathname: string): string {
  return pathname
    .replace(/^\/api\/v1/, "")
    .replace(/^\/email\/[^/]+\/(text|html|markdown)$/, "/email/{id}/{view}")
    .replace(/^\/email\/[^/]+\/scan-attachments$/, "/email/{id}/scan-attachments")
    .replace(/^\/email\/[^/]+\/download-attachments$/, "/email/{id}/download-attachments")
    .replace(/^\/attachment\/[^/]+\/scan$/, "/attachment/{id}/scan")
    .replace(/^\/attachment\/[^/]+\/download$/, "/attachment/{id}/download")
    .replace(/^\/attachment\/[^/]+$/, "/attachment/{id}")
    .replace(/^\/email\/[^/]+$/, "/email/{id}");
}

/** Superset of every payload shape, so one response satisfies any call. */
const ANY_PAYLOAD = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "user@tropmail.com",
  timestamp: "2026-01-01T00:00:00Z",
  from: { name: "Sender", address: "sender@example.com" },
  attachment_id: "22222222-2222-2222-2222-222222222222",
  status: "ok",
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

  await client.mailbox.health();
  await client.mailbox.validate();
  await client.mailbox.get();
  await client.emails.list();
  await client.emails.search({ query: "q" });
  await client.emails.get("id");
  await client.emails.get("id", { view: "markdown" });
  await client.emails.update("id", { emailState: "Open" });
  await client.emails.scanAttachments("id");
  await client.emails.downloadAttachments("id");
  await client.attachments.get("aid");
  await client.attachments.scan("aid");
  await client.attachments.download("aid");

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

  it("covers every documented route", async () => {
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
