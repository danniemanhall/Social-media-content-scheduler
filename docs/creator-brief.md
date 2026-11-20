# Creator brief (month brief for the content creator)

The **Creator brief** tab shows a month's planned posts as one calm card each
(date, format, pillar, photos to take, photos to use, Canva size, caption and a
note from the team), with a shoot list grouped by photo session on top.

- **Copy link for your creator** gives a read-only link: `/brief/<token>?m=YYYY-MM`.
  It always shows the latest plan; the arrows on the page move between months.
- **Open to print or save PDF** opens the same page; its button prints it.
- **Notes for her** saves a note on each post (`briefNote`), shown on its card.
- **Make a new link** replaces the token (D1 setting `secret:brief`), so the old link stops working.

Photo previews come through Roopip's shared Drive connection (server/google.ts).
Without it, the cards list the file names instead.

## Letting the creator in (Cloudflare Access)

The whole site sits behind the Access app "Roopip Content Calendar" (team only).
To let the creator open the brief and nothing else, add a second, path-scoped
Access application:

- Application domain: `roopip-content-calendar.pages.dev`, path `brief`
- Policy "Roopip brief": Allow, emails = the team plus the creator's email
- Login method: one-time PIN; session duration: 1 month

The more specific path wins, so the creator can open `/brief/...` but the
calendar and `/api/` still need the team policy. Nothing she can reach
changes data: the brief only answers GET requests.
