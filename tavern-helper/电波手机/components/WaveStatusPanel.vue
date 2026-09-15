<template>
  <div class="wave-status-panel">
    <article class="app-card status-profile-card" aria-label="角色档案">
      <div class="status-section-label">
        <span>STATUS PROFILE</span><i class="fa-solid fa-wave-square" aria-hidden="true"></i>
      </div>
      <div class="status-profile-main">
        <span class="status-avatar"
          ><img v-if="avatar" :src="avatar" alt="" /><span v-else>{{ displayName.slice(0, 1) }}</span></span
        >
        <div class="status-profile-copy">
          <strong class="status-profile-name">{{ displayName }}</strong
          ><span class="status-terminal"><span></span>{{ raw.trim() ? '当前角色档案' : '等待状态更新' }}</span>
        </div>
      </div>
    </article>
    <div class="status-vitals-grid">
      <article
        v-for="item in metrics"
        :key="item.key"
        class="app-card status-vital-card"
        :class="`status-vital-${item.key}`"
      >
        <div class="status-section-label">
          <span>{{ item.eyebrow }}</span
          ><i :class="item.icon" aria-hidden="true"></i>
        </div>
        <strong class="status-section-name">{{ item.label }}</strong>
        <div class="status-vital-number">
          <strong>{{ item.metric.value ?? '—' }}</strong
          ><span v-if="item.metric.value !== null">%</span>
        </div>
        <div
          v-if="item.metric.value !== null"
          class="status-progress"
          role="progressbar"
          :aria-label="item.label"
          :aria-valuenow="item.metric.value"
          :aria-valuemin="0"
          :aria-valuemax="100"
        >
          <span :style="{ width: `${item.metric.value}%` }"></span>
        </div>
        <div v-else class="status-progress" aria-hidden="true"></div>
        <p class="status-vital-note">
          {{ item.metric.description || (item.metric.value === null ? '尚无指标数据' : '暂无变化说明') }}
        </p>
      </article>
    </div>
    <article class="app-card status-mood-card" aria-label="情绪气泡">
      <div class="status-section-heading"><strong>情绪气泡</strong><span>MOOD</span></div>
      <div v-if="profile.moods.length" class="status-mood-list">
        <span v-for="mood in profile.moods" :key="mood">{{ mood }}</span>
      </div>
      <p v-else class="status-placeholder">还没有捕捉到此刻的情绪。</p>
    </article>
    <article class="app-card status-thought-card" aria-label="隐秘心声">
      <div class="status-section-heading"><strong>隐秘心声</strong><span>ANALYSIS</span></div>
      <div class="status-thought-body">
        <span class="status-quote-mark" aria-hidden="true">“</span>
        <p :class="{ 'status-placeholder': !profile.thought }">{{ profile.thought || '心声尚未记录。' }}</p>
      </div>
    </article>
    <article class="app-card status-organs-card" aria-label="器官状态">
      <div class="status-section-heading"><strong>器官状态</strong><span>ORGANS</span></div>
      <div v-if="profile.organs.length" class="status-organ-list">
        <div v-for="(organ, index) in profile.organs" :key="`${organ.name}-${index}`" class="status-organ-item">
          <div class="status-organ-heading">
            <span class="status-organ-dot" aria-hidden="true"></span><strong>{{ organ.name }}</strong>
          </div>
          <p>{{ organ.description || '尚无详细描述' }}</p>
        </div>
      </div>
      <p v-else class="status-placeholder">暂无身体感受记录。</p>
    </article>
    <div class="status-footnote">
      <i class="fa-solid fa-wave-square" aria-hidden="true"></i><span>随故事更新 · 留住此刻的讯号</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { parseStatusProfile } from '../services/status';
const props = defineProps<{ raw: string; name: string; avatar: string }>();
const profile = computed(() => parseStatusProfile(props.raw));
const displayName = computed(() => props.name || profile.value.name || 'TA');
const metrics = computed(() => [
  { key: 'favor', eyebrow: 'VITALS', label: '好感指数', icon: 'fa-regular fa-heart', metric: profile.value.favor },
  {
    key: 'desire',
    eyebrow: 'DESIRE',
    label: '性欲指数',
    icon: 'fa-solid fa-wave-square',
    metric: profile.value.desire,
  },
]);
</script>
