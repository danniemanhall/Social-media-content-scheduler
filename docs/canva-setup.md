# Switch on the Canva browser

The post flow's first question is "Do you want to fetch a design from Canva?". Saying yes opens Roopip's Canva designs inside the app, so you can pick one and pull it straight into the post at the right size. That needs a one-time setup (about 10 minutes, free).

Until it's done, the app falls back to the old way: paste the design's link and Claude exports it on its next run.

## 1. Create the integration in Canva

Do this **signed in to the Canva account that holds Roopip's approved designs**.

1. Go to <https://www.canva.com/developers/integrations> and click **Create an integration**.
2. Choose **Public**, name it "Roopip content calendar" and accept the terms. (It stays unlisted and only you use it. Private integrations need a Canva Enterprise plan.)
3. Under **Scopes**, tick:
   - `design:meta` **Read**
   - `design:content` **Read**
   - `profile` **Read**
4. Under **Authentication**, add this redirect URL exactly:

   ```
   https://roopip-content-calendar.pages.dev/api/canva/callback
   ```

5. Under **Configuration**, copy the **Client ID**, then click **Generate secret** and copy the **Client secret**. Keep the secret private.

You don't need to submit the integration for review. Unreviewed integrations work for the account that created them, which is all the calendar needs.

## 2. Give the app the two values

In Cloudflare: **Workers & Pages → roopip-content-calendar → Settings → Variables and Secrets → Add**, for **Production**:

| Name | Type | Value |
| --- | --- | --- |
| `CANVA_CLIENT_ID` | Secret | the Client ID |
| `CANVA_CLIENT_SECRET` | Secret | the Client secret |

Then redeploy (Deployments → the latest one → Retry deployment), so the app picks them up.

## 3. Connect once

Open any post, click **Yes, choose a design**, then **Connect Canva** and allow access. From then on everyone using the calendar sees Roopip's designs. The connection is kept on the server; **Disconnect** isn't in the app yet, so to cut it off, delete the integration in Canva or remove the secret in Cloudflare.

## How it works

- Designs are listed newest first, with search. Each one says whether it fits the post's shape (9:16 for stories and reels, 4:5 for grid posts).
- Pulling one in exports every page at 1080 px wide (JPG, or MP4 for animated designs), saves the files to the **Roopip Canva designs** folder in Drive and adds them to the post. A 4-page design becomes a 4-frame story, or a carousel on a grid post.
- Anything not quite the right shape is cropped, centred, when the post goes out.
