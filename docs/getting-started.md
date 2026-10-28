# Getting Started

Prerequisites, installation, environment setup, and local development for the
Origin backend.

## Prerequisites

| Requirement             | Notes                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| **Node.js**             | No `engines` field is declared in `package.json`; the project targets ES2023. A recent LTS version is recommended (unverified which versions are supported). |
| **pnpm**                | The repository ships a `pnpm-lock.yaml` and `pnpm-workspace.yaml`.               |
| **MongoDB**             | A running MongoDB instance (local or remote). Used for both application data and the session store. |

> **Note (pnpm build scripts):** `pnpm-workspace.yaml` allow-lists install-time
> build scripts for `argon2` (native password-hashing bindings) and
> `@scarf/scarf`. If you install with build scripts disabled, `argon2` may not
> work and signup/signin will fail.

## Installation

```bash
pnpm install
```

## Environment variables

Create a `.env` file in the repository root. The app loads it via
`@nestjs/config` (`ConfigModule.forRoot`), and the `start`, `start:dev`, and
`start:debug` scripts run through the Nest CLI, which also loads `.env`.

> **Finding:** the repository has **no `.env.example` file**. The table below is
> derived from the actual code (`src/main.ts`, `src/app.module.ts`). Names are
> taken from the source; values below are safe placeholders — never commit real
> values (`.env` is git-ignored).

| Variable             | Required | Purpose                                                                                          | Fallback in code if missing |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------ | --------------------------- |
| `PORT`               | No       | HTTP port the server listens on.                                                                 | `5000`                      |
| `MONGODB_URI`        | **Yes**  | MongoDB connection string. Used by Mongoose **and** by the session store (`connect-mongo`).       | Literal placeholder `"YOUR_MONGODB_URI"` — the app will fail to connect. |
| `SESSION_SECRET`     | **Yes**  | Secret used to sign the session cookie (`express-session`).                                       | None — accessed with a non-null assertion; requests will fail without it. |
| `NODE_ENV`           | No       | When set to `production`, the session cookie gets the `Secure` attribute.                         | Not production — cookie is not `Secure`. |
| `OBSERVE_APP_KEY`    | No       | NestJS Observe instrumentation key (observability).                                              | Placeholder `"YOUR_APP_KEY"` |
| `OBSERVE_APP_SECRET` | No       | NestJS Observe instrumentation secret.                                                            | Placeholder `"YOUR_APP_SECRET"` |

Example `.env` (placeholders only):

```bash
PORT=5000
MONGODB_URI="mongodb://127.0.0.1:27017/origin"
SESSION_SECRET="replace-with-a-long-random-string"
# NODE_ENV=production   # only in real deployments, enables Secure cookies
# OBSERVE_APP_KEY=      # optional, see https://observe.nestjs.com
# OBSERVE_APP_SECRET=
```

## Running the app

```bash
# development (watch mode)
pnpm run start:dev

# development, single run (compiles then starts)
pnpm run start

# debug mode (watch + inspector)
pnpm run start:debug

# production (requires a prior `pnpm run build`)
pnpm run build
pnpm run start:prod
```

The server listens on `http://localhost:${PORT}` (default port **5000**).

Verify it is running:

```bash
curl http://localhost:5000/
# Hello World!
```

## Available scripts

| Script               | Command                          | Purpose                          |
| -------------------- | -------------------------------- | -------------------------------- |
| `build`              | `nest build`                     | Compile TypeScript to `dist/`    |
| `start`              | `nest start`                     | Build and start once             |
| `start:dev`          | `nest start --watch`             | Start with file watching         |
| `start:debug`        | `nest start --debug --watch`     | Start in debug/watch mode        |
| `start:prod`         | `node dist/main`                 | Run the compiled app             |
| `lint`               | `oxlint --type-aware src/ test/` | Lint (oxlint)                    |
| `test`               | `vitest run`                     | Unit tests                       |
| `test:watch`         | `vitest`                         | Unit tests in watch mode         |
| `test:cov`           | `vitest run --coverage`          | Unit tests with coverage         |
| `test:debug`         | `vitest --inspect-brk ...`       | Debug unit tests                 |
| `test:e2e`           | `vitest run --config ./vitest.config.e2e.ts` | End-to-end tests        |
| `format`             | `prettier --write ...`           | Format source and tests          |
| `deploy`             | `nest deploy`                    | Deploy (Nest Mau)                |

> **Finding (test suite status, verified at time of writing):** `pnpm run build`
> succeeds, but `pnpm test` currently fails — 3 of 4 unit test files fail because
> their testing modules do not provide the dependencies (e.g. `UserModel`,
> `UsersService`) that the constructors require. These are scaffold-level test
> issues, not application-code failures.

## Project layout

```
src/
├── main.ts                    # Bootstrap: ValidationPipe, express-session, port
├── app.module.ts              # Root module: Observe, Config, Mongoose, Auth, Users
├── app.controller.ts          # GET /
├── constants/
│   └── cookie.constants.ts    # Session cookie name + shared cookie options
├── auth/
│   ├── auth.controller.ts     # POST /auth/signup|signin|logout, GET /auth/me
│   ├── auth.service.ts        # Credential verification (Argon2)
│   ├── dtos/                  # SignupDTO, SigninDTO (class-validator)
│   └── guards/session-auth.guard.ts
├── users/
│   ├── users.service.ts       # User CRUD helpers, public-user shaping
│   └── schemas/user.schema.ts # Mongoose User schema
└── types/express-session.d.ts # Session type augmentation (session.userId)
```

## Next steps

- [API Reference](./api-reference.md) — implemented endpoints and contracts
- [Authentication](./authentication.md) — session/cookie integration details
- [Data Models](./data-models.md) — schemas and constraints
- [Error Handling](./error-handling.md) — error response shapes
