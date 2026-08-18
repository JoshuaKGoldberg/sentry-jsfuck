# sentry-jsfuck

> [!IMPORTANT]
> **Prototype hackathon code.** Built in a few hours for a Sentry hackweek. This is
> not an official Sentry SDK, is not affiliated with or supported by Sentry, and is
> nowhere near production-ready. Do not point it at anything you care about.

A working Sentry SDK for Node whose entire shipped implementation is six punctuation characters:

```
[ ] ( ) ! +
```

`dist/sentry.jsfuck.js` is **58,413 characters** long, and every one of them is `[`, `]`, `(`, `)`, `!`, or `+`. No letters, no digits, no quotes, no dots. It parses a DSN, generates event ids, timestamps events, takes a real `Error`, parses its V8 stack into correctly ordered Sentry frames, and POSTs the envelope over HTTP.

It is a real library, not a demo — you install it and call it from your own program.

## Install

This is a hackweek project and is not published to npm, so install it from a local path or a packed tarball:

```sh
npm install /path/to/sentry-jsfuck
```

Either way it resolves as a normal package and `require('sentry-jsfuck')` works from your code.

Requires Node 22.12 or newer. No runtime dependencies.

## Usage

```js
require('sentry-jsfuck');
const Sentry = globalThis.Sentry;

Sentry.init('https://your_public_key@o0.ingest.sentry.io/1234567');

Sentry.captureMessage('checkout-service booted');

try {
  chargeCard(order);
} catch (err) {
  Sentry.captureException(err);
}
```

**Note the two-step access.** `require('sentry-jsfuck')` runs the SDK, but it returns an empty object — the API arrives on `globalThis.Sentry` instead. That is not laziness, it is the one thing the premise costs: JSFuck code is evaluated through the `Function` constructor, whose body runs in global scope, where Node's `module` and `exports` simply do not exist as bindings. The SDK cannot assign to `module.exports` because it cannot see `module`.

The alternative would be a normal-JavaScript wrapper that re-exports the global — but then the thing you `require` would not itself be six characters, and the whole point would be gone. So the global is the honest seam.

## API

### `Sentry.init(dsn)`

Parses and stores the DSN. Accepts `http://<public_key>@<host>:<port>/<project_id>` or an `https://` DSN with the port omitted. Returns the parsed `{ publicKey, host, port, projectId }`.

Call this before any capture. There is no queueing — capturing before `init` throws.

### `Sentry.captureMessage(text[, callback])`

Sends a message event at level `info`. **Returns the event id** (32 lowercase hex characters, no dashes) synchronously, before the request completes.

### `Sentry.captureException(error[, callback])`

Sends an exception event at level `error`. Takes a real `Error`: `type` comes from `err.name`, `value` from `err.message`, and `err.stack` is parsed into `exception.values[0].stacktrace.frames` with `filename`, `function`, and `lineno`. **Returns the event id.**

Frames are emitted **oldest-first with the crashing frame last**, which is the reverse of the order V8 prints them in. Frames whose location cannot be read are dropped rather than guessed at, and `function` is omitted when the stack line carries no name. No frame in the output is invented.

### The optional callback

Both capture functions take an optional `callback(statusCode, responseBody)`, invoked when ingest responds. Sends are fire-and-forget without it.

```js
Sentry.captureMessage('hello', (status, body) => {
  console.log(status, body); // 200 {"id":"1bdd512d206e45b9a4cb1f7d41ce81ce"}
});
```

Events carry a numeric Unix-seconds `timestamp` from `Date.now() / 1000`.

## Try it locally

The repo ships a mock ingest server so you can run the example without a real DSN. It validates the auth header, envelope structure, and event id format, and rejects malformed requests with a 400 rather than a silent 200.

```sh
PORT=3003 node mock-ingest.js     # in one terminal
npm run example                   # in another
```

`examples/send-events.js` sends one message and one real caught exception. It consumes the SDK exactly the way your code would — `require('sentry-jsfuck')`, then `globalThis.Sentry` — and takes an optional DSN argument:

```sh
node examples/send-events.js http://testkey@127.0.0.1:3003/42
```

The server prints `ACCEPTED <id>` for each event.

## Layout

```
dist/sentry.jsfuck.js    the shipped SDK — 58,413 characters of []()!+
src/sdk.js               the readable source it is compiled from, for review
build.js                 the JScrewIt encoding step and charset assertion
examples/send-events.js  a consumer program
mock-ingest.js           local stand-in for Sentry ingest
```

