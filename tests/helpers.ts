import { TropMail } from "../src/index.js";
import type { EmailDetail, EmailListItem } from "../src/types.js";

export const API_KEY = "a".repeat(32);
export const BASE_URL = "https://api.example.test/api/v1";

export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

export type Responder = (request: RecordedRequest, callIndex: number) => Response;

export interface MockFetch {
  fetch: typeof fetch;
  calls: RecordedRequest[];
}

export function mockFetch(responder: Responder): MockFetch {
  const calls: RecordedRequest[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const record: RecordedRequest = {
      method: init?.method ?? "GET",
      url,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(record);
    return responder(record, calls.length - 1);
  }) as unknown as typeof fetch;

  return { fetch: impl, calls };
}

export function envelope(data: unknown, message = "ok"): string {
  return JSON.stringify({ success: true, message, data, error: null });
}

export function jsonResponse(
  data: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(envelope(data), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      "X-Request-ID": "req-123",
      ...init.headers,
    },
  });
}

export function errorResponse(
  status: number,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({ success: false, message, data: null, error: message }),
    {
      status,
      headers: {
        "content-type": "application/json",
        "X-Request-ID": "req-err",
        ...headers,
      },
    },
  );
}

export function makeClient(responder: Responder, overrides: Record<string, unknown> = {}) {
  const mock = mockFetch(responder);
  const client = new TropMail({
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    throttle: false,
    maxRetries: 0,
    fetch: mock.fetch,
    ...overrides,
  });
  return { client, calls: mock.calls };
}

export const EMAIL_ITEM: EmailListItem = {
  id: "11111111-1111-1111-1111-111111111111",
  timestamp: "2026-01-01T00:00:00Z",
  subject: "Welcome",
  from: { name: "Sender", address: "sender@example.com" },
  body: "Preview text",
  attachmentsCount: 1,
  email_state: "Open",
  action_status: "Favorite",
  status: "Favorite",
};

export const EMAIL_DETAIL: EmailDetail = {
  id: "11111111-1111-1111-1111-111111111111",
  timestamp: "2026-01-01T00:00:00Z",
  subject: "Welcome",
  from: { name: "Sender", address: "sender@example.com" },
  to: [{ name: "", address: "me@tropmail.com" }],
  cc: [],
  content: "<p>Hello</p>",
  email_state: "Open",
  status: "Open",
  attachments: [
    {
      attachment_id: "22222222-2222-2222-2222-222222222222",
      filename: "invoice.pdf",
      size: 1024,
      mime_type: "application/pdf",
      scan_status: "Clean",
    },
  ],
  headers: {},
  security: {},
};

export function page(count: number, total = 0): unknown {
  return {
    emails: Array.from({ length: count }, (_, i) => ({ ...EMAIL_ITEM, id: `id-${i}` })),
    total,
    limit: 10,
    page: 1,
  };
}
