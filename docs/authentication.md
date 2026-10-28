# Authentication

Origin uses **server-side sessions**, not JWT. Sessions are created with
`express-session` and persisted to MongoDB via `connect-mongo`; the browser (or
API client) only ever holds an opaque, signed cookie named **`sid`**.

Relevant source: `src/main.ts` (session middleware),
`src/constants/cookie.constants.ts`, `src/auth/*`,
`src/types/express-session.d.ts`.

## How it works

1. `express-session` middleware runs on every request (registered globally in
   `main.ts`, before Nest routes).
2. On each request it reads the `sid` cookie, looks the session up in the
   MongoDB `sessions` collection, verifies the signature, and attaches
   `req.session` (typed to carry an optional `userId`, see
   `src/types/express-session.d.ts`).
3. Login/signup **regenerate** the session first (defeating session fixation),
   then store `session.userId` and explicitly save.
4. Protected routes use `SessionAuthGuard`, which throws `401 Unauthorized`
   unless `req.session.userId` is set.

There is no token in responses, no `Authorization` header support, and no
client-readable auth state — the cookie is `HttpOnly`, so JavaScript cannot
access it. Use `GET /auth/me` to learn who is logged in.

## Session cookie: `sid`

Configured in `src/main.ts` and mirrored for logout in
`src/constants/cookie.constants.ts`:

| Attribute    | Value                                     | Notes |
| ------------ | ----------------------------------------- | ----- |
| Name         | `sid`                                     | |
| `httpOnly`   | `true`                                    | Not accessible from JS — prevents XSS token theft. |
| `sameSite`   | `lax`                                     | Cookie withheld from cross-site subrequests; sent on top-level navigations. |
| `secure`     | `true` only when `NODE_ENV === 'production'` | In local HTTP development it is sent over plain HTTP. |
| `path`       | `/` (default; made explicit on logout clearing) | |
| `maxAge`     | 7 days (604800000 ms)                     | Sliding? **No** — set at login; express-session refreshes it only when the session is touched/saved (unverified whether it is re-set on every request; assume ~7 days from login). |
| Value        | Signed session id (not the userId itself) | Server-side data lives in MongoDB, not in the cookie. |

Session store: MongoDB collection **`sessions`**, with a TTL of 7 days
(`ttl: 60 * 60 * 24 * 7` in `connect-mongo` options). `resave: false`,
`saveUninitialized: false` — no session is persisted for anonymous visitors
until login/signup writes `userId`.

## Session lifecycle

### Signup (`POST /auth/signup`) and signin (`POST /auth/signin`)

Both establish a session immediately (see
[API Reference](./api-reference.md)):

1. `req.session.regenerate()` — discards any pre-login session id
   (session-fixation protection).
2. `session.userId = <user id string>`.
3. `req.session.save()` — persists to MongoDB; `express-session` then emits the
   `Set-Cookie: sid=...` header on the response.

Any failure in steps 1–3 → **500 `Could not create session`** (the signup case
may leave the user created; retry signin).

### Validating the session on protected routes

Only **`GET /auth/me`** is protected today, via `SessionAuthGuard`
(`src/auth/guards/session-auth.guard.ts`):

- No (or invalid/expired) session → **401** `{"message":"Unauthorized","error":"Unauthorized","statusCode":401}`.
- Valid session → the controller re-checks `session.userId` and loads the user;
  a user that was deleted or soft-deleted since login also yields **401**.

The guard is applied **per-route with `@UseGuards`** — it is not global. Any
future endpoint without `@UseGuards(SessionAuthGuard)` is currently
unauthenticated.

### Logout (`POST /auth/logout`)

- If the session has a `userId`, the server-side session document is destroyed
  (`req.session.destroy`) — the `sid` value becomes invalid immediately
  server-side.
- The `sid` cookie is then cleared via `res.clearCookie` with the shared cookie
  options (HttpOnly, SameSite=Lax, Path=/, Secure in production).
- The route is **not guarded**; logging out without a session still returns
  201 `{"message":"Logged out successfully"}` and clears the cookie.
- If session destruction fails → **500 `Could not destroy session`**.

## Frontend integration

### Same-origin / dev proxy (recommended)

The session cookie's `SameSite=Lax` and the absence of CORS configuration (see
below) make a same-origin setup by far the easiest:

- Serve the frontend and API behind one origin in production (e.g. reverse
  proxy), **or**
- In development, proxy API calls from your frontend dev server to
  `http://localhost:5000` so the browser sees one origin.

### Cross-origin clients

**Finding:** the app does **not** call `app.enableCors()` — there is no CORS
support in the backend today. A browser app on a different origin (e.g.
`http://localhost:3000` → `http://localhost:5000`) will be blocked by the
browser regardless of `credentials: 'include'`. Until CORS (or a proxy) is
added, use a proxy. If CORS is later enabled it must allow credentials and an
explicit origin — `Access-Control-Allow-Origin: *` cannot be used with
credentialed requests.

When same-origin (or proxied):

```js
// fetch: cookie is HttpOnly, so just include credentials
await fetch('/auth/signin', {
  method: 'POST',
  credentials: 'include',       // required for cross-origin; harmless same-origin
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
```

- Never attempt to read the token from `document.cookie` — `sid` is HttpOnly by
  design.
- On 401 from a protected endpoint, send the user to the sign-in screen.
- Call `POST /auth/logout` on sign-out; it works even if the session already
  expired.

### Postman / curl

- Use Postman's cookie jar (or curl's `-c`/`-b` flags) so the `sid` cookie set
  by signup/signin is replayed automatically:

```bash
# save cookies to a file, then reuse them
curl -c cookies.txt -X POST http://localhost:5000/auth/signin \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"correct-horse-battery"}'

curl -b cookies.txt http://localhost:5000/auth/me
```

## CSRF considerations

- There is **no CSRF token mechanism** in the codebase.
- The practical protection is `SameSite=Lax` on the `sid` cookie: modern
  browsers will not attach it to cross-site `POST` requests (forms or fetch),
  which covers the state-changing endpoints that exist today.
- `Lax` still sends the cookie on top-level `GET` navigations; that is safe for
  the current API (no state changes via GET).
- Because all state-changing routes are `POST` with JSON bodies, and browsers
  cannot send `application/json` cross-site via HTML forms (a cross-site fetch
  with a JSON preflight would be rejected without CORS), the current surface is
  reasonably protected. **If cross-origin access or CORS is introduced later,
  add explicit CSRF protection** (e.g. SameSite=Strict, double-submit token, or
  origin checking) as part of that change.

## Security notes (as implemented)

- Passwords hashed with **Argon2id** (`argon2` library, default parameters).
- Signin returns one generic `Invalid email or password` message for both
  unknown email and wrong password (no user enumeration via that endpoint).
  Note: **signup** does reveal whether an email is taken (409) — a common,
  deliberate UX trade-off.
- Session ids are regenerated on every login/signup (fixation defense).
- `passwordHash` is `select: false` on the schema and never included in any
  API response.
