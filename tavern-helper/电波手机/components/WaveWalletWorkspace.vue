<template>
  <section class="wallet-workspace" :class="[`wallet-workspace-${mode}`, { 'wave-app-content': mode === 'app' }]">
    <section v-if="mode === 'settings'" class="chat-settings-group system-settings-card wallet-account-group">
      <div class="wave-settings-title">账户管理</div>
      <WaveSelect v-model="selectedId" :options="options" aria-label="选择钱包账户" />
      <p class="chat-settings-note">我的账本、角色账本和共享账户分别保存。共享账户在两个入口显示同一份收支。</p>
      <button type="button" class="wallet-account-action" @click="createShared">新增共享账户</button>
    </section>
    <template v-if="account">
      <form
        v-if="mode !== 'app'"
        class="wallet-account-group wallet-account-form"
        :class="
          mode === 'mine'
            ? 'settings-card system-settings-card moments-form'
            : 'chat-settings-group system-settings-card'
        "
        @submit.prevent="save"
      >
        <div class="wave-settings-title">账户资料</div>
        <label v-if="mode === 'mine' && accounts.length > 1"
          >账户<WaveSelect v-model="selectedId" :options="options" aria-label="选择钱包账户"
        /></label>
        <label>账户名称<input v-model="draft.name" maxlength="80" required /></label>
        <label>显示币种<WaveSelect v-model="draft.currency" :options="currencyOptions" aria-label="账户币种" /></label>
        <label
          >当前余额 · {{ draft.currency
          }}<input
            v-model="draft.balance"
            type="number"
            step="0.01"
            placeholder="未知可留空"
            aria-label="账户当前余额"
            @input="balanceTouched = true"
        /></label>
        <p class="chat-settings-note">每个币种独立记账。切换币种不会换算余额或改写旧流水；新币种余额需单独填写。</p>
        <label>银行名称<input v-model="draft.bankName" maxlength="80" placeholder="例如：日常储蓄卡" /></label>
        <div class="wallet-account-pair">
          <label>卡片备注<input v-model="draft.cardLabel" maxlength="80" placeholder="工资卡 / 生活卡" /></label>
          <label
            >卡号后四位<input
              v-model="draft.cardLastFour"
              inputmode="numeric"
              maxlength="4"
              pattern="[0-9]{0,4}"
              placeholder="选填"
          /></label>
        </div>
        <button type="submit" class="settings-save-wide">保存账户</button>
        <p v-if="feedback" role="status" class="chat-settings-note">{{ feedback }}</p>
      </form>
      <section v-if="mode === 'settings'" class="chat-settings-group system-settings-card wallet-account-group">
        <div class="wave-settings-title">剧情记账账户</div>
        <WaveSelect
          :model-value="sharedId"
          :options="sharedOptions"
          aria-label="剧情共享账户"
          @update:model-value="selectShared"
        />
        <p class="chat-settings-note">
          {{ phone.activeIdentity?.name || '角色' }}
          的手动与自动生成使用此账户。我的私人账本只接受手工记账，银行卡资料不会发给模型。
        </p>
      </section>
      <WaveWalletPanel
        v-if="mode === 'app'"
        :key="account.id + account.currency"
        :raw="raw"
        :name="account.name"
        :artwork="artwork || ''"
        :card-editable="mode === 'app'"
        :bank-name="account.bankName"
        :card-label="account.cardLabel"
        :card-last-four="account.cardLastFour"
        @settings="$emit('settings')"
        @add="row => phone.addWalletTransaction(row, account!.id)"
        @delete="id => phone.deleteWalletTransaction(id, account!.id)"
        ><template #account-switch
          ><WaveSelect v-model="selectedId" :options="options" class="wallet-account-switch" aria-label="选择钱包账户"
            ><template #leading
              ><span class="wallet-account-avatar"
                ><img
                  v-if="accountAvatar(selectedId) && !failedAvatars[accountAvatar(selectedId)]"
                  :src="accountAvatar(selectedId)"
                  alt=""
                  @error="failedAvatars[accountAvatar(selectedId)] = true" /><i
                  v-else
                  :class="
                    accounts.find(a => a.id === selectedId)?.ownerType === 'shared'
                      ? 'fa-solid fa-user-group'
                      : 'fa-solid fa-user'
                  "
                ></i></span></template
            ><template #option-leading="{ option }"
              ><span class="wallet-account-avatar"
                ><img
                  v-if="accountAvatar(option.value) && !failedAvatars[accountAvatar(option.value)]"
                  :src="accountAvatar(option.value)"
                  alt=""
                  @error="failedAvatars[accountAvatar(option.value)] = true" /><i
                  v-else
                  :class="
                    accounts.find(a => a.id === option.value)?.ownerType === 'shared'
                      ? 'fa-solid fa-user-group'
                      : 'fa-solid fa-user'
                  "
                ></i></span></template></WaveSelect
        ></template>
        ></WaveWalletPanel
      >
    </template>
    <p v-else class="chat-settings-note">进入聊天后可设置钱包账户。</p>
  </section>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { usePhoneStore } from '../stores/phone';
import { accountWallet, currencies } from '../services/wallet-accounts';
import WaveSelect from './WaveSelect.vue';
import WaveWalletPanel from './WaveWalletPanel.vue';
const props = defineProps<{ mode: 'mine' | 'app' | 'settings'; artwork?: string; userAvatar?: string }>();
defineEmits<{ settings: [] }>();
const phone = usePhoneStore();
const failedAvatars = reactive<Record<string, boolean>>({});
function accountAvatar(id: string): string {
  const target = accounts.value.find(a => a.id === id);
  return target?.ownerType === 'user'
    ? phone.state.moments.profile.avatar || props.userAvatar || ''
    : target?.ownerType === 'char'
      ? phone.state.identities[target.ownerId]?.avatar || ''
      : '';
}
const balanceTouched = ref(false);
const selectedId = ref(''),
  feedback = ref('');
