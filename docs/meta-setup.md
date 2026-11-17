# Connecting Instagram and Facebook (one time, about 20 minutes)

Auto-posting uses Meta's free Graph API. Roopip's own accounts can post through it without Meta's app review, because the people who use it have roles on the app.

## What has to be true first

- Roopip's Instagram is a **professional account** (Business or Creator). Check this in Instagram: Settings, then Account type and tools.
- That Instagram account is **linked to the Roopip Facebook Page**. Check this in Meta Business Suite: Settings, then Accounts, then Instagram accounts.
- You are an admin of the Facebook Page.

## 1. Create the Meta app

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) and click **Create app**.
2. Name it **Roopip Calendar** and use your own email.
3. For the use case, pick **Other**. For the app type, pick **Business**.
4. When it asks about a business portfolio, choose Roopip's if there is one. Otherwise skip it.
5. Leave the app in **Development** mode. That is enough for posting to Roopip's own accounts.

## 2. Get a Page token that doesn't expire

1. Open the [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. On the right, under **Meta App**, choose *Roopip Calendar*.
3. Under **User or Page**, choose *Get User Access Token*.
4. Add these permissions, then click **Generate Access Token** and approve the Roopip Page and Instagram account:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `instagram_basic`
   - `instagram_content_publish`
   - `business_management`
5. Copy the token and paste it into the [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/). Click **Extend Access Token**, then copy the long-lived token it shows.
6. Back in the Explorer, paste the long-lived token into the token box. Run `GET me/accounts?fields=name,id,access_token`.
7. Find the Roopip Page. Note its `id`; this is the **FB_PAGE_ID**. Copy its `access_token`; this is the **META_TOKEN**. A Page token made from a long-lived user token doesn't expire.
8. Run `GET <FB_PAGE_ID>?fields=instagram_business_account`. The `id` inside `instagram_business_account` is the **IG_USER_ID**.

## 3. Give the publisher the three values

In the Roopip Cloudflare account:

1. Go to **Workers & Pages**, open **roopip-publisher**, then **Settings**, then **Variables and Secrets**.
2. Add three values, each with type **Secret**:
   - `META_TOKEN`
   - `IG_USER_ID`
   - `FB_PAGE_ID`
3. Click **Deploy**.

Keep the token out of chats and documents. Anyone with it can post as Roopip. If it ever leaks, change your Facebook password. That cancels the token, and you can make a new one with the steps above.

## How posting works after that

1. Carli approves a post.
2. **Schedule for …** in the post's *Posting* section hands its files to the R2 outbox.
3. Every 15 minutes the publisher posts whatever is due:
   - photos and carousels go to Instagram and the Facebook Page
   - reels go to Instagram as reels and to Facebook as a video
   - stories go to Instagram only
4. The post moves to *Posted* with a link, and its files are deleted from the outbox.
5. If Meta refuses three times, the post goes back to *Approved* with Meta's reason on it.

Reels set to *Instagram music* are never auto-posted. Download them and add the sound in Instagram.