`src/sdk.js` ships in the package on purpose: it is the human-reviewable source of truth for what the punctuation does. Nothing at runtime loads it — `main` points at `dist/`, and the readable copy is documentation.

## Rebuilding

```sh
npm install
npm run build
```

`build.js` asserts two things before it will write the artifact, because both failure modes are silent ones:

1. The output contains nothing outside `[]()!+`, and names any stray character if it does.
2. Evaluating the artifact defines exactly `init`, `captureMessage`, `captureException` and does nothing else. An SDK that sent events merely by being imported would be a bug, and this catches it.

---

## How this actually works

JSFuck is not a separate language. It is JavaScript — a demonstration that `[]()!+` is a Turing-complete subset of JS syntax, because you can build every value you need out of type coercion. `+[]` is `0`, `[]+[]` is `""`, `+!![]` is `1`, `[]+{}` is `"[object Object]"`. From there you can spell any string one character at a time, including `"constructor"`, which gets you `Function`, which gets you everything.

So this SDK reaches Sentry over real HTTP because **Node does the networking**. The `[]()!+` evaluates to a call into Node's built-in `http` module. There is no esolang TLS stack here and this repo does not claim one — against an `https://` DSN, Node's TLS does the work exactly as it does for the official SDK. What is true, and what is funny, is that the file you install contains six distinct characters and still sends fully populated events with real stack traces.

### The `require` constraint

A `Function` body runs in global scope. In a Node CommonJS module, `require` and `module` are not globals — they are locals injected into the module wrapper, so they are invisible to the encoded program. That is why the API is delivered on `globalThis` (above), and it is also why the SDK reaches the HTTP module through `process.getBuiltinModule('node:http')`, which is a genuine global as of Node 22.12, rather than `require('http')`.

That is the entire accommodation the readable source makes for its punctuation-only twin.

### What stack traces look like

Because the `Error` originates in **your** code, the frames the SDK reports are your real filenames and line numbers:

```
/srv/checkout-service/app.js:13 in Object.<anonymous>
/srv/checkout-service/app.js:9 in chargeCard
```

The one place the seam shows is a frame from inside the SDK itself. V8 has no filename for a `Function` body, so those report `<anonymous>` with a line number inside the decoded source, plus the host file at line 1 — the whole artifact is a single line:

```
TypeError: Cannot read properties of null (reading 'host')
    at send (eval at <anonymous> (/srv/app/node_modules/sentry-jsfuck/dist/sentry.jsfuck.js:1:676), <anonymous>:60:19)
```

Those are the genuine values V8 produced. The SDK reports what it was given and does not dress them up.

### Encoder notes

The encoder is [JScrewIt](https://github.com/fasttime/JScrewIt), not the `jsfuck` npm package. Two reasons, both load-bearing:

1. The `jsfuck` package has not shipped since 2015 and emits roughly 16x more output than its own master branch.
2. Its CLI defaults to `wrapWithEval=false`, which emits an inert string expression. You get a file that looks encoded, runs without error, and does absolutely nothing. A silent no-op is the worst possible failure mode for a joke that depends on the joke working.

`build.js` targets JScrewIt's `NODE_22_12` feature set.

## The wire format

A DSN is `http://<public_key>@<host>:<port>/<project_id>`. Production DSNs use `https` and omit the port; `init` splits on `//`, `@`, `:`, and the last `/`.

An envelope is three newline-separated JSON lines plus a trailing newline — envelope header, item header, then the event. The event id appears in both the envelope header and the event:

```
{"event_id":"<id>"}
{"type":"event"}
{"event_id":"<id>","timestamp":1755400000,"platform":"other","level":"info","logentry":{"formatted":"hello"}}
```

An exception event replaces `logentry` with:

```json
{"exception":{"values":[{"type":"SyntaxError","value":"...","stacktrace":{"frames":[...]}}]}}
```

`event_id` is 32 lowercase hex characters, no dashes. The request:

```
POST /api/<project_id>/envelope/ HTTP/1.1
Host: <host>:<port>
Content-Type: application/x-sentry-envelope
Content-Length: <byte length of body>
X-Sentry-Auth: Sentry sentry_version=7, sentry_key=<public_key>, sentry_client=sentry.jsfuck/0.1.0
Connection: close
```

`Content-Length` must be the byte count, not the character count, or the server waits forever for a body that never finishes. A successful send returns `200` with `{"id":"<event_id>"}`.

## Size

| | characters |
| --- | --- |
| readable source (`src/sdk.js`) | 3,393 |
| shipped `[]()!+` artifact | 58,413 |
| ratio | 17.2x |

57 KiB of punctuation, and it sends a real stack trace.

## License

MIT
