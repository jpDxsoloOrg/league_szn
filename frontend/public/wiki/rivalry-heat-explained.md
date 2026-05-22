# How Rivalry Heat Works

A rivalry's heat reacts to how its matches are rated. The hotter a rivalry, the more visible it is on the Hub and Dashboard.

## The five tiers

| Tier        | Vibe                                    |
|-------------|-----------------------------------------|
| Frozen      | Pure poison — nothing is clicking       |
| Cold        | Below average matches                   |
| Warm        | The default; matches are roughly fine   |
| Hot         | Consistent ★★★★ banger after banger     |
| Scorching   | All-time stuff. Match of the Year talk  |

## The formula (for the curious)

Each rated match in a rivalry contributes points to the heat score:

`contribution = (matchAverage − 2.5) × weight`

where `weight = min(ratingsCount, 5)`. The 2.5 is the neutral pivot — a match rated exactly 2.5 stars doesn't move heat. Higher ratings add heat; lower ratings subtract.

The sum is clamped to `[−100, +100]` and mapped to a tier:

| Score range | Tier      |
|-------------|-----------|
| ≥ +60       | Scorching |
| +20 … +59   | Hot       |
| −19 … +19   | Warm      |
| −59 … −20   | Cold      |
| ≤ −60       | Frozen    |

The values are tunable in `backend/lib/policies/rivalryHeat.ts` — file a bug in the GM channel if the thresholds feel wrong.

## Admin notes

Admins can manually override a rivalry's heat in the Admin → Rivalries panel. The next user rating against a match in that rivalry will recompute heat from scratch, overwriting any manual value. Use the "Recompute from ratings" button to force this without waiting.
