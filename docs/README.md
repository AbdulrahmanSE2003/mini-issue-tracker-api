# Origin Backend Documentation

Documentation for the **Origin** backend — a NestJS + MongoDB (Mongoose) API for a
small-team issue tracker. This documentation describes **only what is currently
implemented in the code**.

> **Current state:** the API is early-stage. Only authentication, the current-user
> endpoint, and a root health route are implemented. Workspaces, projects, issues,
> comments, labels, saved views, activity, notifications, and search are planned
> (see [`AGENTS.md`](../AGENTS.md) at the repository root) but **not yet
> available**. See [API Reference — Planned, Not Implemented](./api-reference.md#planned-not-implemented)
> for details.

## Contents

| Document                                                        | What it covers                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Getting Started](./getting-started.md)                          | Prerequisites, installation, environment variables, run commands, scripts       |
| [API Reference](./api-reference.md)                              | Every implemented HTTP endpoint with request/response contracts and examples    |
| [Authentication](./authentication.md)                            | Session lifecycle, cookie behavior, protected routes, frontend integration      |
| [Data Models](./data-models.md)                                  | Implemented Mongoose schemas, fields, constraints, and the session store        |
| [Error Handling](./error-handling.md)                            | Actual HTTP error response shapes and validation behavior                       |

## Quick start

```bash
pnpm install
# create a .env file (see getting-started.md)
pnpm run start:dev
```

The server listens on `http://localhost:5000` by default.

## At a glance

- **Framework:** NestJS 12 (ESM, TypeScript 6), Express platform
- **Database:** MongoDB via Mongoose 9
- **Auth:** Server-side sessions (`express-session`) stored in MongoDB
  (`connect-mongo`), cookie name `sid` — **not** JWT
- **Passwords:** Argon2id (`argon2`)
- **Validation:** Global `ValidationPipe` with whitelisting, unknown-property
  rejection, and body transformation
- **Error responses:** NestJS default exception shape (see
  [Error Handling](./error-handling.md))
