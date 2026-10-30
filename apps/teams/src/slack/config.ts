/** Scopes requested at install (bot) and when a person allows status updates (user). Keep in step with slack/manifest.yml. */
export const BOT_SCOPES = ['commands', 'chat:write', 'im:history', 'users:read', 'users:read.email'];
export const USER_SCOPES = ['users.profile:write'];
export const STATE_COOKIE = 'dt_slack_state';
