# Agent authentication

How agents prove who they are and what they may do. Stage 1 is built and tested. Stage 2 (per-person
OAuth sign-in) is designed here and not built in this run; the reasons and the plan are below.

## Stage 1 (built)

| Credential | Prefix | Actor (R3) | Scopes | Lifetime | Issued from |
|---|---|---|---|---|---|
| Personal access token | `dop_` | `agent-on-behalf-of-user` for one member | chosen ∩ the member's role | 7 to 365 days | My agents |
| API key | `dok_` | `service-agent` | chosen, never `admin` or `leave:approve` | until revoked | Admin → Agents & API |
| OAuth client credentials | `doc_` id, `docs_` secret | `service-agent` | client's scopes, narrowed by `scope=` | access token (`doa_`) 1 hour | Admin → Agents & API |

- Tokens are random 192-bit values; only their SHA-256 is stored. Shown once.
- Sent as `Authorization: Bearer`, or `X-API-Key` for platforms whose API-key setting only names a
  header (Copilot Studio). Never accepted in a query string.
- `last_used_at` is updated at most once a minute per token.
- Revocation is immediate (the next request fails). Revoking an OAuth client revokes its access tokens.
- Kill switch: `organizations.agent_access_enabled = false` refuses every agent credential with 403;
  people in the web app and Slack are unaffected.
- Rate limits per token and class (read 120, write 30, AI 10, planner 10, token endpoint 20 per
  minute; `RATE_LIMIT_<CLASS>` overrides). 429 carries `Retry-After`.
- Discovery: RFC 9728 protected resource metadata at
  `/.well-known/oauth-protected-resource/api/mcp`, RFC 8414 metadata at
  `/.well-known/oauth-authorization-server` (client credentials only today), and a 401 with
  `WWW-Authenticate: Bearer resource_metadata="…"`.
- Service agents can never commit for a member (R3): every commit becomes a draft addressed to the
  `forMemberId` they name, and only that person can confirm it in the app.

## Why Stage 2 matters

What each platform accepts today (checked 2026-10-30):

| Platform | Accepts | Works with Stage 1? |
|---|---|---|
| Claude Code | OAuth (CIMD, loopback redirect) or a static `--header` | Yes: personal token |
| Claude apps (claude.ai, Desktop, Cowork) | OAuth (CIMD preferred, else DCR); static request headers in beta for some orgs; no client credentials | Partly: API key via request headers where the beta is on |
| ChatGPT (developer mode / apps) | OAuth, none, or mixed; no API keys | No |
| Copilot Studio | none, API key (header or query), OAuth (dynamic discovery, dynamic, manual) | Yes: API key or personal token |
| Agentforce | none or OAuth client credentials; no per-user auth | Yes: OAuth client |

So the two largest consumer surfaces (Claude apps and ChatGPT) need per-person OAuth sign-in to act
as a person. Stage 2 is that sign-in.

## Stage 2 design: OAuth 2.1 authorization code + PKCE

### Shape

- **A separate authorization server (AS)**, logically and by issuer: issuer
  `https://<app>/oauth`, its own metadata, keys and tables. The MCP endpoint stays a pure resource
  server that only validates tokens. This keeps the MCP 2026-07-28 split (resource server ≠ AS) and
  lets the AS move to its own host later without changing the resource server.
