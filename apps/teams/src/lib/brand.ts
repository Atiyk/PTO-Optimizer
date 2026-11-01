/** The product name and tagline. Change them here only. */
export const PRODUCT_NAME = 'Gapless';
export const PRODUCT_TAGLINE = 'Staff cover and compliance for childcare centres, clinics and care homes, with every rule linked to its source.';

/*
 * Renamed everywhere the app names itself (page metadata, llms.txt and the agent card, the MCP
 * server and OpenAPI titles, the staff app's PWA name, the passkey prompt's rpName). Kept on
 * purpose: identifiers that would break existing set-ups (the passkey rpID, which is the host
 * name; the OAuth resource identifier and its display name; the MCP server's machine name
 * `daysoff-teams`; package names, routes and the database). The Teams app manifest and the
 * Slack app's display name live in those platforms' consoles: see setup-steps.md.
 */
