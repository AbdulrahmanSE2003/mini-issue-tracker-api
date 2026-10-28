# Error Handling

This describes the error responses the backend **actually produces today**.

## Response shape

There is **no custom exception filter** in the codebase (no
`useGlobalFilters`, no `ExceptionFilter` implementations). All errors use the
**NestJS default exception shape**:

```json
{
  "message": "Human-readable message or array of messages",
  "error": "Reason phrase (e.g. \"Bad Request\")",
  "statusCode": 400
}
```

The `{ "error": { "code", "message", "fields" } }` envelope described in
`AGENTS.md` is **planned but not implemented** — clients must currently parse
`statusCode`, `message`, and `error` at the top level.

Content type: `application/json` for all error responses.

## Status codes in use

| Status | Meaning in this app | Where it comes from |
| ------ | ------------------- | ------------------- |
| 400    | Validation failed (bad body, unknown fields, weak/short values) | Global `ValidationPipe` |
| 401    | Not authenticated, bad credentials, or the session's user no longer exists | `UnauthorizedException` in guard/services |
| 409    | Duplicate email on signup | `ConflictException` (Mongo duplicate-key, code `11000`) |
| 500    | Session create/save/destroy failed; unexpected errors | `InternalServerErrorException`; Nest's default for uncaught exceptions |

No 403, 404, or 422 responses are produced by any implemented endpoint.

## Validation behavior

Configured globally in `src/main.ts`:

```ts
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
})
```

Consequences for every endpoint with a DTO body (`/auth/signup`,
`/auth/signin`):

- **Unknown properties are rejected** with 400 (message:
  `property <name> should not exist`), they are not silently stripped.
- Bodies are transformed to the DTO class; validation uses `class-validator`
  constraints on the DTO.
- A missing or non-JSON body on these routes yields 400.

### Example: 400 validation error

Request: `POST /auth/signin` with `{"email": "not-an-email", "password": "short"}`

```json
{
  "message": [
    "email must be an email",
    "password must be longer than or equal to 8 characters"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

Exact message strings come from `class-validator` (e.g.
`name must be longer than or equal to 2 characters`,
`password must be shorter than or equal to 128 characters`) plus the custom
`Passwords do not match` message for `passwordConfirm` (`src/auth/dtos/signupDTO.ts`).

### Example: 400 unknown field

```json
{
  "message": ["property isAdmin should not exist"],
  "error": "Bad Request",
  "statusCode": 400
}
```

## 401 Unauthorized

Thrown by `SessionAuthGuard` (no/expired session on a protected route), by
`AuthService.login` (bad credentials), and by `UsersService.getMe` (user
deleted/soft-deleted since login).

No session / unauthenticated (message is Nest's default for
`UnauthorizedException`):

```json
{
  "message": "Unauthorized",
  "error": "Unauthorized",
  "statusCode": 401
}
```

Bad credentials (custom message from `AuthService`):

```json
{
  "message": "Invalid email or password",
  "error": "Unauthorized",
  "statusCode": 401
}
```

Note: the two messages are intentionally distinct — "Unauthorized" means
"you're not logged in (or your user is gone)", while "Invalid email or
password" is the signin failure. Signin never reveals whether the email exists.

## 409 Conflict

`POST /auth/signup` when the normalized email already exists (unique index):

```json
{
  "message": "Email already exists",
  "error": "Conflict",
  "statusCode": 409
}
```

## 500 Internal Server Error

Explicitly thrown in two session-failure paths (`src/auth/auth.controller.ts`):

```json
{
  "message": "Could not create session",
  "error": "Internal Server Error",
  "statusCode": 500
}
```

```json
{
  "message": "Could not destroy session",
  "error": "Internal Server Error",
  "statusCode": 500
}
```

Any other unhandled exception also returns Nest's default 500 body
(`message: "Internal Server Error"`); stack traces are not included in
responses by default.

## Client guidance

- Branch on `statusCode`: `401` → re-authenticate; `409` → show
  "email already registered"; `400` → display `message` (it may be an array —
  join or map over it).
- Do not assume a stable machine-readable error `code` — none exists yet; the
  planned structured envelope is not implemented.
