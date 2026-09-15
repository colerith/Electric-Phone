import { splitElectric } from './electric';
import { locationDistance, distanceLabel } from './location';
import type { PhoneMessage } from '../schemas';

type MessageInput = Pick<PhoneMessage, 'type' | 'content' | 'payload'> &
  Partial<Pick<PhoneMessage, 'id' | 'sender' | 'status' | 'withdrawn' | 'quotedMessageId'>>;
function printable(value: unknown): string {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return text.startsWith('data:') ? '本地附件（无公开地址）' : text;
}

/** 面向会话列表的简短文案；不要复用给模型读取的 formatPhoneMessage 标签格式。 */
export function formatMessagePreview(message: MessageInput, charSenderName = ''): string {
  const p = (key: string) => printable(message.payload[key]).replace(/\s+/g, ' ').trim();
  const content = splitElectric(message.content).body.replace(/\s+/g, ' ').trim();
  const prefix =
    message.sender === 'user' ? '我：' : message.sender === 'char' && charSenderName ? `${charSenderName}：` : '';
  if (message.withdrawn) return `${prefix}${message.sender === 'user' ? '撤回了一条消息' : '一条消息已撤回'}`;
  if (message.payload.interaction === 'poke') {
    const actor = p('actorName') || (message.sender === 'user' ? '我' : charSenderName || '对方');
    return `[拍一拍] ${actor}戳了戳${p('targetName') || content || '对方'}`;
  }

  let summary = '';
  switch (message.type) {
    case 'text': {
      const storedTranslation = p('translation');
      const storedOriginal = p('originalText');
      const translated =
        message.sender === 'user' && storedOriginal && storedTranslation === storedOriginal
          ? content
          : storedTranslation;
      summary = message.sender === 'user' && translated ? translated : content;
      break;
    }
    case 'emoji':
      summary =
        p('emojiType') === 'sticker' || p('stickerUrl') || p('url')
          ? `[表情] ${p('name') || content}`
          : p('emoji') || content || '[表情]';
      break;
    case 'image': {
      const count = Array.isArray(message.payload.images) ? message.payload.images.length : 0;
      summary = count > 1 ? `[图片] ${count} 张照片` : `[图片] ${p('description') || content}`;
      break;
    }
    case 'video':
      summary = `[视频] ${p('description') || content}`;
      break;
    case 'voice':
      summary = `[语音] ${p('transcript') || content}`;
      break;
    case 'transfer':
      summary = `[转账] ${[p('currency'), p('amount')].filter(Boolean).join(' ')}${p('note') || content ? ` · ${p('note') || content}` : ''}`;
      break;
    case 'location':
      summary = `[位置] ${p('name') || content}`;
      break;
    case 'link':
      summary = `[链接] ${p('title') || content}`;
      break;
    case 'call':
      summary = `[${p('kind') === 'video' ? '视频' : '语音'}通话] ${content}`;
      break;
    case 'zone':
      summary = `[动态] ${p('author') ? `${p('author')}：` : ''}${p('postContent') || content}`;
      break;
    default:
      summary = message.sender === 'system' ? `[系统] ${content}` : content;
  }
  const status = message.status === 'failed' ? '[发送失败] ' : message.status === 'sending' ? '[发送中] ' : '';
  return `${prefix}${status}${summary || '[消息]'}`;
}