const accounts = computed(() => phone.walletAccounts.filter(a => props.mode !== 'mine' || a.ownerType !== 'char'));
const options = computed(() =>
  accounts.value.map(a => ({
    value: a.id,
    label: `${a.ownerType === 'user' ? '我的' : a.ownerType === 'char' ? '角色' : '共享'} · ${a.name}`,
  })),
);
const account = computed(() => accounts.value.find(a => a.id === selectedId.value));
const raw = computed(() => (account.value ? JSON.stringify(accountWallet(phone.state.walletBook, account.value)) : ''));
const sharedId = computed(() => phone.state.walletBook.selectedShared[phone.activeIdentity?.charKey || ''] || '');
const sharedOptions = computed(() => [
  { value: '', label: '角色自己的钱包' },
  ...phone.walletAccounts.filter(a => a.ownerType === 'shared').map(a => ({ value: a.id, label: a.name })),
]);
const currencyOptions = currencies.map(value => ({ value, label: value }));
const draft = reactive({ name: '', currency: 'CNY', balance: '', bankName: '', cardLabel: '', cardLastFour: '' });
watch(
  () => [phone.state.activeCharKey, props.mode, accounts.value.map(a => a.id).join('|')],
  () => {
    if (!accounts.value.some(a => a.id === selectedId.value))
      selectedId.value = props.mode === 'mine' ? 'user' : `char:${phone.activeIdentity?.charKey}`;
  },
  { immediate: true },
);
watch(
  selectedId,
  value => {
    if (props.mode === 'app') phone.walletSelectedAccountId = value;
  },
  { immediate: true },
);
watch(
  account,
  value => {
    if (!value) return;
    Object.assign(draft, {
      name: value.name,
      currency: value.currency,
      balance: accountWallet(phone.state.walletBook, value).balance?.toString() || '',
      bankName: value.bankName,
      cardLabel: value.cardLabel,
      cardLastFour: value.cardLastFour,
    });
    feedback.value = '';
    balanceTouched.value = false;
  },
  { immediate: true },
);
watch(
  () => draft.currency,
  currency => {
    balanceTouched.value = false;
    if (account.value)
      draft.balance = accountWallet(phone.state.walletBook, { ...account.value, currency }).balance?.toString() || '';
  },
);
function save(): void {
  if (!account.value) return;
  try {
    phone.saveWalletAccount(account.value.id, {
      ...draft,
      balance: balanceTouched.value
        ? String(draft.balance).trim() === ''
          ? null
          : Number(draft.balance)
        : accountWallet(phone.state.walletBook, { ...account.value, currency: draft.currency }).balance,
    });
    feedback.value = '账户已保存';
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : String(error);
  }
}
function createShared(): void {
  try {
    selectedId.value = phone.createSharedWallet('共同生活账户');
  } catch (error) {
    feedback.value = String(error);
  }
}
function selectShared(id: string): void {
  phone.selectSharedWallet(id);
}
</script>
<style scoped>
.wallet-workspace {
  color: var(--wave-ink, #374558);
  min-width: 0;
}
.wallet-workspace-app {
  box-sizing: border-box;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  padding: 16px 18px 24px;
}
.wallet-workspace-settings {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.wallet-account-group {
  margin-bottom: 16px;
}
.wallet-account-form {
  display: grid;
  gap: 16px;
}
.wallet-account-form label {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.wallet-account-form input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 12px 14px;
  background: var(--wave-tint, #f3f3f3);
  border: 1px solid rgba(35, 35, 38, 0.08);
  border-radius: 14px;
  color: inherit;
  font: inherit;
}
.wallet-account-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.wallet-account-action {
  padding: 12px 16px;
  width: 100%;
  border: 0;
  border-radius: 14px;
  color: #5e80be;
  background: var(--wave-tint, #f3f3f3);
  font: inherit;
  cursor: pointer;
}
#wave-phone-script-root .wallet-workspace :deep(.wallet-page) {
  padding: 0;
  height: auto;
  min-height: 0;
  overflow: visible;
  flex: none;
}
#wave-phone-script-root .wallet-workspace .wallet-account-switch {
  position: absolute;
  right: 16px;
  top: 16px;
  width: 64px;
  z-index: 5;
}
#wave-phone-script-root .wallet-workspace :deep(.wallet-account-switch .wave-select-trigger) {
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  gap: 6px;
}
#wave-phone-script-root
  .wallet-workspace
  :deep(.wallet-account-switch .wave-select-trigger > span:not(.wallet-account-avatar)) {
  display: none;
}
#wave-phone-script-root .wallet-workspace :deep(.wallet-account-switch .wave-select-menu) {
  width: min(280px, 72vw);
  left: auto;
  right: 0;
}
#wave-phone-script-root .wallet-workspace :deep(.wallet-account-switch .wave-select-menu button) {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
}
#wave-phone-script-root .wallet-workspace .wallet-account-avatar {
  display: grid;
  place-items: center;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  overflow: hidden;
  border-radius: 50%;
  background: var(--wave-tint, #f3f3f3);
  color: #5e80be;
}
#wave-phone-script-root .wallet-workspace .wallet-account-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
