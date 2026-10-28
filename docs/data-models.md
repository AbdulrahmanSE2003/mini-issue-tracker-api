# Data Models

Only one application schema is implemented today: **User**. Sessions are also
persisted in MongoDB (by `connect-mongo`, not a Mongoose schema). Everything
else in `AGENTS.md` (Workspace, Project, Issue, Comment, Label, Activity,
Notification, SavedView, …) is planned but **not implemented**.

Database: MongoDB, connected via `MongooseModule.forRoot(process.env.MONGODB_URI)`
in `src/app.module.ts`. No collection prefix, no replica-set configuration, and
no Mongoose global options are set in code.

## User

Defined in `src/users/schemas/user.schema.ts`. Registered in `UsersModule`
(`MongooseModule.forFeature`).

```ts
@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}
```

### Fields

| Field          | Type       | Constraints                                                                 |
| -------------- | ---------- | --------------------------------------------------------------------------- |
| `_id`          | ObjectId   | MongoDB default. Exposed in APIs **only** as `id` (string) inside `user`.   |
| `name`         | string     | Required. Schema-level `trim`. API input limited to 2–60 chars (signup DTO); stored value is additionally trimmed by `UsersService`. |
| `email`        | string     | Required, **unique** (unique index), stored `lowercase` + `trim`. API input must pass `@IsEmail`; service normalizes (trim + lowercase) before write/lookup. |
| `passwordHash` | string     | Required. **Argon2id** hash. `select: false` — excluded from queries unless explicitly requested (`.select('+passwordHash')`, used only by signin). Never returned by any endpoint. |
| `deletedAt`    | Date \| null | Default `null`. **Soft-delete** marker; queries that fetch users for auth/profile filter `deletedAt: null`. |
| `createdAt`    | Date       | From `{ timestamps: true }`. |
| `updatedAt`    | Date       | From `{ timestamps: true }`. |

### Relationships / usage

- `session.userId` (in the session store) references `User._id` as a string;
  `GET /auth/me` re-validates that the user still exists and is not
  soft-deleted.
- No other collections reference users yet (no workspaces/issues exist).

### Notes and limitations

- There is **no schema-level required/enum validation beyond the above** —
  length rules live in the DTOs (API layer), not the schema.
- There is no account-activation or email-verification field.
- There is no password-reset token model (password reset is planned but not
  implemented).
- No Mongoose indexes beyond the implicit unique index on `email` are declared.
  (`AGENTS.md` describes many future models and indexes; none exist yet.)

## Sessions collection (not a Mongoose schema)

Managed by `connect-mongo` (`src/main.ts`):

| Property   | Value                            |
| ---------- | -------------------------------- |
| Collection | `sessions`                       |
| Connection | Same `MONGODB_URI` as the app    |
| TTL        | 7 days (`ttl: 60 * 60 * 24 * 7`); Mongo TTL index prunes expired entries |
| Cookie     | `sid`, signed with `SESSION_SECRET` |

The documents hold the serialized `express-session` state (including
`userId` and `cookie`). Do not read or write this collection directly from the
frontend; treat it as internal. See
[Authentication](./authentication.md) for the cookie contract.

## Planned models (not implemented)

For planning context only — these appear in `AGENTS.md` but have **no
schemas, routes, or behavior in the codebase**: Workspace, Project,
ProjectMember, ProjectInvite, Label, Issue, Comment, Activity, Notification,
SavedView. Do not integrate against them yet.
