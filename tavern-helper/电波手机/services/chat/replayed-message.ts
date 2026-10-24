import type { PhoneMessage } from '../../schemas';
/** Only reject verbatim text/voice replays with the same explicit client ID and actor. */
export function isReplayedMessage(
  history: PhoneMessage[],
  message: {
    client_id?: string;
    sender: string;
    type: string;
    content: string;
    created_at?: string;
    payload?: Record<string, unknown>;
  },
): boolean {
  if (!message.client_id || message.sender !== 'char' || !['text', 'voice'].includes(message.type)) return false;
  return history.some(
    old =>
      old.clientId === message.client_id &&
      old.sender === message.sender &&
      old.type === message.type &&
      old.content === message.content &&
      String(old.payload.actorKey || '') === String(message.payload?.actorKey || '') &&
      String(old.payload.storyCreatedAt || '') === String(message.created_at || ''),
  );
}
