import { permanentRedirect } from 'next/navigation';

/** The agent docs moved to /developers (MCP, REST, webhooks). Old links keep working. */
export default function AgentDocs(): never {
  permanentRedirect('/developers');
}
