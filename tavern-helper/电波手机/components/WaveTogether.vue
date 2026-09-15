<template>
  <button
    v-if="music.current"
    class="music-together"
    type="button"
    @click="
      phone.currentPage = 'music';
      music.view = 'player';
    "
  >
    <span class="together-avatars"
      ><img v-if="avatar" :src="avatar" alt="我" /><span v-else>我</span
      ><img v-if="phone.activeIdentity?.avatar" :src="phone.activeIdentity.avatar" alt="角色" /><span v-else
        >TA</span
      ></span
    >
    <span
      ><strong>{{ music.playing ? '一起听' : '一起听 · 已暂停' }} · {{ music.current.title }}</strong
      ><small>与你听了 {{ Math.floor(music.togetherSeconds / 60) }} 分 {{ music.togetherSeconds % 60 }} 秒</small></span
    >
    <i class="fa-solid fa-headphones"></i>
  </button>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useMusicStore } from '../stores/music';
import { usePhoneStore } from '../stores/phone';
const music = useMusicStore(),
  phone = usePhoneStore();
const avatar = computed(() => {
  const value = $('#user_avatar_block .avatar-container.selected').attr('data-avatar-id');
  return value ? SillyTavern.getThumbnailUrl('persona', value) : '/img/user-default.png';
});
</script>