- **Library: [`oidc-provider`](https://github.com/panva/node-oidc-provider)** (panva), mounted
  under `/oauth` through a Node route handler. Reasons:
  - OpenID-certified and maintained for years by the author of `jose`; PKCE, RFC 8707 resource
    indicators, RFC 9207 `iss`, refresh-token rotation, revocation (RFC 7009) and introspection are
    built-in features, not our code.
  - It does not own login. Its "interaction" hook hands the browser to our existing sign-in (Slack
    OIDC or dev login) and consent page, so there is one session system, not two.
  - Storage is an adapter interface: we write a Drizzle adapter over two tables (`oauth_grants`,
    `oauth_artifacts`) with `org_id` on every row.
  - Alternative considered: Better Auth's `oauthProvider` + `@better-auth/cimd` + `mcp()` plugins.
    It has first-class CIMD with an SSRF-safe pinned-IP transport and an `mcp-2026-07-28` profile,
    which is attractive, but it wants to own users and sessions; adopting it means migrating our
    sign-in to Better Auth. Worth revisiting if we ever replace sign-in.
- **Client registration**, in the MCP 2026-07-28 order:
  1. **CIMD** (preferred). `client_id` is an HTTPS URL. A custom `findClient` adapter fetches the
     document with the same guard as webhooks, but pinned: resolve once, reject special-use addresses,
     connect to that IP with TLS verified for the hostname, no redirects, 5 s timeout, 5 KB cap, JSON
     only. Check that `client_id` equals the URL, validate `redirect_uris`, cache by HTTP headers
     (max 24 h). Advertise `client_id_metadata_document_supported: true` and `none` in
     `token_endpoint_auth_methods_supported`, which Claude requires before it uses CIMD.
  2. **Pre-registered** confidential clients (an admin creates one, as today) for platforms that ask
     for a client id and secret (Copilot Studio "manual", Claude "credentials at connection time").
  3. **DCR**: deprecated in MCP 2026-07-28 but still Claude's fallback and ChatGPT's common path.
     Enabled behind `OAUTH_DCR_ENABLED`, rate-limited per IP, clients expire after 30 days unused.
- **Redirect URIs**: exact match, plus RFC 8252 loopback with any port for both `127.0.0.1` and
  `localhost` (Claude Code). Known hosted callbacks: `https://claude.ai/api/mcp/auth_callback`,
  ChatGPT's connector callback. The consent screen shows the redirect host and warns when every
  registered redirect is loopback.
- **Resource indicators (RFC 8707)**: the only resource is the MCP URL (and `/api/v1` for REST).
  Tokens are audience-bound to the requested resource; a token for one resource is refused by the
  other. Missing `resource` defaults to the MCP URL.
- **Tokens**: opaque `doa_` access tokens (1 hour) in the existing `api_tokens` table with
  `kind = 'access'`, `member_id` set and `client_id` = the OAuth client, so the resource server path
  (hash lookup, kill switch, scopes ∩ role, rate limits, audit) is unchanged. Refresh tokens rotate on
  every use with reuse detection (a reused refresh token revokes the grant). `offline_access` is
  advertised so Claude gets refresh tokens.
- **Actor**: `agent-on-behalf-of-user`, `on_behalf_of_member_id` = the signed-in member, scopes =
  granted ∩ role. Autonomy for agents still applies: Draft by default, so a connected ChatGPT still
  produces drafts the person confirms.
- **Tenancy**: a grant belongs to one member of one org. A person in two orgs picks the org on the
  consent screen; the token never spans orgs.

### Consent screen (plain language)

> **Claude wants to use Days Off for Teams as you (Priya Shah, Brightside Studio).**
> It will be able to:
> - See your balance, your requests and who is out
> - Draft leave requests for you to confirm
>
> It will not be able to approve leave, change settings or see anyone's notes.
> You'll be sent back to **claude.ai**. You can disconnect it any time in My agents.
>
> [Allow] [Cancel]

Scope lines come from `SCOPE_DESCRIPTIONS`, the same text as the token page. Scopes the person's role
lacks are not offered. Each grant appears under My agents → Connected apps with last use and a
one-click **Disconnect** (revokes the grant, its refresh tokens and access tokens). Admins see every
grant under Agents & API and can revoke any; the kill switch also refuses AS token issuance.

### Endpoints

| Path | Purpose |
|---|---|
| `/.well-known/oauth-authorization-server` (issuer-relative) | RFC 8414 metadata: `code_challenge_methods_supported: ["S256"]`, `authorization_response_iss_parameter_supported: true`, CIMD flag, scopes incl. `offline_access` |
| `/oauth/authorize` | Code flow; `response_type=code` only, PKCE S256 required, `resource` required or defaulted |
| `/oauth/token` | `authorization_code`, `refresh_token`, `client_credentials` (moves here from `/api/oauth/token`, old path kept as an alias) |
| `/oauth/revoke`, `/oauth/register` (flagged) | RFC 7009, RFC 7591 |
| `/oauth/interaction/:uid` | Our sign-in and consent pages |

The protected resource metadata adds the new issuer to `authorization_servers` (first entry, since
Claude uses only the first).

### Threats and answers

| Threat | Answer |
|---|---|
| Code interception | PKCE S256 mandatory, single-use codes, 60 s lifetime |
| Mix-up across servers | RFC 9207 `iss` in the response; one issuer |
| Token replay at another resource | Audience binding via RFC 8707 |
| SSRF via CIMD | Pinned-IP fetch, special-use ranges blocked, no redirects, size and time caps |
| Malicious client name / logo | Shown as text from the document, never as HTML; host of redirect URI shown prominently |
| Refresh token theft | Rotation with reuse detection; grants listed and revocable |
| Confused deputy (agent acts beyond user) | Scopes ∩ role at every call; drafts by default; service actors still cannot commit for others |
| DCR flooding | Off by default; per-IP rate limit; unused clients expire |

### Tests to write with it

- Full code + PKCE flow with the official MCP client SDK's OAuth provider against the in-process
  route handlers (wrong verifier, reused code, wrong redirect, wrong resource all fail).
- CIMD: mismatched `client_id`, private-IP document host, redirect, oversized document.
- Refresh rotation and reuse detection; Disconnect revokes everything; kill switch blocks issuance.
- Cross-tenant: a grant for org A cannot reach org B; a member removed from the org loses access.
- Interop by hand (needs a deployed URL): Claude custom connector, ChatGPT developer mode, the MCP
  Inspector. Record transcripts in the PR.

### Effort

About 2 to 3 focused days including tests, plus a deployed preview for interop checks. Not started in
this unattended run because it needs choices that are the owner's (adding a sizeable auth dependency,
DCR on or off) and live interop testing against Claude and ChatGPT, which needs a public URL.
