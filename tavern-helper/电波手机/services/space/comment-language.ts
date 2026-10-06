import type { ChatPreferences } from '../chat/chat-preferences';
import type { z } from 'zod';
import type { MomentPost, MomentBatchSchema } from './moments';
type MomentBatch = z.infer<typeof MomentBatchSchema>;

export function commentLanguageOverride(preferences?: ChatPreferences): ChatPreferences | null {
  return preferences &&
    (preferences.autoTranslate ||
      preferences.sourceLanguage !== '简体中文' ||
      preferences.targetLanguage !== '简体中文')
    ? preferences
    : null;
}

/** Reject incomplete bilingual comments so configured generation repair can retry. */
export function validateCommentLanguages(
  batch: MomentBatch,
  posts: MomentPost[],
  preferences: Record<string, ChatPreferences> = {},
): void {
  for (const comment of batch.comments) {
    const post = posts.find(item => item.id === comment.postId);
    const override = commentLanguageOverride(preferences[comment.authorKey]);
    const language = override
      ? override.autoTranslate
        ? override.targetLanguage
        : ''
      : post?.translation?.content
        ? post.translation.language
        : '';
    if (language && (!comment.translation?.content?.trim() || comment.translation.language !== language)) {
      throw Error(
        `评论 ${comment.authorKey} 必须保留原文，并附 ${language} 的 translation.content；无单独语言设置时跟随主帖。`,
      );
    }
  }
}
