import type { Identity } from '../schemas';
import { displayIdentityName } from './identity';
const collator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', { sensitivity: 'base', numeric: true });
const letters = 'ABCDEFGHJKLMNOPQRSTWXYZ';
const boundaries = [...'阿芭擦搭蛾发噶哈击喀垃妈拿哦啪期然撒塌挖昔压匝'];
export function contactLetter(name: string): string {
  const first = [...name.trim()][0] || '';
  const latin = first
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (/^[A-Z]$/.test(latin)) return latin;
  if (!/\p{Script=Han}/u.test(first)) return '#';
  for (let index = boundaries.length - 1; index >= 0; index--)
    if (collator.compare(first, boundaries[index]) >= 0) return letters[index] || '#';
  return 'A';
}
export function groupContacts(contacts: Identity[]) {
  const groups = new Map<string, Identity[]>();
  [...contacts]
    .sort((a, b) => collator.compare(displayIdentityName(a), displayIdentityName(b)))
    .forEach(contact => {
      const key = contactLetter(displayIdentityName(contact));
      groups.set(key, [...(groups.get(key) || []), contact]);
    });
  return [...groups]
    .sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
    .map(([letter, contacts]) => ({ letter, contacts }));
}
