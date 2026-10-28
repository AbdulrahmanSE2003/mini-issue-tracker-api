# Mini Issue Tracker — Backend Build Prompt (NestJS + MongoDB/Mongoose)

## 1. Overview

A web app for small teams to track issues (similar in spirit to Jira/Linear, intentionally simpler). Backend: **NestJS + MongoDB (Mongoose)**. The frontend is being built separately by a teammate — this document covers the backend only.

Structure: **Workspaces → Projects → Issues → Comments**, plus Activity log, Labels, Notifications, Saved Views, and global Search.

## 2. Finalized decisions

- **IDs**: standard MongoDB `ObjectId` (not UUID). The frontend will be told to treat them as opaque strings.
- **Assignee**: an issue can have **multiple assignees** (`assignees: [ObjectId]`), not a single one.
- **Labels**: have a `scope` field and can be attached to **Workspace, Project, or Issue** (not issue-only).

---

## 3. Central Enums (`constants/enums.ts`)

```ts
ISSUE_STATUS = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'cancelled',
];
ISSUE_PRIORITY = ['no_priority', 'low', 'medium', 'high', 'urgent'];
LABEL_COLOR = ['violet', 'magenta', 'indigo', 'olive', 'sand', 'plum']; // stored as a key, not hex
LABEL_SCOPE = ['workspace', 'project', 'issue'];
ACTIVITY_ACTION = [
  'created',
  'updated',
  'status_changed',
  'priority_changed',
  'assigned',
  'unassigned',
  'label_added',
  'label_removed',
  'commented',
  'deleted',
];
NOTIFICATION_TYPE = [
  'assigned',
  'comment_added',
  'status_changed',
  'project_update',
  'project_invite',
];
PROJECT_INVITE_STATUS = ['pending', 'accepted', 'rejected'];

DEFAULT_ISSUE_STATUS = 'todo';
DEFAULT_ISSUE_PRIORITY = 'no_priority';
```

All values live in one central file so future changes touch a single place.

---

## 4. Schemas (Mongoose)

### User

- `name`, `email` (unique, lowercase), `passwordHash` (Argon2id)
- `deletedAt: Date | null` (soft delete)

### Workspace

- `title`, `slug` (unique, generated from `title`, **immutable** once set — does not change if the title changes later)
- `description` (optional, ≤280 chars)
- `owner` (ref User)
- `members: [{ user: ref User, joinedAt }]` (embedded)
- `joinToken` (unique, reusable until regenerated)
- Indexes: `{ owner: 1 }`, `{ 'members.user': 1 }`, `{ slug: 1 }` unique

**Reserved slugs** (must be rejected): `workspaces`, `my-issues`, `sign-in`, `sign-up`, `join`, `api`.

### Project

- `workspace` (ref), `title`, `description` (optional, ≤500 chars)
- `labels: [ref Label]` — labels actually attached at the project level
- Index: `{ workspace: 1 }`

### ProjectMember

- `project` (ref), `user` (ref), `addedBy` (ref)
- Indexes: `{ project: 1, user: 1 }` unique, `{ user: 1 }`

### ProjectInvite

- `project` (ref), `invitedUser` (ref), `invitedBy` (ref)
- `status`: enum `PROJECT_INVITE_STATUS`
- Indexes: `{ project: 1, invitedUser: 1 }` unique, `{ invitedUser: 1, status: 1 }`
- Accepting an invite automatically creates a `ProjectMember`.

### Label

