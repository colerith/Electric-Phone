import type { Identity, Thread } from '../../schemas';
/** Execute only structured, authorized actions once; narration alone never changes permissions. */
export function applyGroupManagement(group: Identity, thread: Thread, identities: Record<string, Identity>): void {
  if (group.source !== 'local_group') return;
  const results = (group.groupManagementResults ||= {});
  const blocked = new Set<string>();
  for (const message of thread.messages) {
    const payload = message.payload;
    const action = payload.groupAction as { type?: string; targetKey?: string; value?: unknown } | undefined;
    if (!action) {
      if (message.sender === 'char' && blocked.has(String(payload.actorKey || ''))) message.withdrawn = true;
      continue;
    }
    const actionId = `${thread.id}::${message.id}`;
    if (Object.hasOwn(results, actionId)) {
      if (results[actionId]) {
        message.sender = 'system';
        message.type = 'system';
        message.content = results[actionId];
        payload.interaction = 'group_management';
      } else {
        message.withdrawn = true;
        message.content = '';
      }
      continue;
    }
    if (payload.groupActionHandled) continue;
    payload.groupActionHandled = true;
    const actor = String(payload.actorKey || '');
    const owner = group.groupOwnerKey || 'user';
    const members = [...(group.groupObserver ? [] : ['user']), ...(group.memberKeys || [])];
    const admin = group.groupMembers?.[actor]?.admin;
    const target = action.targetKey || '';
    const label = (key: string) =>
      group.groupMembers?.[key]?.nickname || identities[key]?.name || (key === 'user' ? '我' : '成员');
    const previous = group.groupMembers?.[target];
    const value = action.value;
    let notice = '';
    const reject = () => {
      message.withdrawn = true;
      message.content = '';
      payload.groupActionRejected = true;
      results[actionId] = '';
    };
    if (
      message.sender !== 'char' ||
      !members.includes(actor) ||
      group.groupMembers?.[actor]?.muted ||
      (actor !== owner && !admin)
    ) {
      reject();
      continue;
    }
    if (action.type === 'name' && typeof value === 'string' && value.trim()) {
      const name = value.trim().slice(0, 40);
      if (group.name !== name) {
        group.name = name;
        notice = `${label(actor)}将群名称修改为「${name}」`;
      }
    } else if (
      ['nickname', 'title', 'muted', 'remove'].includes(action.type || '') &&
      members.includes(target) &&
      previous
    ) {
      // Administrators cannot manage the owner or other administrators; nobody removes the owner.
      if (
        (target === owner && actor !== owner) ||
        (target !== actor && previous.admin && actor !== owner) ||
        ((action.type === 'remove' || action.type === 'muted') && target === owner)
      ) {
        reject();
        continue;
      }
      const actorName = label(actor),
        targetName = label(target);
      if ((action.type === 'nickname' || action.type === 'title') && typeof value === 'string') {
        const field = action.type;
        const text = value.trim().slice(0, field === 'nickname' ? 40 : 30);
        if (previous[field] !== text) {
          previous[field] = text;
          notice = `${actorName}将「${targetName}」的${field === 'nickname' ? '群昵称' : '头衔'}修改为「${text || '无'}」`;
        }
      } else if (action.type === 'muted' && typeof value === 'boolean') {
        if (previous.muted !== value) {
          previous.muted = value;
          notice = `${actorName}${value ? '禁言了' : '解除了禁言：'}「${targetName}」`;
        }
      } else if (action.type === 'remove') {
        if (target === 'user') group.groupObserver = true;
        else group.memberKeys = (group.memberKeys || []).filter(key => key !== target);
        delete group.groupMembers![target];
        notice = `${actorName}将「${targetName}」移出了群聊`;
      } else {
        reject();
        continue;
      }
    } else {
      reject();
      continue;
    }
    if (!notice) {
      reject();
      continue;
    }
    message.sender = 'system';
    message.type = 'system';
    message.content = notice;
    payload.interaction = 'group_management';
    payload.action = action.type;
    payload.targetKey = target;
    results[actionId] = notice;
    if (action.type === 'remove' || (action.type === 'muted' && value === true)) blocked.add(target);
    if (action.type === 'muted' && value === false) blocked.delete(target);
    group.updatedAt = message.createdAt;
  }
}
