import type { Identity } from '../../schemas';

export function resolveGroupActor(
  group: Identity,
  identities: Record<string, Identity>,
  payload: Record<string, unknown>,
): string {
  const supplied = [payload.actorKey, payload.actor_key, payload.actorName, payload.senderName]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map(value => value.trim());
  const keys = (group.memberKeys || []).filter(key => Boolean(identities[key]));
  const matches = supplied.map(value => {
    if (keys.includes(value)) return [value];
    return keys.filter(key =>
      [identities[key].name, identities[key].remark, group.groupMembers?.[key]?.nickname].includes(value),
    );
  });
  if (!supplied.length) throw Error('缺少发言者 payload.actorKey');
  if (matches.some(list => list.length !== 1) || new Set(matches.flat()).size !== 1)
    throw Error(`无法唯一对应群成员：${supplied.join(' / ')}`);
  const key = matches[0][0];
  if (group.groupMembers?.[key]?.muted) throw Error(`成员「${identities[key].name}」已禁言`);
  return key;
}
