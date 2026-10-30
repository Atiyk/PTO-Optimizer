import { appUrl } from './appUrl';

/** RFC 9728 protected-resource metadata URL for the MCP endpoint (path-suffixed form). */
export const mcpResourceUrl = () => `${appUrl()}/api/mcp`;
export const mcpResourceMetadataUrl = () => `${appUrl()}/.well-known/oauth-protected-resource/api/mcp`;

/** 401 challenge every agent surface returns, pointing clients at the metadata (MCP authorization). */
export function bearerChallenge(error: 'invalid_token' | 'insufficient_scope' | null, description: string): string {
  return `Bearer resource_metadata="${mcpResourceMetadataUrl()}"${error ? `, error="${error}", error_description="${description.replace(/"/g, "'")}"` : ''}`;
}
