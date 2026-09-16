# FigMemento Host and Redirect Policy

## Scope

This document records the local/application policy for environment
classification and SEO safety. It does not activate a redirect, mutate DNS, or
call Cloudflare.

## Approved classifications

| Host / signal | Classification | SEO authority |
| --- | --- | --- |
| `figmemento.com` | `PRODUCTION_APEX` | Canonical and indexable only with explicit `APP_DEPLOYMENT_ENV=production`. |
| `www.figmemento.com` | `PRODUCTION_WWW_ALIAS` | Edge redirect alias; application must not create a broad host redirect. |
| `staging.figmemento.com` | `STAGING` | Noindex, no canonical, no public sitemap. |
| Explicit `APP_DEPLOYMENT_ENV=preview` with an unknown host | `PROVIDER_PREVIEW` | Noindex, no canonical, no public sitemap. Provider hostname remains unknown. |
| `localhost`, `127.0.0.1` | `DEVELOPMENT` | Offline/local only; never production canonical. |
| Any reserved `.test` host | `TEST` | Offline/test only; never production canonical. |

Unknown hosts are not converted into production canonical URLs. `NODE_ENV=production`
alone is not sufficient SEO authority; canonical production output requires the
explicit deployment classification and approved production origin.

## WWW redirect contract

The pure application contract matches only the exact approved
`www.figmemento.com` hostname and returns a permanent HTTP 308 target on the
approved HTTPS apex. It preserves the request path and query string, and it
does not redirect apex, staging, preview, localhost, loopback, or `.test`
hosts. It never derives a target from an untrusted Host header.

The future authoritative enforcement location is the Cloudflare edge. The
application policy is defense-in-depth for classification, metadata, sitemap,
robots, and offline verification. No broad application Host-header redirect
middleware is installed by this change.

## Activation boundary

The following remain manual, separately authorized deployment work:

- Cloudflare zone and custom-domain attachment;
- exact WWW edge redirect activation;
- DNS, registrar, nameserver, DNSSEC, and TLS changes;
- provider preview hostname discovery;
- production deployment and live-host verification.

Concrete provider targets are intentionally not recorded until the deployment
owner supplies and verifies them.
