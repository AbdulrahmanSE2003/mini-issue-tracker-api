# API Reference

All endpoints currently implemented by the Origin backend. Route paths are taken
directly from the controller decorators (`src/app.controller.ts`,
`src/auth/auth.controller.ts`).

**Base URL:** `http://localhost:5000` (or your `PORT`)

**Conventions (verified in `src/main.ts`):**

- All request bodies must be JSON (`Content-Type: application/json`).
- A global `ValidationPipe` runs with `whitelist: true`,
  `forbidNonWhitelisted: true`, and `transform: true`:
  - Unknown body properties are **rejected with 400** (not silently stripped).
  - Request bodies are transformed/validated with `class-validator` DTOs.
- Successful responses use Nest's defaults: **200** for `GET`, **201 Created**
  for `POST` (including `POST /auth/logout`).
- Authentication is **cookie-based server-side sessions** (cookie name `sid`).
  See [Authentication](./authentication.md). No endpoint accepts tokens in
  headers.
- Error responses use the NestJS default exception shape — see
  [Error Handling](./error-handling.md).

## Endpoint summary

| Method | Path             | Purpose                          | Auth required |
| ------ | ---------------- | -------------------------------- | ------------- |
| GET    | `/`              | Health/hello check               | No            |
| POST   | `/auth/signup`   | Register + start session         | No            |
| POST   | `/auth/signin`   | Log in + start session           | No            |
| POST   | `/auth/logout`   | End session + clear cookie       | No            |
| GET    | `/auth/me`       | Current authenticated user       | **Yes**       |

No other routes exist in the codebase today.

---

## GET /

Returns a static greeting. Useful as a health check.

- **Auth:** none
- **Parameters:** none

### Example

```http
GET / HTTP/1.1
Host: localhost:5000
```

```bash
curl http://localhost:5000/
```

### Success

**200 OK** — plain string body:

```
Hello World!
```

### Errors

None specific; unhandled server errors would fall through to Nest's default
500 shape (see [Error Handling](./error-handling.md)).

---

## POST /auth/signup

Creates a new user account **and** starts a session (the new user is logged in
immediately). Implemented in `AuthController.signup`.

- **Auth:** none
- **Headers:** `Content-Type: application/json`
- **Session:** a `sid` session cookie is set on success (session regeneration +
  save; see [Authentication](./authentication.md))

### Request body (`SignupDTO` — `src/auth/dtos/signupDTO.ts`)

| Field           | Type   | Rules                                                                 |
| --------------- | ------ | --------------------------------------------------------------------- |
| `name`          | string | Required. Length 2–60 characters (after JSON parsing; not auto-trimmed by the DTO). The service trims it before storing. |
| `email`         | string | Required. Must be a valid email (`@IsEmail`). Stored trimmed + lowercased. |
| `password`      | string | Required. Length 8–128 characters. Hashed with Argon2id; never stored or returned in plain text. |
| `passwordConfirm` | string | Required. Must exactly equal `password`, otherwise 400 with message `Passwords do not match`. |

Any other property in the body → **400** (`property <name> should not exist`).

### Example

```http
POST /auth/signup HTTP/1.1
Host: localhost:5000
Content-Type: application/json

{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "correct-horse-battery",
  "passwordConfirm": "correct-horse-battery"
}
```

```bash
curl -i -X POST http://localhost:5000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "password": "correct-horse-battery",
    "passwordConfirm": "correct-horse-battery"
  }'
```

### Success

**201 Created** — the session cookie is also set:

```json
{
  "user": {
    "id": "650f1c2a9b8d7e6f5a4b3c2d",
    "name": "Ada Lovelace",
    "email": "ada@example.com"
  }
}
```

- `user.id` is the MongoDB `_id` as a string (the raw `_id` is never exposed).
- The response `Set-Cookie` header contains the signed `sid` cookie
  (HttpOnly; Secure in production; see [Authentication](./authentication.md)).

### Errors

| Status | When                                                                 | Body `message` |
| ------ | -------------------------------------------------------------------- | -------------- |
| 400    | DTO validation fails (bad email, short name/password, mismatched `passwordConfirm`, extra fields, non-JSON) | Array of `class-validator` messages, e.g. `["name must be longer than or equal to 2 characters", "Passwords do not match"]` |
| 409    | Email already registered (unique index violation, compared case-insensitively) | `"Email already exists"` |
| 500    | Session could not be created/saved after the user was created         | `"Could not create session"` |

