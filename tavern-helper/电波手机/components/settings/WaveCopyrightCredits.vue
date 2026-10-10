<template>
  <section class="credits-page" aria-labelledby="credits-title">
    <header class="credits-intro">
      <span>ABOUT ELECTRIC PHONE</span>
      <h2 id="credits-title">版权与致谢</h2>
      <p>感谢每一份灵感、支持与测试，让电波手机慢慢长成现在的样子。</p>
    </header>

    <article class="credits-card copyright-card">
      <div class="credits-card-heading">
        <span class="credits-icon"><i class="fa-solid fa-copyright"></i></span>
        <div>
          <small>COPYRIGHT</small>
          <div class="wave-settings-title">版权声明</div>
        </div>
      </div>
      <p>本脚本为原创开源的酒馆助手内置小手机脚本，基础内容源自<strong>日月西 TA的手机</strong>脚本模块。</p>
      <div class="license-notes">
        <div>
          <i class="fa-solid fa-check"></i>
          <span><strong>允许</strong>个人自用与二次修改</span>
        </div>
        <div class="is-restricted">
          <i class="fa-solid fa-ban"></i>
          <span><strong>禁止</strong>二次传播与任何形式的商业化使用</span>
        </div>
      </div>
    </article>

    <article class="credits-card thanks-card">
      <div class="credits-card-heading">
        <span class="credits-icon"><i class="fa-solid fa-heart"></i></span>
        <div>
          <small>WITH THANKS</small>
          <div class="wave-settings-title">鸣谢清单</div>
        </div>
      </div>
      <ul>
        <li>
          感谢 <strong>Ephone、糯米机、糯叽机、float、柏柏小手机</strong>
          等优秀的免费开源小手机，带来的开发灵感与部分模块设计思路。
        </li>
        <li>
          感谢
          <a
            href="https://discord.com/channels/1291925535324110879/1356554161713582123"
            target="_blank"
            rel="noopener noreferrer"
            >柏柏音乐播放器 <i class="fa-solid fa-arrow-up-right-from-square"></i
          ></a>
          提供的音乐搜索 API 与模块调用参考。
        </li>
        <li>界面设计主要参考了 <strong>iCity、QQ、QQ 音乐、Safari 浏览器</strong>等产品，如有侵权请联系删除。</li>
        <li>感谢所有帮忙测试脚本、捕捉 Bug 的宝宝们。</li>
      </ul>
    </article>

    <article class="credits-card thanks-card">
      <div class="credits-card-heading">
        <span class="credits-icon"><i class="fa-solid fa-code-branch"></i></span>
        <div>
          <small>OPEN SOURCE</small>
          <div class="wave-settings-title">开源项目与素材</div>
        </div>
      </div>
      <p>感谢以下项目。第三方代码与素材遵循各自许可证，上方自有内容使用约定不限制它们原有的授权。</p>
      <ul>
        <li v-for="project in projects" :key="project.url">
          <a :href="project.url" target="_blank" rel="noopener noreferrer"
            >{{ project.name }} <i class="fa-solid fa-arrow-up-right-from-square"></i
          ></a>
          <span> · {{ project.license }}</span
          ><br />{{ project.note }}
        </li>
      </ul>
    </article>
    <p class="credits-version">电波手机 · v{{ WAVE_PHONE_RELEASE_VERSION }}</p>
  </section>
</template>

