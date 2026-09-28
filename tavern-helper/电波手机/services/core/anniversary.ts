import type { Identity, ScriptSettings } from '../../schemas';
export function mainAnniversaryCharacters(identities: Identity[]): Identity[] {
  return identities.filter(
    identity => identity.actorType !== 'npc' && !['local_group', 'temporary'].includes(identity.source),
  );
}
export function resolveAnniversaryCharacter(
  identities: Identity[],
  binding: string | undefined,
  active: string,
): Identity | undefined {
  const main = mainAnniversaryCharacters(identities);
  return (
    main.find(identity => identity.charKey === binding) || main.find(identity => identity.charKey === active) || main[0]
  );
}
export function anniversaryDateFor(appearance: ScriptSettings['appearance'], cardKey: string, charKey: string): string {
  if (!charKey) return '';
  return (
    appearance.anniversaryDates[`${cardKey}::${charKey}`] ??
    (!appearance.anniversaryBindings[cardKey] ? appearance.anniversaries[cardKey] || '' : '')
  );
}
