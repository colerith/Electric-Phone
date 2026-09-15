import { defaultPresetItems } from '../prompts';
import { PresetItemSchema, isPhonePresetEntry, type PromptLibrary, type PresetItem } from './preset-schema';
const uid = () => `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export function createPreset(library: PromptLibrary, name: string, source?: PresetItem[]) {
  const preset = {
    id: uid(),
    name: name.trim() || '新预设',
    entries: (source || defaultPresetItems().filter(entry => !!entry.systemKey)).map((entry, index) => ({
      ...entry,
      id: uid(),
      order: index,
    })),
  };
  library.items.push(preset);
  return preset;
}
export function editablePreset(library: PromptLibrary, id: string) {
  if (id === 'default') throw new Error('默认预设不可编辑，请先复制');
  const preset = library.items.find(item => item.id === id);
  if (!preset) throw new Error('预设不存在');
  return preset;
}
export function movePresetEntry(library: PromptLibrary, id: string, from: number, to: number) {
  const preset = editablePreset(library, id);
  if (from === to || from < 0 || to < 0 || from >= preset.entries.length || to >= preset.entries.length) return;
  if (isPhonePresetEntry(preset.entries[from]!)) throw new Error('电波手机条目已锁定');
  const [entry] = preset.entries.splice(from, 1);
  preset.entries.splice(to, 0, entry!);
  preset.entries.forEach((entry, index) => (entry.order = index));
}
export function savePresetEntry(library: PromptLibrary, id: string, entry: PresetItem) {
  const preset = editablePreset(library, id),
    next = PresetItemSchema.parse(entry),
    index = preset.entries.findIndex(item => item.id === next.id);
  if (isPhonePresetEntry(next) || (index >= 0 && isPhonePresetEntry(preset.entries[index]!)))
    throw new Error('电波手机条目已锁定');
  if (index < 0) preset.entries.push({ ...next, id: uid() });
  else preset.entries[index] = next;
  preset.entries.forEach((item, index) => (item.order = index));
}
export function deletePresetEntry(library: PromptLibrary, id: string, entryId: string) {
  const preset = editablePreset(library, id);
  if (preset.entries.some(entry => entry.id === entryId && isPhonePresetEntry(entry)))
    throw new Error('电波手机条目已锁定');
  preset.entries = preset.entries.filter(item => item.id !== entryId);
  preset.entries.forEach((item, index) => (item.order = index));
}
export function copyPresetEntry(library: PromptLibrary, id: string, entryId: string) {
  const preset = editablePreset(library, id),
    index = preset.entries.findIndex(item => item.id === entryId);
  if (index < 0) return;
  if (isPhonePresetEntry(preset.entries[index]!)) throw new Error('电波手机条目已锁定');
  preset.entries.splice(index + 1, 0, {
    ...preset.entries[index]!,
    id: uid(),
    name: preset.entries[index]!.name + ' 副本',
  });
  preset.entries.forEach((item, index) => (item.order = index));
}

export function togglePresetEntry(library: PromptLibrary, id: string, entry: PresetItem, value: boolean) {
  if (isPhonePresetEntry(entry)) throw new Error('电波手机条目必须开启');
  if (id === 'default') {
    library.defaultToggles[entry.id] = value;
    return;
  }
  savePresetEntry(library, id, { ...entry, enabled: value });
}
