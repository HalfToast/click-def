# Submitting to addons.mozilla.org

Internal notes for publishing Click Define to AMO. Not user-facing.

## Build the zip

```powershell
./build.ps1
```

Produces `click-define.zip` in the project root.

## Upload

<https://addons.mozilla.org/developers/addon/submit/distribution>

## What Mozilla asks for

1. **Source code** — this extension is unminified vanilla JS, so the uploaded zip *is* the source. No separate source upload needed.
2. **Privacy policy** — paste the contents of [PRIVACY.md](PRIVACY.md) into the AMO listing's privacy field.
3. **Permissions justification** — when prompted:
   - `storage` — persist user settings.
   - `host_permissions` for `wiktionary.org`, `dictionaryapi.dev`, `datamuse.com` — fetch definitions; only the selected word is sent, never page content.
4. **Listing assets** — supply 1–10 screenshots and a tagline. Upload these on the AMO web form, not in the zip.
5. **Extension ID** — set in `browser_specific_settings.gecko.id` in [manifest.json](manifest.json). Currently `click-define`. Change to a domain-style ID you control (e.g. `click-define@halftoast.dev`) before first publication — once published, the ID is permanent.

## Pre-submission checklist

- [ ] Bump `version` in [manifest.json](manifest.json)
- [ ] Update `homepage_url` if the GitHub repo URL changed
- [ ] Test the zip by loading it as a temporary add-on
- [ ] Verify [PRIVACY.md](PRIVACY.md) still matches what the code does
- [ ] Run `./build.ps1`

## Review timeline

Initial review typically 1–10 days. Updates after approval are usually auto-signed within minutes if no new permissions are added.
