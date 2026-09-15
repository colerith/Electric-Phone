import type { ScriptSettings } from '../schemas';
import { eventSounds } from './event-sounds';
import { notificationSounds } from './notification-assets';
let audio: HTMLAudioElement | undefined;
export function notificationUrl(settings: ScriptSettings['notifications']): string {
  if (settings.soundId === 'custom') {
    if (!/^(https?:\/\/|data:audio\/)/i.test(settings.customSound)) throw Error('请上传音频或填写有效音频链接。');
    return settings.customSound;
  }
  return (notificationSounds.find(s => s.id === settings.soundId) || notificationSounds[0]).url;
}
export function stopNotification(): void {
  audio?.pause();
  if (audio) audio.src = '';
  audio = undefined;
  eventAudio.forEach(sound => {
    sound.pause();
    sound.src = '';
  });
  eventAudio.clear();
}
export async function playNotification(settings: ScriptSettings['notifications']): Promise<void> {
  const url = notificationUrl(settings);
  stopNotification();
  audio = new Audio(url);
  audio.volume = settings.volume;
  await audio.play();
}

export type SoundEvent = 'message' | 'send' | 'click' | 'poke';
const eventAudio = new Map<SoundEvent, HTMLAudioElement>();
export async function playSoundEvent(
  settings: ScriptSettings['notifications'],
  event: SoundEvent,
  preview = false,
): Promise<void> {
  const config = settings.events[event];
  if (!preview && !config.enabled) return;
  const url =
    config.soundId === 'custom'
      ? notificationUrl({ ...settings, ...config })
      : eventSounds.find(sound => sound.id === event)!.url;
  eventAudio.get(event)?.pause();
  const next = new Audio(url);
  next.volume = config.volume;
  eventAudio.set(event, next);
  try {
    await next.play();
  } catch (error) {
    eventAudio.delete(event);
    throw error;
  }
}
