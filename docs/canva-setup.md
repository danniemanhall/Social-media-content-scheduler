# Switch on the Canva browser

The post flow's first question is "Do you want to fetch a design from Canva?". Saying yes opens Roopip's Canva designs inside the app, so you can pick one and pull it straight into the post at the right size. That needs a one-time setup (about 10 minutes, free).

Until it's done, the app falls back to the old way: paste the design's link and Claude exports it on its next run.

## 1. Create the app in Canva's Developer Portal

Canva now calls these "apps" (Connect API integrations were folded into apps). Do this **signed in to the Canva account that holds Roopip's approved designs**.

1. Go to **Your apps** in the Canva Developer Portal (<https://www.canva.com/developers/apps>) and click **Create an app**.
2. Name it "Roopip calendar" (18 characters at most).
3. Under **Who can use your app?**, choose **Anyone on Canva (public)**. This can't be changed later. It stays unlisted unless you submit it for review, and you don't need to. "Restricted to your Canva team" needs a Canva Enterprise plan, and "No Canva sign-in required" uses paid API credits, so don't pick either.
4. Accept the terms and click **Create app**.
5. Go to **Outside Canva** and click **Start integrating**. On **Outside Canva → Configuration**, check that **Canva REST APIs** is turned on.
6. Under **Credentials**, copy the **Client ID**. Then click **Generate secret** and copy the **Client secret**. It's only shown once, so keep it somewhere private.
7. Under **Scopes**, tick:
   - `design:meta`: **Read**
   - `design:content`: **Read**
   - `profile`: **Read**
8. Go to **Outside Canva → Redirect URLs** and put this in **URL 1**, exactly as written:

   ```
   https://roopip-content-calendar.pages.dev/api/canva/callback
   ```

9. Leave **Return navigation** off.

## 2. Give the app the two values

In Cloudflare: **Workers & Pages → roopip-content-calendar → Settings → Variables and Secrets → Add**, for **Production**:

| Name | Type | Value |
| --- | --- | --- |
| `CANVA_CLIENT_ID` | Secret | the Client ID |
| `CANVA_CLIENT_SECRET` | Secret | the Client secret |

Then redeploy (Deployments → the latest one → Retry deployment), so the app picks them up.

## 3. Connect once

Open any post, click **Yes, choose a design**, then **Connect Canva** and allow access. From then on everyone using the calendar sees Roopip's designs. The connection is kept on the server; **Disconnect** isn't in the app yet, so to cut it off, delete the app in Canva or remove the secret in Cloudflare.

## How it works

- Designs are listed newest first, with search. Each one says whether it fits the post's shape (9:16 for stories and reels, 4:5 for grid posts).
- Pulling one in exports every page at 1080 px wide (JPG, or MP4 for animated designs), saves the files to the **Roopip Canva designs** folder in Drive and adds them to the post. A 4-page design becomes a 4-frame story, or a carousel on a grid post.
- Anything not quite the right shape is cropped, centred, when the post goes out.
