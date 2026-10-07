import { parseCivilTime, type SystemClockSettings } from './system-clock';
import { logDiagnostic } from './diagnostics';
export const CHAT_TIME_PATTERN = /<wave_time_(start|end)>[\s\S]*?<\/wave_time_\1>/gi;
export function readPhoneChatTime(skipLastAssistant = false): string {
  const rows = SillyTavern.chat || [];
  let skipped = !skipLastAssistant;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row || row.is_user || row.extra?.type === 'narrator') continue;
    if (!skipped) {
      skipped = true;
      continue;
    }
    for (const tag of ['end', 'start']) {
      const matches = [
        ...(row.mes || '').matchAll(new RegExp(`<wave_time_${tag}>([\\s\\S]*?)<\\/wave_time_${tag}>`, 'gi')),
      ];
      for (const match of matches.reverse()) {
        if (parseCivilTime(match[1]) !== null) return match[1].trim();
      }
    }
  }
  return '';
}
export function registerChatTime(getSettings: () => SystemClockSettings) {
  let release: (() => void) | undefined;
  const clear = () => {
    release?.();
    release = undefined;
  };
  const events = [
    eventOn(tavern_events.GENERATION_AFTER_COMMANDS, (type, _options, dry) => {
      clear();
      const settings = getSettings();
      if (dry || settings.source !== 'phone' || !['normal', 'continue', 'swipe', 'regenerate'].includes(type)) return;
      const anchor = readPhoneChatTime(type === 'swipe' || type === 'regenerate') || settings.storyInitialTime;
      try {
        release = injectPrompts(
          [
            {
              id: 'wave-phone-chat-time-v1',
              role: 'system',
              position: 'in_chat',
              depth: 0,
              should_scan: false,
              content: `电波手机剧情时间记录：本轮正文开头输出 <wave_time_start>YYYY/MM/DD HH:mm</wave_time_start>，正文结尾输出 <wave_time_end>YYYY/MM/DD HH:mm</wave_time_end>。标签内必须是有效具体日期时间，不要照抄格式占位符，不放进代码块。记录本轮剧情开始和结束时间，按剧情经过合理推进，结束不得早于开始；无时间经过可以相同。遵循用户明确跳时或回忆场景，不机械增加固定分钟，不用现实时间替代剧情时间。${parseCivilTime(anchor) !== null ? `此前剧情时间锚点：${anchor}。` : '暂无锚点，请根据正文设定确定时间；信息不足时不要编造日期或输出无效标签。'}${type === 'continue' ? '本次续写：已有开始标签时不要重复，正文完成后补充结束标签。' : '重写或切换候选时，以前文为准重新推算起止时间。'}这些标签仅记录正文时间，不生成手机模块数据。`,
            },
          ],
          { once: true },
        ).uninject;
      } catch (error) {
        clear();
        logDiagnostic('聊天时间注入失败', String(error));
      }
    }),
    eventOn(tavern_events.GENERATION_ENDED, clear),
    eventOn(tavern_events.GENERATION_STOPPED, clear),
    eventOn(tavern_events.CHAT_CHANGED, clear),
  ];
  return () => {
    clear();
    events.forEach(event => event.stop());
  };
}
