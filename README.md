# ContextVN — Inline Images for SillyTavern

**Prototype v0.1.1 — not yet tested end-to-end on a running SillyTavern instance.**

ContextVN displays user-supplied images inline in assistant messages when the narrator emits [IMG: character/action] or [PHOTO: character/action]. Missing actions fall back to that character's default image.

## Installation

In SillyTavern, open Extensions → Install Extension, then paste:

https://github.com/Diego-Estevez/MVP-extension

**Important:** The repository is currently **private**. Installing by URL may fail without authentication. To make it publicly installable, change repository visibility in GitHub Settings → General → Danger Zone → Change repository visibility (only if you want to publish the code).

## Usage

Open the **🖼 ContextVN** panel in SillyTavern.

Create a visual profile (e.g. oakridge), then upload images for a character. You can upload images individually or select a batch with filename format:

- angela_white__default.webp
- angela_white__cooking.webp
- angela_white__stern.webp
- lana_rhoades__default.webp

Then instruct the narrator to write markers:

```text
[IMG: angela_white/cooking]
*Angela stirs the sauce.*
Angela White: "Dinner is almost ready!"

[IMG: angela_white/stern]
Angela White: "Did you hear me?"
```

Use **[PHOTO: character/action]** when a character intentionally sends a picture in the story.

An unrecognized action falls back to default. If no image exists, an informational placeholder is displayed.

## How it works

- JavaScript and CSS SillyTavern UI extension.
- Stores image bytes in **browser IndexedDB**; does not upload images to GitHub or SillyTavern server.
- Stores profile configuration via SillyTavern extension settings.
- Uses chat metadata for per-chat profile selection when available.
- Changes only the rendered chat DOM, never the stored assistant text.
- Supports PNG, JPG, GIF, WebP up to 25 MB per image.
- No ComfyUI connection or automatic image generation.
- Full visual novel player and automatic interpretation of prose are **not yet implemented**.

## Troubleshooting

If the panel does not appear, open your browser console (F12) and inspect errors. Try a full refresh after install. This is an early prototype and may require adjustments for specific versions of SillyTavern.

## Files

- `manifest.json` — SillyTavern extension metadata
- `index.js` — UI, browser storage and inline rendering
- `core.mjs` — structured marker parsing and fallback
- `style.css` — extension panel and inline image styling
- `NARRATOR_PROMPT_EN.txt` — instructions for the storyteller

## Privacy

Only upload images you have permission to use. Because images are stored in IndexedDB, clearing browser site data can delete the image library; keep copies of your originals.
