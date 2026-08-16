# TypeScript examples

```bash
npm install @tropmail/sdk
export TROPMAIL_API_KEY=your32charalphanumericapikeyhere
```

| File | What it shows |
|---|---|
| [`quickstart.ts`](quickstart.ts) | mailbox summary, listing, reading one message, `instanceof` error handling |
| [`triage.ts`](triage.ts) | auto-paging `for await`, bulk actions, one `AbortSignal` for the whole run |
| [`worker.ts`](worker.ts) | a fetch-based worker entry, with the key as a secret |

```bash
npx tsx examples/quickstart.ts
npx tsx examples/triage.ts invoice
```

The examples import from `../src/index.js` so they type-check against the local
source; in your own project the import is `@tropmail/sdk`.

`worker.ts` is a fetch handler rather than a script. Bind the API key as a
runtime secret in whatever hosts the handler.

These are type-checked in CI (`npm run typecheck`), so they cannot drift from
the SDK.
