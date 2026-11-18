# Keep Google Drive connected (one time, about 5 minutes)

By default the app has to sign in to Google Drive on every visit. With these two steps, someone connects once as **carli@roopip.co.za** and Drive stays connected for everyone until they click **Sign out of Drive** on the Media tab.

## 1. Give Cloudflare the Google client secret

1. In [Google Cloud console](https://console.cloud.google.com/), open the project the app uses, then **Google Auth Platform**, then **Clients**.
2. Open the web client (its ID starts `826846003906-`).
3. Under **Client secrets**, copy the secret. If none is shown, click **Add secret** and copy the new one.
4. In Cloudflare, go to **Workers & Pages**, then **roopip-content-calendar**, then **Settings**, then **Variables and Secrets**.
5. Click **Add**, choose type **Secret**, name it `GOOGLE_CLIENT_SECRET`, paste the value, and save it for **Production**.
6. Deploy again: under **Deployments**, open the latest production deployment and click **Retry deployment**. Secrets apply to new deployments.

Keep the secret out of chats and documents.

## 2. Move the Google sign-in out of "Testing"

While the Google app is in **Testing**, Google cancels saved sign-ins after 7 days, so Drive would ask to connect again every week.

1. In Google Cloud console, go to **Google Auth Platform**, then **Audience**.
2. Under **Publishing status**, click **Publish app** and confirm.

Google doesn't need to review the app for Roopip's own use. The sign-in pop-up then shows a "Google hasn't verified this app" screen. Click **Advanced**, then **Go to Roopip Content Calendar**. That's expected for a private app, and it only shows when someone connects.

## Then

Open the app, go to **Media**, click **Connect Google Drive** and choose carli@roopip.co.za. That's the last time anyone needs to.
