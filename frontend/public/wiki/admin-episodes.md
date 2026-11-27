# Admin: Episodes

The **Manage Episodes** page (**Admin → Manage Episodes**) adds the league's YouTube shows to the public [Episodes](episodes) page and runs the Live stream card on the Dashboard. Highlight clips are still uploaded under **Manage Highlights**, which used to be called Manage Videos.

Moderators and Admins can use everything on this page.

## Adding an episode

1. Click **Add Episode**
2. Paste the YouTube link into **YouTube link**. Normal watch links, youtu.be short links, Shorts, live and embed links all work, and extra bits such as a start time are ignored
3. Click **Fetch details**. A preview shows the thumbnail, the video's title and the channel
4. Check the **Title** and change it if you like, then add a **Description** if you want one
5. Set the **Air date**. It starts as today, because YouTube doesn't send the date, so change it to the day the show aired
6. Pick an **Event** if the episode belongs to one, or leave **No event**
7. Tick **Published** when it's ready, then save

The list shows newest air dates first, with the thumbnail, title, event and status of each episode.

## When details can't be fetched

If the link isn't a YouTube video, you get an error straight away. Playlist and channel links don't work: open one video and copy its link.

Sometimes YouTube doesn't send the details, for example for a private video or one with embedding turned off. You then see **Couldn't fetch details from YouTube; enter a title**. Type the title yourself and save as normal. The thumbnail still works. If embedding is off, the video won't play on the site, but **Watch on YouTube** still opens it.

If the video is already an episode, the preview warns you, and saving it a second time is refused.

## Drafts and publishing

A new episode is a draft until you tick **Published**. Drafts don't show on the public page, and their link only opens for staff, so you can check the episode page before anyone else sees it. Untick **Published** to hide an episode again.

## Linking an event

Choose the event in the **Event** field. The episode page then shows the event's card and results, and the event page gets a **Watch the episode** button. Pick **No event** to remove the link.

If the linked event is deleted later, the list shows a warning badge on the episode. The episode page simply stops showing the card. Edit the episode to pick another event or **No event**.

## Linking highlights

You link highlight clips from **Manage Highlights**, not from the episode form. Edit a clip (or upload a new one) and choose the episode in **Linked episode**. Pick **None** to remove the link. The clip then shows on the episode page under **Highlights from this episode**, and on the Highlights tab with a link to the episode.

Only published clips appear on the episode page. Linking a draft clip leaves it a draft.

Wrestlers who upload their own clips under **My Videos** can't link them to an episode. Staff do that afterwards in Manage Highlights.

Uploading clips works as before: video file, thumbnail, category, tags and **Published** in Manage Highlights.

## Deleting an episode

Click **Delete** on a row and confirm. Any highlight clips linked to it stay on the site, they just lose the link.

## Live stream

The **Live stream** panel on this page controls the Live card on the [Dashboard](dashboard). There's no automatic detection: the card shows only while you've marked the stream live.

1. Enter the league's Twitch **Channel** once. It's the name in the channel's address, for example `leagueszn` from `twitch.tv/leagueszn`, with 4 to 25 letters, numbers or underscores. It stays saved for the next show
2. Add a **Title** if you like, such as "Season 5 Night 1". Without one, the card reads **Live now on Twitch**
3. Click **Go live** when the stream starts. The card appears on the Dashboard within a minute, and the panel shows when the stream went live and when the card will switch off
4. Click **End stream** when the show is over

You can't go live without a channel. Changing the title while live keeps the original start time.

If you forget **End stream**, the card switches itself off 8 hours after you went live.
