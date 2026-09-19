import type { ChatPreferences } from '../chat/chat-preferences';
import { presetMomentsRules, buildMomentsPrompt } from '../../prompts';
import { planMoments, type MomentsState, type MomentPost, type MomentPlan } from './moments';
import { isCardExcluded, stripExcludedTags } from '../generation/context-controls';
import type { Identity, ScriptSettings } from '../../schemas';
import { logDiagnostic } from '../core/diagnostics';
export function registerMomentsFollow(
  getInput: () => {
    chatPreferences?: ChatPreferences;
    state: MomentsState;
    identities: Identity[];
    posts: MomentPost[];
    settings: ScriptSettings;
    cardName: string;
    busy: boolean;
  } | null,
  savePlan: (plan: MomentPlan) => void,
) {
  let release: (() => void) | null = null;
  const clear = () => {
    release?.();
    release = null;
  };
  const events = [
    eventOn(tavern_events.GENERATION_AFTER_COMMANDS, (type, _options, dry) => {
      clear();
      if (dry || !['normal', 'continue', 'swipe', 'regenerate'].includes(type)) return;
      try {
        const input = getInput();
        if (!input || input.busy || isCardExcluded(input.settings, input.cardName)) return;
        const plan = planMoments(input.state, input.identities, input.posts);
        if (!plan) return;
        release = injectPrompts(
          [
            {
              id: 'wave-moments-follow-v1',
              role: 'system',
              position: 'in_chat',
              depth: 0,
              should_scan: false,
              content: stripExcludedTags(
                buildMomentsPrompt(
                  plan,
                  input.state,
                  input.posts,
                  presetMomentsRules(input.settings.presets),
                  input.chatPreferences,
                ),
                input.settings.basic.excludedTags,
              ),
            },
          ],
          { once: true },
        ).uninject;
        savePlan(plan);
        logDiagnostic(
          '朋友圈互动',
          `${plan.postActor ? '发帖' : ''} ${plan.comments.length} 条评论、${plan.likes.length} 次点赞`,
        );
      } catch (error) {
        clear();
        logDiagnostic('朋友圈注入失败', String(error));
      }
    }),
    eventOn(tavern_events.GENERATION_STOPPED, clear),
    eventOn(tavern_events.GENERATION_ENDED, clear),
    eventOn(tavern_events.CHAT_CHANGED, clear),
  ];
  return () => {
    clear();
    events.forEach(event => event.stop());
  };
}
