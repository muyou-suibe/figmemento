# FigMemento GitHub Pages Frontend Preview

## Purpose

This is a static, client-only visual preview of the FigMemento storefront. Every page shows `FRONTEND PREVIEW`. Catalog fixtures, Cart, Checkout, Payment, Order Success, Fulfillment, and Operator interactions are presentation state only.

The preview does not call the application server or any provider. It does not upload files, create an upload receipt, validate a checkout, create an Order, process Payment, authorize an operator, create Fulfillment work, ship anything, or persist browser state.

## Prerequisites

- Node.js `22.13.0` or a compatible Node 22 release.
- A local checkout with `npm ci` already completed.
- For Pages publication: a GitHub repository with Actions enabled, Pages configured to use **GitHub Actions**, and a repository visibility/configuration that permits Pages. The repository owner must be authorized to dispatch the workflow.
- No Supabase, payment, storage, upload, email, or other provider credential is required.

The current local repository has no configured Git remote, so no public Pages URL has been generated from this checkout. Do not infer a URL until a maintainer dispatches the workflow in the real GitHub repository.

## Local preview

Build at the site root:

```sh
npm ci
npm run build:pages-preview
```

Build using a repository-style base path:

```sh
PREVIEW_BASE_PATH=/<repo-name>/ npm run build:pages-preview
```

Serve the generated directory with a static server:

```sh
python3 -m http.server 4174 --directory dist
```

Open the matching URL:

```text
http://localhost:4174/<repo-name>/#/
```

The space after `#/` above is only visual formatting; the usable URL ends in `#/`.

The local artifact smoke test can be run after the base-path build:

```sh
npm run test:pages-preview:smoke
```

The page displays a `FRONTEND PREVIEW` notice and all demo state resets on refresh. This reset is intentional: there is no localStorage, sessionStorage, IndexedDB, cookie, server, or repository persistence.

## Manual Pages workflow

The workflow is [`.github/workflows/github-pages-preview.yml`](../.github/workflows/github-pages-preview.yml). It runs only after an authorized maintainer selects **Actions → GitHub Pages Frontend Preview → Run workflow**. It uses `npm ci`, Node 22, the isolated `npm run build:pages-preview` command, and uploads only `dist/github-pages-preview`.

For a project site, the expected URL shape is:

```text
https://<owner>.github.io/<repo-name>/#/
```

For a user or organization site whose repository is `<owner>.github.io`, the repository subpath is `/`. The workflow output is the only authoritative source for the actual `page_url`.

No workflow secrets are required. The workflow does not trigger on push, pull request, or schedule, and it does not alter the main Worker deployment.

## Demo limitations

The following are intentionally excluded from this frontend preview:

- Admin save, Product/Category/SKU/Fulfillment persistence, and lifecycle mutations.
- Customer authentication, same-browser capabilities, operator authorization, and privileged APIs.
- CustomerUpload bytes, receipts, storage locators, or server acceptance.
- Local Checkout server evaluation, Local Order, Order snapshots, Payment attempts, Stripe, PayPal, and webhooks.
- Production Fulfillment, production previews, shipping quotes, tracking, digital delivery, tax, email, and provider integrations.
- Supabase, database migrations, storage-provider choice, DNS, Cloudflare production configuration, and production deployment.

The Payment screen is visibly marked as demo-only. Order Success uses the fixed display reference `FM-PREVIEW-DEMO` and says that no real Order was created. Fulfillment and Operator controls are visual-only; tracking is explicitly labeled not implemented.

## Rollback / disable

To disable future publication, a repository maintainer can disable the workflow in GitHub Actions or remove `.github/workflows/github-pages-preview.yml`. To remove the local preview, remove the isolated `preview/github-pages/` entry, its preview tests, and the `build:pages-preview` script. Neither action changes the server-capable main runtime or its data.
