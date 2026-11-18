# Tagging photos and videos

The app can't see pictures, so it suggests photos for a post from what you write here. It draws "contact sheets": 4 × 4 grids of thumbnails, numbered 1 to 16, left to right and top to bottom. Videos carry a "VID" label. The app saves the sheets to the **Roopip photo index** folder in Drive and lists them in the `tagSheets` setting.

Tag up to 8 sheets a run (128 files).

1. Read the sheets and the tags:

   ```sql
   SELECT key, value FROM settings WHERE key IN ('tagSheets', 'mediaTags', 'mediaIndex')
   ```

   `tagSheets.value` is `{ "sheets": [{ fileId, name, at, items: [mediaId, ...], done? }] }`. Work on sheets without `done: true`, oldest first. `mediaIndex` gives each file's `name` and folder `path`, which can help (for example, a "Placemats Set of 4" folder).
2. For each sheet, download it with the Google Drive connector (`download_file_content` with `fileId`) and look at it. Cell `n` is `items[n - 1]`. If a sheet can't be downloaded, skip it and say so.
3. Write one entry per cell into `mediaTags` (type `MediaTags` in `src/lib/tags.ts`), keyed by media id:

   ```json
   {
     "scene": "lifestyle | product | process | detail",
     "setting": "dining table",
     "subjects": ["oval bowl", "lemons", "linen napkin"],
     "products": ["Oval Bowls"],
     "people": false,
     "hands": false,
     "packaging": false,
     "text": "Natural oval bowl of lemons on a linen-covered dining table, soft window light.",
     "at": "<now, ISO>"
   }
   ```

   - **Plain words.** Say what's actually visible. Don't guess at things you can't see, and keep `text` to one sentence of at most 20 words.
   - **`scene`:**
     - `product` is a studio or plain-backdrop shot of the product on its own.
     - `lifestyle` is styled or in use in a real room or outdoors.
     - `process` is making, hands at work or the workshop.
     - `detail` is a close-up of texture or stitching.
   - **`setting`:** a few words, such as "white studio", "kitchen counter", "living room", "workshop bench", "market stall" or "packing table".
   - **`products`:** use the family names from the product sheet: Bowls, Oval Bowls, Baskets, Planters, Placemats, Runners, Coasters, Trivets, Carrier Bags. Leave it empty if no Roopip product is clear.
   - **`packaging`:** true for boxes, tissue, labels, tape, or orders being packed or sent.
   - **Logos:** for a logo or graphic rather than a photo, use `"scene": "product"`, `"setting": "graphic"`, and say so in `text`.
4. Save by merging. Read `mediaTags` again just before writing, add your entries, and write the whole object back:

   ```sql
   INSERT INTO settings (key, value) VALUES ('mediaTags', ?1)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value
   ```

   Then mark each finished sheet `done: true` in `tagSheets` the same way: read, change only `done`, write.
5. In the summary, say how many files you tagged and how many sheets are left.