export function formatPhoneMessage(message: MessageInput, history: PhoneMessage[] = [], includeQuote = true): string {
  if (message.withdrawn) return '[已撤回消息]';
  const p = (key: string) => printable(message.payload[key]);
  if (message.payload.interaction === 'poke')
    return `[拍一拍] ${p('actorName') || (message.sender === 'user' ? 'User' : 'Char')} 戳了戳 ${p('targetName') || message.content}`;
  const content = splitElectric(message.content).body;
  let result = '';
  switch (message.type) {
    case 'text':
      if (message.sender === 'user' && p('translation') && p('outgoingLanguage')) {
        const original = p('originalText') || content;
        const translated = p('originalText') && p('translation') === p('originalText') ? content : p('translation');
        result = `[User 消息·实际收到·${p('outgoingLanguage')}] ${translated}\n[User 原始输入·仅供语义参考] ${original}`;
      } else result = `[文字] ${content}`;
      break;
    case 'emoji':
      result =
        p('emojiType') === 'sticker' || p('stickerUrl')
          ? `[表情包] 名称：${p('name') || content}；资源：${p('stickerUrl') || p('url') || '未提供'}`
          : `[Emoji] ${p('emoji') || content}`;
      break;
    case 'image':
      result = `[照片] 画面：${p('description') || content}${p('url') ? `；资源：${p('url')}` : '；仅剧情画面描述'}`;
      if (Array.isArray(message.payload.images) && message.payload.images.length) {
        result =
          `[相册 ${message.payload.images.length} 张] ${content}\n` +
          message.payload.images
            .map((photo, index) => {
              const image = photo as { url?: string; description?: string };
              return `${index + 1}. [照片] 画面：${printable(image.description) || '未描述'}；资源：${printable(image.url)}`;
            })
            .join('\n');
      }
      break;
    case 'video':
      result = `[视频] 画面：${p('description') || content}${p('url') ? `；资源：${p('url')}` : '；仅剧情影像描述'}`;
      break;
    case 'voice':
      result = `[语音] 转写：${p('transcript') || content}${p('duration') ? `；时长：${p('duration')}秒` : ''}`;
      break;
    case 'transfer':
      result = `[剧情转账] 金额：${p('amount') || '未提供'} ${p('currency') || 'CNY'}；备注：${p('note') || content}；状态：${({ pending: '未收款', received: '已收款', refunded: '已退款' } as Record<string, string>)[p('state')] || '未收款'}`;
      break;
    case 'location':
      result = `[位置] ${p('name') || content}${p('address') ? `；地点描述：${p('address')}` : ''}；距离：${distanceLabel(locationDistance(message))}（场景设定，非实时定位）`;
      break;
    case 'link':
      result = `[链接] 标题：${p('title') || content}；地址：${p('url') || '未提供'}`;
      break;
    case 'call':
      result = `[${p('kind') === 'video' ? '视频' : '语音'}通话] 留言：${content}；状态：${p('state') || '邀请中'}（剧情事件）`;
      break;
    case 'zone':
      result = `[空间动态转发] 动态ID：${p('postId')}；作者：${p('author')}；时间：${p('date') || '未提供'}\n${p('title') ? `标题：${p('title')}\n` : ''}动态内容：${p('postContent') || content}`;
      break;
    default:
      result = `[系统消息] ${content}`;
  }
  if (message.payload.forwarded) result = `[转发消息]\n${result}`;
  if (includeQuote && message.quotedMessageId) {
    const quoted = history.find(item => item.id === message.quotedMessageId);
    const snapshot = message.payload.quote as { text?: string; sender?: string } | undefined;
    const quoteText = quoted ? formatPhoneMessage(quoted, [], false) : snapshot?.text || '原消息已不可用';
    result = `[引用 ${quoted?.sender || snapshot?.sender || '消息'} #${message.quotedMessageId}]\n${quoteText}\n[/引用]\n${result}`;
  }
  return result;
}

export function editedMessagePayload(message: MessageInput, content: string): Record<string, unknown> {
  const payload = { ...message.payload };
  const key = (
    {
      image: 'description',
      video: 'description',
      voice: 'transcript',
      location: 'name',
      link: 'title',
      transfer: 'note',
      zone: 'postContent',
    } as Record<string, string>
  )[message.type];
  if (key) payload[key] = content;
  if (message.type === 'emoji') payload[payload.emojiType === 'sticker' ? 'name' : 'emoji'] = content;
  return payload;
}