> **Implementation note:** the user document is created **before** the session
> is saved. If session creation fails with 500, the account still exists — the
> client should retry via `POST /auth/signin` rather than re-signup.

---

## POST /auth/signin

Verifies credentials and starts a session. Implemented in
`AuthController.signin` + `AuthService.login`.

- **Auth:** none (obviously, it establishes the session)
- **Headers:** `Content-Type: application/json`
- **Session:** a `sid` session cookie is set on success

### Request body (`SigninDTO` — `src/auth/dtos/signinDTO.ts`)

| Field      | Type   | Rules                                              |
| ---------- | ------ | -------------------------------------------------- |
| `email`    | string | Required. Must be a valid email. Compared trimmed + lowercased. |
| `password` | string | Required. Minimum length 8 characters.             |

Any other property → **400**.

### Example

```http
POST /auth/signin HTTP/1.1
Host: localhost:5000
Content-Type: application/json

{
  "email": "ada@example.com",
  "password": "correct-horse-battery"
}
```

```bash
curl -i -X POST http://localhost:5000/auth/signin \
  -H 'Content-Type: application/json' \
  -d '{"email": "ada@example.com", "password": "correct-horse-battery"}'
```

### Success

**201 Created** — session cookie set:

```json
{
  "user": {
    "id": "650f1c2a9b8d7e6f5a4b3c2d",
    "name": "Ada Lovelace",
    "email": "ada@example.com"
  }
}
```

### Errors

| Status | When                                          | Body `message`               |
| ------ | --------------------------------------------- | ---------------------------- |
| 400    | Validation fails (missing/invalid fields)     | Array of validation messages |
| 401    | Unknown email **or** wrong password (same generic message by design) | `"Invalid email or password"` |
| 500    | Session could not be created/saved            | `"Could not create session"` |

Soft-deleted users (`deletedAt` set) cannot sign in — they are excluded from the
credential lookup and effectively count as an unknown email.

---

## POST /auth/logout

Destroys the server-side session (if any) and clears the `sid` cookie.
Implemented in `AuthController.logout`.

- **Auth:** **not required** — the route has no guard. Calling it while logged
  out (or with an invalid/expired session) still succeeds and just clears the
  cookie.
- **Headers:** none required
- **Body:** none

### Example

```bash
curl -i -X POST http://localhost:5000/auth/logout \
  -b cookies.txt -c cookies.txt
```

```http
POST /auth/logout HTTP/1.1
Host: localhost:5000
Cookie: sid=<session-id>
```

### Success

**201 Created** (Nest's default for POST) with the cookie cleared:

```json
{
  "message": "Logged out successfully"
}
```

The response also sends a `Set-Cookie` header that expires the `sid` cookie
(with the same attributes it was issued with: HttpOnly, SameSite=Lax, Path=/,
and Secure in production).

### Errors

| Status | When                                             | Body `message`             |
| ------ | ------------------------------------------------ | -------------------------- |
| 500    | The session existed but could not be destroyed   | `"Could not destroy session"` |

---

## GET /auth/me

Returns the authenticated user. Implemented in `AuthController.getMe`; protected
by `SessionAuthGuard`.

- **Auth:** **required** — must send a valid, non-expired `sid` session cookie
- **Parameters:** none

### Example

```bash
curl http://localhost:5000/auth/me -b cookies.txt
```

```http
GET /auth/me HTTP/1.1
Host: localhost:5000
Cookie: sid=<session-id>
```

### Success

**200 OK**:

```json
{
  "user": {
    "id": "650f1c2a9b8d7e6f5a4b3c2d",
    "name": "Ada Lovelace",
    "email": "ada@example.com"
  }
}
```

The user is re-read from the database, so this reflects the latest profile state.

### Errors

| Status | When                                                            | Body `message`  |
| ------ | --------------------------------------------------------------- | --------------- |
| 401    | No session cookie, invalid/expired session, or no `userId` in session | `"Unauthorized"` |
| 401    | Session valid but the user no longer exists or is soft-deleted  | `"Unauthorized"` |

---

## Planned, not implemented

The repository's product specification (`AGENTS.md`) describes a much larger API —
workspaces, projects, issues, comments, labels, saved views, activity logs,
notifications, global search, password reset, plus a unified
`{ "error": { "code", "message", "fields" } }` error envelope. **None of that is
implemented in the code today**; only the five routes above exist. This
documentation will grow as features land. Do not integrate against the planned
routes yet.