<script setup lang="ts">
import { WAVE_PHONE_RELEASE_VERSION } from '../../schemas';
const projects = [
  {
    name: 'Folia',
    url: 'https://github.com/chthollyphile/folia-major',
    license: 'AGPL-3.0',
    note: '音乐账号、多平台搜索、聚合检索及翻译／音译歌词的实现参考；电波手机按现有接口独立适配。',
  },
  {
    name: 'NeteaseCloudMusicApi Enhanced',
    url: 'https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced',
    license: 'MIT',
    note: '网易云登录、个人歌单、搜索与歌词接口。',
  },
  {
    name: 'QQ Music API',
    url: 'https://github.com/yakult-green-tea/qq-music-api',
    license: 'MIT',
    note: 'QQ 音乐扫码登录、歌单及账号播放接口。',
  },
  {
    name: 'KuGouMusicApi',
    url: 'https://github.com/MakcRe/KuGouMusicApi',
    license: 'MIT',
    note: '酷狗登录、歌单、搜索与歌词接口。',
  },
  {
    name: 'GDStudio / VKeys / Meting',
    url: 'https://github.com/metowolf/Meting',
    license: '接口服务按各自使用条款 · Meting MIT',
    note: '原有音乐聚合搜索的公开音源；接口可用性由各服务维护。',
  },
  {
    name: 'AMLL TTML DB',
    url: 'https://github.com/Steve-xmh/amll-ttml-db',
    license: '以项目与各歌词条目的授权为准',
    note: 'TTML 原文、翻译与音译歌词的补充来源。',
  },
  {
    name: 'DiceBear',
    url: 'https://www.dicebear.com/licenses/',
    license: '生成器 MIT · 本地素材 CC0 / CC BY 4.0',
    note: '240 张世界用户头像与 72 张匿名头像。使用 Lisa Wischofsky、The Visual Team、vijay verma、Davis Uche、Micah Lanier、Zoish、Pablo Stanley、Draftbit 与 DiceBear 的作品；已组合配色并转为 WebP，逐项来源与许可随头像库附带。',
  },
  {
    name: '头像素材署名清单',
    url: 'https://github.com/colerith/Electric-Phone/blob/main/assets/avatars/v1/ATTRIBUTION.md',
    license: '逐风格作者、原作链接与许可',
    note: '查看每种头像的原作来源、使用许可与加工说明。',
  },
  {
    name: '酒馆扩展模板',
    url: 'https://github.com/StageDog/tavern_extension_template',
    license: '部署结构参考',
    note: '酒馆前端扩展的目录与部署方式。',
  },
  {
    name: 'SillyTavern / Tavern Helper',
    url: 'https://github.com/N0VI028/JS-Slash-Runner',
    license: '各项目原许可证',
    note: '酒馆运行环境、脚本接口与扩展桥接。',
  },
];
</script>

<style scoped lang="scss">
.credits-page {
  display: grid;
  gap: 16px;
  min-width: 0;
  color: var(--settings-text);
}

.credits-intro {
  padding: 4px 4px 2px;
}

.credits-intro > span,
.credits-card-heading small {
  color: var(--settings-accent);
  font: 600 9px/1.4 var(--wave-ui-font);
  letter-spacing: 0.16em;
}

.credits-intro h2 {
  margin: 0;
  color: var(--settings-text);
  font-family: var(--wave-display-font);
}

.credits-intro h2 {
  margin-top: 5px;
  font-size: 21px;
  line-height: 1.35;
}

.credits-intro p,
.credits-card p,
.credits-card li {
  color: var(--settings-muted);
  font: 400 12px/1.75 var(--wave-ui-font);
  overflow-wrap: anywhere;
}

.credits-intro p {
  margin: 7px 0 0;
}

.credits-card {
  box-sizing: border-box;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--settings-line);
  border-radius: 20px;
  background: var(--wave-card);
}

.credits-card-heading {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.credits-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 13px;
  background: color-mix(in srgb, var(--settings-accent) 13%, var(--wave-card));
  color: var(--settings-accent);
  font-size: 15px;
}

.credits-card > p {
  margin: 16px 0 0;
}

.credits-card strong {
  color: var(--settings-text);
  font-weight: 600;
}

.license-notes {
  display: grid;
  gap: 8px;
  margin-top: 15px;
}

.license-notes > div {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, #78a98b 12%, var(--settings-control));
  color: var(--settings-muted);
  font: 400 11px/1.6 var(--wave-ui-font);
}

.license-notes i {
  margin-top: 2px;
  color: #629276;
}

.license-notes .is-restricted {
  background: color-mix(in srgb, #c66d7c 11%, var(--settings-control));
}

.license-notes .is-restricted i {
  color: #b95f70;
}

.thanks-card ul {
  display: grid;
  gap: 0;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}

.thanks-card li {
  position: relative;
  margin: 0;
  padding: 12px 0 12px 19px;
  border-bottom: 1px solid var(--settings-line);
}

.thanks-card li::before {
  position: absolute;
  top: 20px;
  left: 2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--settings-accent);
  content: '';
}

.thanks-card li:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.thanks-card a {
  color: var(--settings-accent);
  font-weight: 600;
  text-decoration: none;
}

.thanks-card a i {
  margin-left: 3px;
  font-size: 9px;
}

.credits-version {
  margin: 0;
  padding: 2px 0 8px;
  color: var(--settings-muted);
  font: 400 10px/1.5 var(--wave-ui-font);
  text-align: center;
  letter-spacing: 0.08em;
}
</style>
