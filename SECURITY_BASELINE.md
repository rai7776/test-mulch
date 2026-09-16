# Smart Reader security baseline

This document records the current browser-side security baseline before Workspace/Cloud work.

## Enforced now

- External source links allow only `http:` and `https:` URLs.
- External source links opened in a new tab use `rel="noopener noreferrer"`.
- `eval`, `new Function`, `document.write`, and `document.writeln` are prohibited by regression tests.
- Known user-controlled values must not be directly interpolated into HTML templates.
- The LocalForage script source is inspected at runtime and warns while the legacy unpinned CDN URL remains.
- Schema metadata is kept internal so legacy exact-key backup/restore remains compatible.
- Browser zoom is not disabled at runtime.

## Deferred intentionally

- Replace the legacy unpinned LocalForage CDN URL in `index.html` with a pinned dependency after a safe full-file edit path is available.
- Introduce a strict Content Security Policy only after legacy inline event handlers have been migrated to `addEventListener`; enabling strict CSP before that would break the application.
- Cloud/auth security (server-side authorization, RLS, API-key isolation, rate limits) belongs to the later account/cloud phase.

## XSS review rule

`innerHTML` is not automatically forbidden: static trusted templates are allowed. Any user/imported value that is inserted into an HTML string must be escaped first, or inserted through `textContent`/DOM APIs. New high-risk dynamic-code primitives are blocked by tests.
