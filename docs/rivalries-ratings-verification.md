# Rivalries — Match Ratings & Heat (RIV-20..33) — Manual Verification

Companion checklist to `rivalries-verification.md`, focused on the
match-ratings, Match-of-the-Night, and rivalry-heat surfaces added in
the RIV-20…RIV-33 wave. Run against a freshly-seeded devtest
environment.

## Setup

1. `cd backend && npm run clear-data && npm run seed`
   (or POST to the `/admin/seed` endpoint as an Admin) — the seed now
   plants:
   - 5 completed matches in the "Bottom Line vs. The People's Champ"
     rivalry, all rated ~5 stars → rivalry tier `scorching`
     (first match flagged Match of the Night).
   - 3 completed matches in the "Tribal Chief vs. Cenation Leader"
     rivalry, all rated ~1 star → rivalry tier `cold`.
   - The third rivalry stays `warm` (no rated matches).
2. Sign in as the seeded Wrestler user; have a separate browser /
   incognito for an Admin session.

## Wrestler flows

- [ ] Visit Events → pick a completed event → see star strip with `(N)`
      count next to each match.
- [ ] Click 4.5 stars on an unrated completed match → widget locks with
      "Thanks for rating!" + read-only stars.
- [ ] Reload the page → widget still shows the rated state
      (server-confirmed).
- [ ] Direct API hack: `curl -X POST` the same match endpoint with a
      fresh rating → 409 returned.
- [ ] Try to rate a `scheduled` (future) match — widget should not
      render.
- [ ] Sign out → widget on a completed match shows "Sign in to rate".

## Admin flows

- [ ] On the same completed match, see the MOTN button (Wrestler does
      not).
- [ ] Click "Mark as Match of the Night" → button flips to "Remove",
      badge appears in match lists.
- [ ] Click again → un-marks.
- [ ] Confirm the MOTN checkbox is GONE from the Record Results form.
- [ ] Admin → Rivalries: change a rivalry's heat manually via the
      dropdown → row updates.
- [ ] Click "Recompute from ratings" on that row → heat may revert (if
      recompute disagrees).

## Heat propagation

- [ ] Pick the "Bottom Line" rivalry → confirm its heat tier reads
      `scorching` after seed.
- [ ] Pick the "Tribal Chief vs. Cenation Leader" rivalry → confirm
      `cold` after seed.
- [ ] Rate a low-rated match in the cold rivalry with 5 stars → after
      refresh, rivalry's heat tier increases (or score moves toward
      hot).
- [ ] Rate a high-rated match in the scorching rivalry with 0.5 stars
      → heat decreases.

## Stats / display

- [ ] BestMatches stat page: matches sorted by star rating, counts
      shown.
- [ ] Switch locale to German → all new strings translated (not English
      fallbacks).
- [ ] Wiki: `/guide/wiki/rate-matches` loads,
      `/guide/wiki/rivalry-heat-explained` loads.
- [ ] Old wiki references to "MOTN at result entry" are gone.

## Backend-only validation

- [ ] Run `npm run backfill-rivalry-heat` against devtest → idempotent,
      sensible values logged. Output should match the seeded tiers
      (scorching / cold / warm) on the first run and report 0 changes
      on the second.
- [ ] tsc + vitest + frontend lint all clean.

## Notes

The seed plants synthetic rater identities (`seed-rater-1` …
`seed-rater-8`) directly into the MatchRatings table so the
"already-rated" badge and aggregate counts populate without needing
real users. These IDs are not Cognito users; they exist only for
seed visualisation and are wiped on every re-seed.
