import type { AppId, ScriptSettings } from '../../schemas';

export function appApiMode(settings: ScriptSettings, app: AppId): 'main_api' | 'secondary_api' {
  const selection = settings.generation.appApis?.[app];
  if (selection?.mode === 'profile' || selection?.mode === 'secondary_api') return 'secondary_api';
  if (selection?.mode === 'main_api') return 'main_api';
  return settings.sendMode === 'secondary_api' ? 'secondary_api' : 'main_api';
}

/** Resolve without mutating the current global preset or exposing credentials in the UI. */
export function appApiSettings(settings: ScriptSettings, app: AppId): ScriptSettings {
  const selection = settings.generation.appApis?.[app];
  if (selection?.mode === 'profile') {
    const profile = settings.apiProfiles.find(item => item.id === selection.profileId);
    if (!profile) throw Error('此应用选择的副 API 预设已删除或未选择，请到应用设置重新选择');
    return { ...settings, sendMode: 'secondary_api', api: { ...profile.api } };
  }
  return { ...settings, sendMode: appApiMode(settings, app) };
}

export function appApiGroup(settings: ScriptSettings, app: AppId): string {
  const selection = settings.generation.appApis?.[app];
  return selection?.mode === 'profile' ? `profile:${selection.profileId}` : appApiMode(settings, app);
}

export function appApiAvailable(settings: ScriptSettings, app: AppId): boolean {
  if (appApiMode(settings, app) === 'main_api') return true;
  const selection = settings.generation.appApis?.[app];
  return selection?.mode === 'profile'
    ? Boolean(settings.apiProfiles.find(item => item.id === selection.profileId)?.api.enabled)
    : settings.api.enabled;
}
