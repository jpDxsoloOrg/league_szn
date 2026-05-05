# Rivalries Feature — Ticket Index

Source plan: [`../plan-rivalries.md`](../plan-rivalries.md)
Stitch mockups: project `10219259134533090941` (Hub, Detail, Messages, Request)

19 tickets, grouped by phase. Each ticket has its own subtask list, files-touched table, acceptance criteria, and dependency links — pull whichever onto your Kanban board as cards.

## Phase 1 — Foundation
| ID | Title | Estimate | Blocked by |
|----|-------|----------|------------|
| [RIV-01](01-data-model-foundation.md) | Data model foundation (types + tables + repos + UnitOfWork) | M | — |

## Phase 2 — Backend handlers
| ID | Title | Estimate | Blocked by |
|----|-------|----------|------------|
| [RIV-02](02-core-crud-handlers.md) | Core CRUD handlers + dispatcher + serverless events | L | RIV-01 |
| [RIV-03](03-activity-feed-handler.md) | Rivalry activity feed handler | M | RIV-01, RIV-02 |
| [RIV-04](04-messaging-backend.md) | Messaging backend (post + list + audience filtering) | M | RIV-01, RIV-06 |
| [RIV-05](05-notes-backend.md) | Notes backend (storyline + plans, role-based visibility) | S | RIV-01 |
| [RIV-06](06-cross-feature-integration.md) | Cross-feature integration (matches + promos + notifications) | S | RIV-01 |

## Phase 3 — Frontend service layer
| ID | Title | Estimate | Blocked by |
|----|-------|----------|------------|
| [RIV-07](07-frontend-api-service.md) | Frontend API service layer (`rivalriesApi`) | S | RIV-02..05 |

## Phase 4 — Frontend components
| ID | Title | Estimate | Blocked by |
|----|-------|----------|------------|
| [RIV-08](08-rivalries-hub-page.md) | Rivalries Hub page (card + 3 tabs + filters + activity feed) | L | RIV-07 |
| [RIV-09](09-rivalry-detail-shell-overview.md) | Rivalry Detail shell + Overview tab | L | RIV-07 |
| [RIV-10](10-detail-tabs-matches-promos.md) | Detail tabs: Match History, Future Matches, Promos | M | RIV-09, RIV-06 |
| [RIV-11](11-detail-tab-notes-plans.md) | Detail tab: Notes & Plans | M | RIV-09, RIV-05 |
| [RIV-12](12-detail-tab-messages.md) | Detail tab: Messages (audience toggle + polling + optimistic UI) | L | RIV-09, RIV-04 |
| [RIV-13](13-request-rivalry-form.md) | Request a Rivalry form (2-step) | M | RIV-07 |
| [RIV-14](14-admin-rivalries-panel.md) | Admin Rivalries moderation panel | M | RIV-02, RIV-07 |
| [RIV-15](15-routing-nav-dashboard.md) | Routing, nav, Dashboard surface | S | RIV-08, RIV-09, RIV-13, RIV-14 |

## Phase 5 — Polish
| ID | Title | Estimate | Blocked by |
|----|-------|----------|------------|
| [RIV-16](16-localization.md) | Localization (English + German) | S | RIV-08..14 (copy stable) |
| [RIV-17](17-wiki-articles.md) | Wiki articles (English + German) | S | — |
| [RIV-18](18-seed-data.md) | Seed data for local development | S | RIV-01, RIV-02, RIV-04, RIV-05 |

## Phase 6 — Verification
| ID | Title | Estimate | Blocked by |
|----|-------|----------|------------|
| [RIV-19](19-end-to-end-verification.md) | End-to-end verification & release readiness | M | every other ticket |

## Suggested order for first 3 sprints

**Sprint 1 (foundation can ship to devtest with no UI):** RIV-01 → RIV-02 → RIV-06 → RIV-05 → RIV-04 → RIV-03 → RIV-07. Backend complete + API client wired.

**Sprint 2 (UI shell & primary flows):** RIV-08, RIV-09, RIV-13, RIV-14 in parallel. RIV-15 lands once those four are in.

**Sprint 3 (depth + polish):** RIV-10, RIV-11, RIV-12 in parallel. RIV-16, RIV-17, RIV-18 in parallel. RIV-19 closes out.

## Estimate legend
- **S** — small (≤1 day of focused work)
- **M** — medium (2-3 days)
- **L** — large (3-5 days; consider sub-splitting on the board if it sits in-progress too long)
