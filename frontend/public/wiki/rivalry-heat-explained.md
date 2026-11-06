# How Rivalry Heat Works

A rivalry's heat reacts to how its matches are rated and to the promos tied to it. The tier shows on the rivalry's card and page, and you can filter by it on the Rivalries hub.

## The five tiers

| Tier        | Vibe                                    |
|-------------|-----------------------------------------|
| Frozen      | Pure poison — nothing is clicking       |
| Cold        | Below average matches                   |
| Warm        | The default; matches are roughly fine   |
| Hot         | Consistent ★★★★ banger after banger     |
| Scorching   | All-time stuff. Match of the Year talk  |

## The formula (for the curious)

These are the standard values. An Admin can change them under Heat Tunables.

Each rated match in a rivalry contributes points to the heat score:

`contribution = (matchAverage − 2.5) × weight`

where `weight = min(ratingsCount, 5)`. The 2.5 is the neutral pivot — a match rated exactly 2.5 stars doesn't move heat. Higher ratings add heat; lower ratings subtract. A match marked **Match of the Night** counts 1.5 times as much, in either direction.

Call-Out and Rivalry promos tagged to the rivalry add heat too. Each one adds 3 points. Fire reactions add 1.4 points each and Trash reactions take away 1.4. Only the first 5 of each count, and reactions can move a single promo's total by 7 points at most. Promos hidden by staff don't count.

The sum is clamped to `[−100, +100]` and mapped to a tier:

| Score range | Tier      |
|-------------|-----------|
| ≥ +60       | Scorching |
| +20 … +59   | Hot       |
| −19 … +19   | Warm      |
| −59 … −20   | Cold      |
| ≤ −60       | Frozen    |

If the thresholds feel wrong, tell a GM.

## Staff notes

GMs can manually override a rivalry's heat in Admin → Rivalries. The next rating, Match of the Night change or heat-counting promo activity in that rivalry recomputes heat from scratch, overwriting any manual value. Use the "Recompute from ratings" button to force this without waiting.
