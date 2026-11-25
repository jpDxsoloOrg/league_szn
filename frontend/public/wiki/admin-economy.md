# Economy

Contracts, wallets, fines and the shop. This page covers the GM side. For what players see, read [Contracts and Money](contracts-and-money).

## Switch it on first

The economy sits behind the **Economy** feature flag, and it's **off** until you turn it on. While it's off, players see none of it: no **My Contract**, **Free Agents** or **Shop** pages, no wallet card and no Fines buttons.

1. Set up the **Economy Settings** first (see below), so the first offers and purchases use your numbers.
2. An Admin opens **Admin → Feature Management** and switches on **Economy**.

You can switch it off again at any time. Nothing is deleted: contracts, balances and history are all still there when you switch it back on.

## Economy Settings

**Admin → Economy Settings**. Admins can change these; Moderators can read them.

| Section | What you set |
|---------|--------------|
| **Currency** | The name and symbol of the league's money. |
| **Contract defaults** | Starting terms for each contract type: tryout length, pay per match, weekly salary and win bonus. Every new offer starts from these, and you can change them on any single offer. |
| **Bonuses, offers and fines** | The free agent win bonus, how many days an offer stays open, and the no-show fine. |
| **Fine presets** | One-click fines with a label and an amount, such as pause abuse. |
| **Shop items** | Switch each item on or off and set its price and effect. Items that are off stay out of the shop. |
| **Season budget check** | What a season contract pays over a season with the terms above, so you can sanity-check shop prices and fines. |

Every save is a new version. Changes only apply from then on: to new offers, fines and purchases. Signed contracts keep the terms they were signed with. If someone else saved while you had the page open, you're asked to reload and make your changes again.

## Contracts desk

**Admin → Contracts** has four tabs: **Active**, **Offered**, **Free agents** and **History**.

- **Offer contract**: pick the player and the contract type. The terms start from the defaults and you can change them. Add a note if you like: the player sees it. A season contract is always for the active season, and a tryout pays per match only. Players need a linked account to answer an offer.
- **Withdraw** an open offer before the player answers it.
- **Release** an active contract. It ends straight away and the player becomes a free agent. A reason is required, and the player sees it.
- **Adjust balance** (Admins only): add money, or take it away with a minus sign. A reason is required, and the player sees the change in their wallet as a balance correction. The balance can go below zero.

The player gets a notification for each offer and answers it from **My Contract**. Offers nobody answers expire on their own, and the GM who made the offer is told. When a player accepts one offer, their other open offers are withdrawn.

The **Free Agents** page is public, and you can offer a contract straight from it too.

## What runs on its own

- **Match pay**: when you record a result, everyone in the match gets their pay per match, and the winners get their win bonus. Free agents get only the free agent win bonus. The match also counts toward each player's contract, and a tryout or match contract ends when its last match is played.
- **Payroll**: every Sunday (league time), everyone with an active contract that has a weekly salary gets paid.
- **End of season**: when you end a season, every season contract for it ends and those players become free agents.
- **Deleting a completed match** takes its pay and bonuses back and removes it from the players' contract counts.

## Fines and no-shows

- **Fines**: use the **Fines** button on the player's row in [Manage Players](admin-manage-players). Pick a preset or enter a custom amount. A custom fine needs a reason. The player sees the reason with the fine. **Past fines** lists them, and **Rescind** refunds one.
- **No-shows**: use the **No-shows** button on a match, on the event card, in **Standalone Matches** or when recording a result. You can mark a no-show on a scheduled match, or on a completed one for 7 days after its result. Marking it charges the no-show fine from the settings. If it's marked before the result goes in, the player gets no match pay for that match. **Undo** refunds the fine. The match itself isn't changed: record the result as usual.

Admins and Moderators can fine and mark no-shows. A fine can push a player into debt. They get a notification, and the shop stays locked for them until their balance is back to zero or more.

## GM interference queue

Players can pay up front for **GM interference** and ask for anything. Their requests wait in **Admin → GM Interference**. It shows **Pending** requests by default; switch the filter to see the rest.

Click **Resolve** and pick an outcome:

| Outcome | Money |
|---------|-------|
| **Delivered** | You did what they asked. The league keeps the money. |
| **Partly delivered** | You did some of it. The league keeps the money. |
| **Take the money** | You do nothing and keep the money. The player reads "The GM took your money. Better luck next time." |
| **Refund** | You turn it down and the money goes back to the player. |

Add a **note to the player** if you want them to know why, and a **staff note** that only GMs see. The player gets a notification with the outcome. You can't resolve your own request: another GM has to do it. Each player can only have one request waiting at a time.

## The shop and sim interference

Every shop item can be bought now. The injury shield, rehab and stamina top-up act on stamina and injuries, so they only make a difference while the **Stamina & Injuries** flag is on; see [Admin: Injuries](admin-injuries).

Sim interference is bought for one scheduled match the player is in. Who bought it is private: GMs see every boost on a match, each player sees only their own. If you record that match by hand instead of simulating it, or delete it, the player gets their money back automatically.
