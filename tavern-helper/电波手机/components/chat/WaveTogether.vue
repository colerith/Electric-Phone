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
    <span class="together-avatars">
      <span><img v-if="userAvatar" :src="userAvatar" alt="我" /><template v-else>我</template></span>
      <span
        ><img
          v-if="phone.activeIdentity?.avatar"
          :src="phone.activeIdentity.avatar"
          :style="characterAvatarStyle"
          alt="角色"
        /><template v-else>TA</template></span
      >
    </span>
    <span
      ><strong>{{ music.playing ? '一起听' : '一起听 · 已暂停' }} · {{ music.current.title }}</strong
      ><small>与你听了 {{ Math.floor(music.togetherSeconds / 60) }} 分 {{ music.togetherSeconds % 60 }} 秒</small></span
    >
    <i class="fa-solid fa-headphones"></i>
  </button>
</template>
<script setup lang="ts">
import type { CSSProperties } from 'vue';
defineProps<{ userAvatar: string; characterAvatarStyle?: CSSProperties }>();
import { useMusicStore } from '../../stores/music';
import { usePhoneStore } from '../../stores/phone';
const music = useMusicStore(),
  phone = usePhoneStore();
</script>

<style scoped lang="scss">
#wave-phone-script-root .music-together .together-avatars > span {
  overflow: hidden;
  flex-shrink: 0;
}
#wave-phone-script-root .music-together .together-avatars > span > img {
  width: 100%;
  height: 100%;
  min-width: 0;
  border: 0;
  border-radius: 0;
  display: block;
  object-fit: cover;
}
</style>
