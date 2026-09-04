# Integration

The project builds a reusable custom element named `<nr-prb-visualizer>`.

## Build outputs

```text
dist/assets/nr-prb-visualizer.js
dist/assets/nr-prb-visualizer.css
dist/assets/worker-[hash].js
```

The JavaScript and CSS entry names are stable. The worker name is content-hashed because the main bundle resolves it as a module URL.

## Host page

Load the stylesheet and module, then add the element:

```html
<link
  rel="stylesheet"
  href="/tools/nr-prb-interference-visualizer/assets/nr-prb-visualizer.css"
/>
<nr-prb-visualizer></nr-prb-visualizer>
<script
  type="module"
  src="/tools/nr-prb-interference-visualizer/assets/nr-prb-visualizer.js"
></script>
```

The component uses the host's `--bg`, `--ink`, `--muted`, `--surface`, `--surface2`, `--border`, `--brand`, and `--accent` variables when present. Its operational styles are scoped to `.nr-prb-app` classes.

## Privacy-safe usage events

The component emits a bubbling `nr-prb-usage` browser event after selected interface actions. The detail object contains only two enumerated fields, `action` and `context`. It never contains a file name, sheet name, header, cell identifier, counter value, threshold, row count, timestamp, parser message, or free-form error text.

```js
document.addEventListener("nr-prb-usage", (event) => {
  const { action, context } = event.detail;
  // Forward only allowlisted fixed values after the host's analytics consent check.
});
```

Supported actions are `file_ready`, `demo_loaded`, `analysis_completed`, `analysis_failed`, `template_downloaded`, and `export_completed`. Context values are fixed in `src/events.ts`. The engine itself does not make a network request when emitting an event.

Failure contexts identify only a bounded category such as `malformed_csv`, `mapping_required`, `no_valid_measurements`, or `scale_invalid`. They are emitted after an explicit user action. Automatic display refreshes do not emit additional failure events.

## Official site pinning

The HiCellTek site vendors the release assets instead of using an iframe or remote CDN. An `upstream.json` file records the package version, source commit, repository, and SHA-256 hash of each asset. The site validation command recomputes these hashes before a build.

To update the site:

1. Check out the desired public release.
2. Run `npm ci`, `npm run test:all`, and `npm run build`.
3. Copy the three build assets into the site's tool asset directory.
4. Update the version, source commit, worker name, and hashes in `upstream.json`.
5. Run the site typecheck, tests, full production build, link tests, and browser tests.

This mechanism keeps the generic engine public and independently testable while preserving the official site's native header, footer, SEO, analytics consent, and content architecture. A host analytics listener must use an explicit action and context allowlist and must never forward arbitrary event detail.
