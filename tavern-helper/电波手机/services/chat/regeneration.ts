import { klona } from 'klona';
import type { Thread } from '../../schemas';

/** Select one completed user turn. Unsent drafts and later queued messages stay untouched. */
export function latestReplyRound(thread: Thread) {
  const messages = thread.messages;
  for (let end = messages.length; end > 0; ) {
    let userIndex = end - 1;
    while (userIndex >= 0 && (messages[userIndex].sender !== 'user' || messages[userIndex].withdrawn)) userIndex--;
    if (userIndex < 0) break;
    const replies = messages
      .slice(userIndex + 1, end)
      .filter(message => !message.withdrawn && message.sender === 'char' && !message.payload.generatedImage);
    if (replies.length) {
      const roundId = replies.at(-1)!.payload.replyGenerationId;
      const selected = roundId
        ? messages
            .slice(userIndex + 1, end)
            .filter(message => message.sender !== 'user' && message.payload.replyGenerationId === roundId)
        : replies;
      const ids = new Set(selected.map(message => message.id));
      const first = messages.findIndex(message => ids.has(message.id));
      const context = klona(thread);
      context.messages = context.messages.slice(0, first);
      context.historyArchive = context.historyArchive.filter(message => !ids.has(message.id));
      context.generating = false;
      context.generationId = '';
      let start = userIndex;
      while (start > 0 && messages[start - 1].sender === 'user') start--;
      const users = messages.slice(start, userIndex + 1).filter(message => !message.withdrawn);
      return { ids, first, replies: selected, users, context, fingerprint: JSON.stringify(messages) };
    }
    end = userIndex;
  }
  throw Error('还没有可重新生成的私聊回复，请先发送消息并获取回复。');
}
