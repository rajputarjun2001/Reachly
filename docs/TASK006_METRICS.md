# Task 006 — Dashboard & Analytics metric mapping

## Available from database (live mode)

| UI element | Source |
|------------|--------|
| Total leads | `count(leads)` per workspace |
| Lead lists count | `count(lead_lists)` |
| Campaign count | `count(campaigns)` |
| Campaigns by status | `campaigns.status` tallied |
| Active (configuration) | `status = active` count |
| Draft campaigns | `status = draft` count |
| Recent campaigns table | `campaigns` + list lead count + step count |
| Leads added (7d) chart | `leads.created_at` bucketed (bounded sample) |
| Leads by list chart | `lead_lists` + nested lead counts |
| Leads created (30d) chart | `leads.created_at` bucketed |

## Not available (execution not implemented)

| Former demo metric | Live behavior |
|--------------------|---------------|
| Connections sent, accepted, replies, meetings | Banner + "Not tracked yet" / omitted |
| Acceptance / reply / meeting rates | Not shown |
| Outreach activity (Sent vs Accepted) | Replaced with leads-added trend |
| Outreach funnel (Sent → Meetings) | Replaced with campaign status breakdown |
| Best days to send | Removed |
| Reply rate by message step | Removed |
| Campaign comparison (sent, accept %, meetings) | Replaced with list lead counts |

## Demo preview

When Supabase is not configured, `PreviewSwitch` + labeled demo screens remain unchanged.
