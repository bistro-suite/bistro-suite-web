# Bistro Suite Web

This repository contains the Mithril web client for [Bistro Suite](https://bistro-web-production.up.railway.app/), alongside the historical Cars Admin client in `app/`.

The live demo serves the public menu and admin panel from the same origin. Railway deploys `modern-web/` from `main`; its Node server proxies API, Sanctum and uploaded-image requests through the private Railway network. Demo admin credentials are configured privately and are not published in this README.

See [`modern-web/README.md`](modern-web/README.md) for the current client, local development, and Railway configuration. The Docker and Whaler setup for running both repositories locally is in the [API repository README](https://github.com/bistro-suite/bistro-suite-api/blob/main/README.md). Historical Cars Admin screenshots are omitted here until current product screenshots are available.
