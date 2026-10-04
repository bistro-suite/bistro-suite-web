# Bistro Suite Web Client

Mithril 2 + Vite client for Bistro Suite, kept alongside the historical Cars Admin app. This directory is the Railway service root for the web app.

**Live demo:** [bistro-web-production.up.railway.app](https://bistro-web-production.up.railway.app/). The demo includes the public menu and `/admin`; production admin credentials are set privately and are not documented here.

## Local use

Requires Node 24. Run `npm install`, then `npm run dev`. `npm run build` produces `dist/`; `npm run start` serves that build on Railway's `$PORT` (4173 locally), supports the SPA fallback, and proxies `/api`, `/sanctum` and `/storage` to `API_PROXY_TARGET`.

The storefront loads `GET /api/v1/public/bistros/{slug}/menu` from Laravel through Vite's `/api` development proxy. In Railway, the Node server proxies `/api`, `/sanctum` and `/storage` over the private network, so browser requests and Sanctum cookies stay same-origin and the API does not need a public domain. Set `API_PROXY_TARGET` to the API's private HTTP address and `VITE_BISTRO_SLUG` at build time. The local Compose demo selects `demo-bistro`; another slug can be selected at Vite build time. Laravel reads the PostgreSQL catalog scoped to that bistro and excludes unavailable products. The seeded catalog has 16 fictional available products across five categories and one unavailable test product. Six entries feature Nortesantanderean food and locally generated menu photos. Product cards, detail modals, search, category filters, and the session-only cart use this response.

The menu demo reuses one food image and the Alegreya Sans font files from the legacy repositories. Their origin and use are recorded in [ASSET_PROVENANCE.md](./ASSET_PROVENANCE.md). The `/admin` route provides cookie-based login, product management, and a recent-order inbox searchable by reference or customer name, phone and email. Status filters include counts. Each compact summary opens a **Ver detalle del pedido** dialog with customer contact, destination, item notes and total breakdown. Staff can change allowed statuses from the inbox or dialog. The **Entrega y recogida** tab configures delivery coverage, flat fee and pickup address. The public cart completes guest checkout for enabled methods, displays the delivery fee and shows a receipt reference; it does not process payment. Sample admin credentials are documented in the API README and are only for local Compose.

For the containerized local environment shared with Laravel, use the Compose setup documented in the [API repository](https://github.com/bistro-suite/bistro-suite-api/blob/main/README.md). It mounts this directory into the Node 24 development container and serves Vite at `http://localhost:5173/`.

The menu data, prices, Centro/Caobos/La Riviera coverage, $5,000 COP delivery fee and pickup address are illustrative only. Replace the fulfillment settings in the admin before using the demo to represent a real business. The cart and its checkout idempotency key are stored in `sessionStorage`, so refreshes and retries in the current tab do not create a second order. Editing the cart generates a new attempt key. Checkout submits the cart to the public API, which recalculates prices, validates the configured neighborhood, applies the fee and creates the order. Payment, tax calculation, customer accounts and public order tracking remain outside this demo.

## Railway

The live Railway service deploys this directory from the `main` branch with root directory `/modern-web`. Its Node server listens on Railway's `$PORT` and sets `API_PROXY_TARGET` to `http://bistro-api.railway.internal:8080`, keeping API, Sanctum and uploaded-image requests on the same public origin while the API remains private. The service follows the separate frontend layout from `gestion-monitorias/frontend/railway.toml`, adapted to this app. Keep the checked-in `railway.toml` and Railway service settings aligned; see [Railway's config-as-code reference](https://docs.railway.com/config-as-code/reference).