- `workspace` (ref — source of truth), `name` (≤30 chars, trimmed, unique case-insensitive within the workspace)
- `color`: enum `LABEL_COLOR`
- `scope`: enum `LABEL_SCOPE` — controls where this label is offered as an option in the UI (not a reference to where it's attached)
- Index: `{ workspace: 1 }`
- Actual attachment happens from the other side: `Workspace.labels`, `Project.labels`, `Issue.labels` each hold `[ref Label]`.

### Workspace (addition)

- `labels: [ref Label]` — labels attached at the workspace level

### Issue

- `project` (ref), `title` (1–200 chars), `description` (≤20,000 chars, optional)
- `status`: enum (default `DEFAULT_ISSUE_STATUS`)
- `priority`: enum (default `DEFAULT_ISSUE_PRIORITY`)
- `assignees: [ref User]` — each must be a member of the same workspace
- `labels: [ref Label]` (up to 10)
- `dueDate: Date | null`
- `createdBy` (ref)
- Indexes: `{ project: 1 }`, `{ assignees: 1 }`, `{ title: 'text' }`

### Comment

- `issue` (ref), `caption` (1–5,000 chars), `commentor` (ref)
- `mentions: [ref User]` — the frontend only sends ids still present in the text; the backend must verify each id is a member of the same workspace
- Index: `{ issue: 1, createdAt: -1 }` (newest first)

### Activity (audit log, read-only from the outside)

- `workspace` (ref), `issue` (ref, optional), `action` (enum), `actor` (ref), `affected` (object: `{ field, oldValue, newValue }`)
- Written automatically on every Issue/Comment change — no manual-create route.
- Indexes: `{ issue: 1 }`, `{ workspace: 1 }`

### Notification

- `recipient` (ref), `type` (enum), `sourceId` (dynamic ref depending on `type`), `project` (ref)
- `isPersonal: boolean` (visual distinction between a personal notification and a project-wide one)
- `read: boolean` (default false)
- Index: `{ recipient: 1, read: 1 }`

### SavedView

- `workspace` (ref), `user` (ref), `name` (1–60 chars)
- `filters: { status?: string[], priority?: string[], projectId?, labelIds?: string[], assigneeId?: "me"|"none"|ObjectId, overdue?: boolean }`
- `"me"` is stored literally and resolved to `req.user._id` at query time, not at save time.
- `issuesCount` is **not** a stored field — it's computed live via aggregation whenever the sidebar requests the list.
- Index: `{ workspace: 1, user: 1 }`

---

## 5. Key business rules (enforce in the service layer)

### Cascade delete (manual, inside the service — not Mongoose middleware)

```
WorkspacesService.remove():
  1. For each Project in the workspace:
     - delete its Issues (and their Comments + Activity)
     - delete its ProjectMember + ProjectInvite records
  2. delete the workspace's Labels
  3. delete workspace-level Activity (not tied to an issue) + SavedViews
  4. delete the Workspace document itself
```

Same pattern, smaller scope, when deleting a single Project.

### Workspace membership

- Joining via `joinToken` is **immediate** (no accept/reject) — anyone with the link joins instantly.
- Workspace members do **not** automatically get access to every project — project access is separate.

### Project membership

- Granted via `ProjectInvite`; the invitee can accept or reject.
- Accepting creates a `ProjectMember` automatically.
- Only the workspace **owner** can send project invites.

### User deletion (soft delete)

- `deletedAt` is set; the document stays so references don't break.
- If the user was a workspace **owner**: ownership transfers automatically to the oldest other member (by `joinedAt`) — unless the owner already transferred it manually via `POST /workspaces/:id/transfer-ownership`.
- If a regular member: removed from all workspaces automatically; any issue assigned to them keeps the issue but drops them from `assignees`.

### Comments

- Display order: **newest first**.

### Bulk actions on Issues

- Must be atomic (all succeed or all fail).
- Max 100 issues per request.
- `addLabelIds` / `removeLabelIds` — additive/subtractive, not a full replace.

### Overdue

- `dueDate < today && status NOT IN (done, cancelled)`.
- The frontend sends `today` as a query param (in the user's local timezone) rather than the backend assuming UTC.

### Dashboard aggregation

- Backend returns raw numbers (`countsByStatus` with all 6 keys + `overdueCount`); the frontend groups them into tiles (Open = backlog+todo, In Progress = in_progress+in_review, Done = done).
- `cancelled` is excluded from every tile.
- Completion Rate = `done / (total - cancelled)`.
- Critical Attention = **two separate numbers**, `urgentCount` and `overdueCount` (not summed, to avoid double-counting an issue that's both).
- Top Projects sorted by open-issue count, descending.

---

## 6. Full Route List

### Auth

```
POST   /auth/signup
POST   /auth/signin
POST   /auth/logout
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /auth/me
```

### Workspaces

```
GET    /workspaces                          (card per workspace: projectCount, issueCount, memberCount, countsByStatus, lastActivityAt)
POST   /workspaces
GET    /workspaces/:id
PATCH  /workspaces/:id
DELETE /workspaces/:id
POST   /workspaces/:id/invite                (generate/regenerate join link)
POST   /workspaces/join/:token
POST   /workspaces/:id/transfer-ownership
DELETE /workspaces/:id/members/:userId
GET    /workspaces/:id/dashboard
GET    /workspaces/:id/issues                (workspace-wide issue list, with filters)
GET    /workspaces/:id/activity
```

### Projects

```
GET    /workspaces/:workspaceId/projects     (issuesCount, openIssuesCount, membersCount, completionPercentage)
POST   /workspaces/:workspaceId/projects
GET    /projects/:id
PATCH  /projects/:id
DELETE /projects/:id
POST   /projects/:id/invite
GET    /project-invites                      (current user's pending invites)
POST   /project-invites/:id/accept
POST   /project-invites/:id/reject
```

### Issues

```
GET    /projects/:projectId/issues           (filters: status[], priority[], labelIds[], assigneeId, overdue, q, sort, page, pageSize)
POST   /projects/:projectId/issues
GET    /issues/:id
PATCH  /issues/:id
DELETE /issues/:id
PATCH  /issues/:id/assignees                 (add/remove via one endpoint)
POST   /issues/bulk
GET    /my-issues                            (+ availableLabels, grouped by workspace)
```

### Comments

```
GET    /issues/:issueId/comments             (newest first)
POST   /issues/:issueId/comments
PATCH  /comments/:id
DELETE /comments/:id
GET    /projects/:projectId/mentionable-users
```

### Labels

```
GET    /workspaces/:workspaceId/labels       (+ issueCount per label)
POST   /workspaces/:workspaceId/labels
PATCH  /labels/:id
DELETE /labels/:id
```

### Saved Views

```
GET    /workspaces/:workspaceId/saved-views  (+ issuesCount computed live)
POST   /workspaces/:workspaceId/saved-views
PATCH  /saved-views/:id                      (name only)
DELETE /saved-views/:id
```

### Activity

```
GET    /issues/:issueId/activity
```

### Notifications

```
GET    /notifications
PATCH  /notifications/:id/read
PATCH  /notifications/read-all
```

### Search

```
GET    /search?q=...&limit=8                 (global, title only, across all of the user's workspaces)
```

---

## 7. Error shape (unified)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "fields": { "email": "Email is already registered" }
  }
}
```

| Status | Use                                        |
| ------ | ------------------------------------------ |
| 400    | Validation error (with `fields`)           |
| 401    | Not authenticated / bad credentials        |
| 403    | Authenticated but not authorized           |
| 404    | Not found                                  |
| 409    | Conflict (duplicate email/slug/label name) |

---

## 8. Implementation notes

- **Auth**: Argon2id for password hashing, signed session cookie (not JWT).
- **Slug generation**: kebab-case from `title` + numeric suffix on collision, case-insensitive uniqueness check, immutable after creation.
- **Validation**: DTOs with class-validator on every endpoint; trim server-side even though the frontend also trims.
- **Timestamps**: `createdAt`/`updatedAt` automatic via `{ timestamps: true }`; `dueDate` is date-only (no time component).
