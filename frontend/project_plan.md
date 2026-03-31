# KBC Communication Centre — Project Plan

## 1. Project Description
An enterprise internal communication platform for Kent Business College (KBC), replacing email dependency with a centralised SharePoint-style hub. Target users are non-technical staff at all levels. The platform delivers announcements, tracks priorities, manages risks, and improves organisational compliance — all in a clean, dashboard-focused UI.

## 2. Page Structure
- `/` — Homepage (hero, alerts, news feed, priority snapshot, risk summary, events, feedback)
- `/news` — News & Announcements (filter by audience, priority, department)
- `/dashboard` — Priority Dashboard (RAG-coded initiative table + card views)
- `/risk-register` — Risk & Issues Register (restricted access, full risk table)
- `/documents` — Policies & Documents Library (categorised, versioned, sensitivity labels)
- `/departments` — Departments Overview (all department cards)
- `/departments/:dept` — Individual Department Pages (dept-specific news and content)
- `/events` — Events & Deadlines Calendar
- `/feedback` — Feedback Form

## 3. Core Features
- [x] Phase 1: Homepage with hero, quick actions, news feed, priority snapshot, risk widget, events widget, feedback strip
- [x] Phase 1: Global top navigation and footer
- [ ] Phase 2: News & Announcements full page (filters, acknowledgement tracking, expiry)
- [ ] Phase 3: Priority Dashboard full page (table view + card view, sorting, filtering)
- [ ] Phase 4: Risk Register full page (restricted access banner, full risk table)
- [ ] Phase 5: Documents Library full page (categories, sensitivity labels, versions)
- [ ] Phase 6: Departments overview + individual department pages
- [ ] Phase 7: Events calendar page + Feedback form page

## 4. Data Model Design
No Supabase — all mock data during development.

### Mock: News Items
| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique ID |
| title | string | Headline |
| excerpt | string | Short description |
| audience | string | Target audience |
| department | string | Owning department |
| priority | critical/important/general | Alert level |
| date | string | Published date |
| requiresAcknowledgement | boolean | Needs staff sign-off |
| isExpired | boolean | Past expiry date |

### Mock: Priority Initiatives
| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique ID |
| initiative | string | Initiative name |
| owner | string | Responsible person |
| department | string | Owning department |
| deadline | string | Target date |
| status | on-track/at-risk/delayed | RAG status |
| lastUpdated | string | Last update date |

### Mock: Risks
| Field | Type | Description |
|-------|------|-------------|
| id | string | Risk ID |
| description | string | Risk description |
| level | high/medium/low | Risk level |
| impact | 1-5 | Impact score |
| likelihood | 1-5 | Likelihood score |
| owner | string | Risk owner |
| mitigation | string | Mitigation plan |
| reviewDate | string | Next review date |
| status | open/mitigated/closed | Current status |

### Mock: Events
| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique ID |
| title | string | Event name |
| date | string | Event date |
| department | string | Organising dept |
| type | meeting/deadline/training/external | Event type |

### Mock: Documents
| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique ID |
| title | string | Document title |
| type | policy/sop/template/form | Category |
| sensitivity | public/internal/confidential | Label |
| version | string | Version number |
| reviewDate | string | Next review |
| department | string | Owning dept |

## 5. Backend / Third-party Integration Plan
- Supabase: Not needed in Phase 1–7 (mock data). Consider for Phase 8 if real data persistence required.
- Microsoft Teams integration: Simulated via UI indicators only.
- Power BI dashboards: Simulated via chart components.

## 6. Development Phase Plan

### Phase 1: Homepage + Global Navigation (CURRENT)
- Goal: Build the complete homepage and navigation shell so all key sections are visible
- Deliverable: Fully designed homepage with hero, quick actions, news feed, priority snapshot, risk widget, events widget, feedback strip; top nav with all route links

### Phase 2: News & Announcements Page
- Goal: Full news page with filters, priority highlighting, acknowledgement badges
- Deliverable: Filterable news list with audience/department/priority filters, critical alert banners

### Phase 3: Priority Dashboard Page
- Goal: Full priority tracking dashboard with table and card view
- Deliverable: RAG-coded initiative table, card grid toggle, department/status filters

### Phase 4: Risk Register Page
- Goal: Secure risk tracking area with restricted access warning
- Deliverable: Risk table with level/impact/likelihood columns, severity colour coding

### Phase 5: Documents Library Page
- Goal: Organised document repository with categories and labels
- Deliverable: Category tabs, document cards with sensitivity labels and version info

### Phase 6: Departments Pages
- Goal: Department overview + individual department pages
- Deliverable: Departments grid page, individual pages for HR, Finance, Marketing, Operations, IT, Leadership

### Phase 7: Events & Feedback Pages
- Goal: Events calendar and feedback submission form
- Deliverable: Events list/calendar view, feedback form with category and message fields
