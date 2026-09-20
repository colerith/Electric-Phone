<template>
  <div class="moments-view" :class="{ 'space-moments': context === 'space' }">
    <WaveDeleteConfirm v-if="deleting" title="删除这条动态？" @cancel="deleting = ''" @confirm="confirmDelete" />
    <WaveNpcProfile v-if="viewingNpc" :npc-id="viewingNpc" />
    <template v-else-if="view === 'feed' && !embedded">
      <div class="moments-cover">
        <button type="button" class="moments-cover-edit" @click="editImage('cover')">更换封面</button>
        <div class="moments-cover-person">
          <strong>{{ userName }}</strong
          ><button type="button" class="moments-avatar" aria-label="修改我的头像" @click="editImage('avatar')">
            <img v-if="userAvatar" :src="userAvatar" alt="" /><span v-else>{{ userName.slice(0, 1) }}</span>
          </button>
        </div>
      </div>
      <div class="moments-signature">{{ phone.state.moments.profile.signature || '记录生活里的小事' }}</div>
    </template>
    <section v-else-if="view === 'me' && panel === 'home'" :class="{ 'space-user-card': context === 'space' }">
      <button
        v-if="context === 'space'"
        type="button"
        class="space-me-cover"
        :style="{
          backgroundImage: phone.state.moments.profile.cover
            ? `url(${JSON.stringify(phone.state.moments.profile.cover)})`
            : undefined,
        }"
        aria-label="设置我的空间封面"
        @click="editImage('cover')"
      ></button>
      <div class="moments-me-profile">
        <button type="button" class="moments-avatar" aria-label="编辑个人资料" @click="openProfile">
          <img v-if="userAvatar" :src="userAvatar" alt="" /><span v-else>{{ userName.slice(0, 1) }}</span>
        </button>
        <div>
          <strong>{{ userName }}</strong
          ><small v-if="phone.state.moments.profile.account"
            >@{{ phone.state.moments.profile.account.replace(/^@+/, '') }}</small
          >
          <WaveProfileDecorations
            v-if="context !== 'messenger'"
            :title="phone.state.moments.profile.title"
            :title-color="phone.state.moments.profile.titleColor"
            :badges="phone.state.moments.profile.badges"
          />
          <p>{{ phone.state.moments.profile.signature || '还没有填写个性签名' }}</p>
        </div>
      </div>
      <div class="moments-me-menu">
        <button type="button" @click="openProfile">
          <i class="fa-regular fa-id-card"></i><span>编辑资料</span><i class="fa-solid fa-chevron-right"></i></button
        ><button v-if="context !== 'space'" type="button" @click="panel = 'wallet'">
          <i class="fa-solid fa-wallet"></i><span>我的钱包</span><i class="fa-solid fa-chevron-right"></i></button
        ><button v-if="context !== 'messenger'" type="button" @click="panel = 'settings'">
          <i class="fa-regular fa-comments"></i><span>空间互动</span><i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
      <div v-if="context === 'space'" class="space-profile-stats">
        <span
          ><b>{{ ownPosts.length }}</b> 动态</span
        ><span
          ><b>{{ receivedLikes }}</b> 被喜欢</span
        >
      </div>
    </section>
    <WaveWalletWorkspace v-else-if="panel === 'wallet'" mode="mine" />
    <template v-else-if="panel === 'profile'">
      <section class="settings-card system-settings-card moments-form space-settings-card">
        <div class="wave-settings-title">手机资料</div>
        <button type="button" class="moments-profile-avatar" @click="editImage('draftAvatar')">
          <img v-if="profileDraft.avatar || userAvatar" :src="profileDraft.avatar || userAvatar" alt="" /><span
            >修改头像</span
          ></button
        ><label>昵称<input v-model="profileDraft.nickname" maxlength="40" :placeholder="userName" /></label
        ><label>账号<input v-model="profileDraft.account" maxlength="40" placeholder="设置你的手机账号" /></label
        ><label
          >个性签名<textarea
            v-model="profileDraft.signature"
            maxlength="240"
            rows="3"
            placeholder="说说现在的心情"
          ></textarea></label
        ><label>个人称号<input v-model="profileDraft.title" maxlength="48" placeholder="为自己设计一个称号" /></label>
        <fieldset class="space-title-palette">
          <legend>称号颜色</legend>
          <div>
            <button
              v-for="item in titleColors"
              :key="item.color"
              type="button"
              :style="{ backgroundColor: item.color }"
              :aria-label="item.label"
              :aria-pressed="profileDraft.titleColor === item.color"
              @click="profileDraft.titleColor = item.color"
            >
              <i v-if="profileDraft.titleColor === item.color" class="fa-solid fa-check"></i>
            </button>
          </div>
        </fieldset>
        <WaveProfileDecorations
          :title="profileDraft.title"
          :title-color="profileDraft.titleColor"
          :badges="profileDraft.badges"
        />
        <fieldset class="space-anonymous-profile">
          <legend>匿名身份</legend>
          <div class="space-anonymous-preview">
            <WaveAnonymousAvatar :seed="profileDraft.anonymousAvatarSeed" /><strong>{{
              profileDraft.anonymousId
            }}</strong>
          </div>
          <div class="space-anonymous-randomizers">
            <button type="button" @click="profileDraft.anonymousAvatarSeed = randomAnonymousAvatarSeed()">
              <i class="fa-solid fa-shuffle"></i> 随机头像
            </button>
            <button type="button" @click="profileDraft.anonymousId = randomAnonymousId(profileDraft.anonymousId)">
              <i class="fa-solid fa-shuffle"></i> 随机匿名 ID
            </button>
          </div>
          <small>随机遇见一个美食昵称和专属头像，仅在匿名树洞使用。</small>
        </fieldset>
        <WaveProfileBadgePicker v-model="profileDraft.badges" />
        <button class="settings-save-wide" type="button" @click="saveProfile">保存资料</button>
      </section>
    </template>
    <template v-else-if="panel === 'settings'">
      <WaveBilingualSettings :prefs="settings" @update="Object.assign(settings, $event)" @save="saveSettings" />
      <section class="settings-card system-settings-card moments-form space-settings-card">
        <div class="wave-settings-title">世界动态 · 参与者</div>
        <div class="system-toggle-row">
          <span>跟随聊天自动生成</span
          ><WaveToggle v-model="settings.followEnabled" aria-label="空间动态跟随聊天自动生成" />
        </div>
        <p>随酒馆正文请求生成，不额外调用接口；每轮最多一帖，点赞与评论共用 1–3 次互动上限。</p>
        <div class="wave-settings-caption">会发帖和评论的角色</div>
        <div class="moments-choices" role="group" aria-label="会发帖的角色">
          <button
            v-for="contact in contacts"
            :key="contact.charKey"
            type="button"
            :aria-pressed="settings.postingCharKeys.includes(contact.charKey)"
            @click="toggleActor(contact.charKey)"
          >
            {{ displayIdentityName(contact)
            }}<i
              :class="
                settings.postingCharKeys.includes(contact.charKey) ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'
              "
            ></i>
          </button>
        </div>
        <p v-if="!contacts.length">暂无可选联系人</p>
        <div class="system-toggle-row">
          <span>允许场景 NPC 参与</span
          ><WaveToggle v-model="settings.npcEnabled" aria-label="允许场景 NPC 参与空间动态" />
        </div>
        <div class="system-toggle-row">
          <span><strong>允许陌生人参与</strong><small>与当前场景无关的 NPC，也可以发布动态、评论和点赞</small></span
          ><WaveToggle v-model="settings.strangerEnabled" aria-label="允许陌生人参与世界动态" />
        </div>
        <label v-if="settings.npcEnabled"
          >NPC 生成规则<textarea v-model="settings.npcRules" maxlength="2000" rows="4"></textarea>
        </label>
      </section>
      <section class="settings-card system-settings-card moments-form space-settings-card">
        <div class="wave-settings-title">概率与节奏</div>
        <div class="settings-slider-row">
          <span
            ><strong>发帖概率</strong><b>{{ settings.postProbability }}%</b></span
          ><WaveSlider v-model="settings.postProbability" :min="0" :max="100" :step="5" aria-label="空间动态发帖概率" />
        </div>
        <div class="settings-slider-row">
          <span
            ><strong>评论概率</strong><b>{{ settings.commentProbability }}%</b></span
          ><WaveSlider
            v-model="settings.commentProbability"
            :min="0"
            :max="100"
            :step="5"
            aria-label="空间动态评论概率"
          />
        </div>
        <div class="settings-slider-row">
          <span
            ><strong>点赞概率</strong><b>{{ settings.likeProbability }}%</b></span
          ><WaveSlider v-model="settings.likeProbability" :min="0" :max="100" :step="5" aria-label="空间动态点赞概率" />
        </div>
        <div class="moments-number-pair">
          <label>每轮互动下限<input v-model.number="settings.minInteractions" type="number" min="1" max="3" /></label
          ><label>每轮互动上限<input v-model.number="settings.maxInteractions" type="number" min="1" max="3" /></label>
        </div>
        <p>每轮从范围内随机选择数量上限，点赞和评论共用；概率未命中或没有合适目标时可少于下限。</p>
        <label
          >两轮互动最小间隔（分钟）<input v-model.number="settings.cooldownMinutes" type="number" min="0" max="1440"
        /></label>
        <div class="moments-number-pair">
          <label
            >最短延迟（秒）<input v-model.number="settings.minDelaySeconds" type="number" min="0" max="3600" /></label
          ><label
            >最长延迟（秒）<input v-model.number="settings.maxDelaySeconds" type="number" min="0" max="86400"
          /></label>
        </div>
        <p>生成完成后按延迟逐条显示。关闭手机不会重置等待时间。</p>
        <button class="settings-save-wide" type="button" @click="saveSettings">保存互动设置</button>
      </section>
      <section class="settings-card system-settings-card wave-clear-section">
        <div class="wave-settings-title">世界与个人动态</div>
        <p>清空所有空间动态动态及其点赞、评论，并从后续生成参考中移除。</p>
        <button v-if="!clearConfirm" type="button" class="wave-clear-button" @click="clearConfirm = true">
          <i class="fa-regular fa-trash-can"></i>一键清空空间动态
        </button>
        <div v-else class="wave-clear-confirm">
          <span>确定清空？此操作无法撤销。</span><button type="button" @click="clearConfirm = false">取消</button
          ><button
            type="button"
            class="danger"
            @click="
              phone.clearMoments();
              clearConfirm = false;
            "
          >
            确认清空
          </button>
        </div>
      </section>
    </template>
    <div v-if="context === 'space' && view === 'me' && panel === 'home' && !viewingNpc" class="space-profile-tabs">
      <div role="tablist" aria-label="我的动态筛选">
        <button
          v-for="item in profileTabs"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="profileFilter === item.id"
          @click="profileFilter = item.id"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
    <div
      v-if="
        !viewingNpc &&
        (view === 'feed' || panel === 'own' || (context === 'space' && view === 'me' && panel === 'home'))
      "
      class="moments-feed"
    >
      <article v-for="post in posts" :key="post.id" class="moment-post">
        <header class="space-post-header">
          <button
            type="button"
            class="moment-author-avatar"
            :disabled="!phone.state.moments.npcs[post.authorKey]"
            :aria-label="`查看${nameFor(post.authorKey, post.authorName)}的资料`"
            @click="viewingNpc = post.authorKey"
          >
            <img
              v-if="avatarFor(post.authorKey)"
              :src="avatarFor(post.authorKey)"
              alt=""
              @error="failedAvatars.add(post.authorKey)"
            /><span v-else>{{ nameFor(post.authorKey, post.authorName).slice(0, 1) }}</span>
          </button>
          <div class="space-post-author-details">
            <button
              type="button"
              class="moment-author moment-person-link"
              :disabled="!phone.state.moments.npcs[post.authorKey]"
              @click="viewingNpc = post.authorKey"
            >
              {{ nameFor(post.authorKey, post.authorName) }}
            </button>
            <small v-if="accountFor(post.authorKey)" class="space-post-account"
              >@{{ accountFor(post.authorKey) }}</small
            >
          </div>
        </header>
        <div class="moment-post-main">
          <strong v-if="legacyTitle(post)" class="space-post-title">{{ legacyTitle(post) }}</strong>
          <p class="moment-text">
            {{ legacyTitle(post) ? post.content.slice(legacyTitle(post).length).trimStart() : post.content }}
          </p>
          <WaveModuleTranslation
            inline
            :app="post.id.startsWith('zone:') ? 'zone' : 'moments'"
            :translation="post.translation"
          />
          <div v-if="post.tags.length" class="space-post-tags">
            <span v-for="tag in post.tags" :key="tag">#{{ tag }}</span>
          </div>
          <div v-if="post.images.length" class="moment-media-grid" :class="{ single: post.images.length === 1 }">
            <button v-for="(media, index) in post.images" :key="index" type="button" @click="preview = media">
              <img v-if="media.kind === 'image'" :src="media.url" :alt="media.description || '空间动态图片'" /><span
                v-else
                ><i class="fa-regular fa-image"></i>{{ media.description }}</span
              >
            </button>
          </div>
          <div v-if="post.location" class="moment-location">
            <i class="fa-solid fa-location-dot"></i>{{ post.location }}
          </div>
          <div v-if="post.mentions.length" class="moment-mentions">
            提醒 {{ post.mentions.map(key => nameFor(key, '联系人')).join('、') }} 看
          </div>
          <div class="moment-meta">
            <small
              >{{ timeLabel(post.createdAt)
              }}<template v-if="post.authorKey === 'user'"> · {{ visibilityLabel(post) }}</template></small
            ><button
              type="button"
              :aria-pressed="likesFor(post.id).some(like => like.authorKey === 'user')"
              @click="phone.likeMoment(post.id)"
            >
              <i class="fa-regular fa-heart"></i>{{ post.legacyLikeCount + likesFor(post.id).length || '赞' }}</button
            ><button
              type="button"
              @click="
                commenting = commenting === post.id ? '' : post.id;
                replyingComment = null;
              "
            >
              <i class="fa-regular fa-comment"></i>评论</button
            ><button
              type="button"
              aria-label="转发空间动态"
              @click="$emit('share', post, nameFor(post.authorKey, post.authorName))"
            >
              <i class="fa-solid fa-arrow-up-from-bracket"></i>转发
            </button>
            <button type="button" class="wave-content-delete" aria-label="删除空间动态" @click="deleting = post.id">
              <i class="fa-regular fa-trash-can"></i>删除
            </button>
          </div>
          <div v-if="likesFor(post.id).length || commentsFor(post.id).length" class="moment-interactions">
            <div v-if="likesFor(post.id).length" class="moment-likes">
              ♡
              <template v-for="(like, index) in likesFor(post.id)" :key="like.id"
                ><span v-if="index">、</span
                ><button
                  type="button"
                  class="moment-person-link"
                  :disabled="!phone.state.moments.npcs[like.authorKey]"
                  @click="viewingNpc = like.authorKey"
                >
                  {{ nameFor(like.authorKey, like.authorName) }}
                </button></template
              >
            </div>
            <div v-for="comment in commentsFor(post.id)" :key="comment.id" class="moment-comment-row space-comment">
              <span class="space-comment-avatar"
                ><img v-if="avatarFor(comment.authorKey)" :src="avatarFor(comment.authorKey)" alt="" /><span v-else>{{
                  nameFor(comment.authorKey, comment.authorName).slice(0, 1)
                }}</span></span
              >
              <div class="space-comment-main">
                <header>
                  <button
                    type="button"
                    class="moment-person-link"
                    :disabled="!phone.state.moments.npcs[comment.authorKey]"
                    @click="viewingNpc = comment.authorKey"
                  >
                    {{ nameFor(comment.authorKey, comment.authorName) }}</button
                  ><time>{{ timeLabel(comment.createdAt) }}</time>
                </header>
                <p>
                  <span v-if="comment.replyToAuthorName" class="space-mention"
                    >@{{ nameFor(comment.replyToAuthorKey, comment.replyToAuthorName) }} </span
                  >{{ comment.content }}
                </p>
                <WaveModuleTranslation
                  inline
                  :app="post.id.startsWith('zone:') ? 'zone' : 'moments'"
                  :translation="comment.translation"
                />
                <button type="button" class="moment-reply-action" @click="startReply(post.id, comment)">回复</button>
              </div>
            </div>
          </div>
          <form v-if="commenting === post.id" class="moment-comment-form" @submit.prevent="sendComment(post.id)">
            <div v-if="replyingComment" class="moment-reply-target">
              回复 {{ nameFor(replyingComment.authorKey, replyingComment.authorName) }}
              <button type="button" aria-label="取消回复" @click="replyingComment = null">×</button>
            </div>
            <input
              v-model="commentText"
              maxlength="500"
              :placeholder="
                replyingComment ? `回复 ${nameFor(replyingComment.authorKey, replyingComment.authorName)}…` : '写评论…'
              "
              aria-label="评论内容"
            /><button type="submit">发送</button>
          </form>
        </div>
      </article>
      <div v-if="!posts.length" class="messenger-empty">
        {{ view === 'me' ? '还没有发布空间动态' : '还没有动态，发布第一条生活记录吧' }}
      </div>
    </div>
    <p v-if="notice" class="moments-notice" role="status">{{ notice }}</p>
    <Teleport v-if="surface && composing" :to="surface">
      <section
        ref="composerElement"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        class="moment-composer wave-settings-surface"
        aria-label="发布空间动态"
        @keydown.esc.stop.prevent="backFromSelection"
        @keydown.tab="trapFocus"
      >
        <div class="moment-compose-bar">
          <button type="button" @click="backFromSelection">{{ selection ? '‹ 返回' : '取消' }}</button
          ><strong>{{
            selection === 'mentions' ? '提醒谁看' : selection === 'audience' ? '选择可见联系人' : '发布空间动态'
          }}</strong
          ><button v-if="selection" type="button" @click="selection = ''">完成</button
          ><button v-else type="button" class="moment-publish" @click="publish">发表</button>
        </div>
        <div v-if="selection" class="moment-compose-body">
          <input v-model="selectionQuery" placeholder="搜索联系人" aria-label="搜索联系人" />
          <div class="moments-choices" role="group" :aria-label="selection === 'mentions' ? '提醒谁看' : '谁可以看'">
            <button
              v-for="contact in filteredContacts"
              :key="contact.charKey"
              type="button"
              :aria-pressed="draft[selection].includes(contact.charKey)"
              @click="togglePerson(contact.charKey)"
            >
              {{ displayIdentityName(contact)
              }}<i
                :class="
                  draft[selection].includes(contact.charKey) ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'
                "
              ></i>
            </button>
          </div>
        </div>
        <div v-else class="moment-compose-body moment-compose-form">
          <textarea
            v-model="draft.content"
            maxlength="5000"
            rows="5"
            placeholder="这一刻的想法…"
            aria-label="空间动态文本"
          ></textarea>
          <div v-if="draft.images.length" class="moment-draft-images">
            <div v-for="(media, index) in draft.images" :key="index">
              <button type="button" @click="preview = media">
                <img v-if="media.kind === 'image'" :src="media.url" :alt="media.description || '图片'" /><span v-else>{{
                  media.description
                }}</span></button
              ><button
                type="button"
                class="moment-remove-image"
                :aria-label="`移除第${index + 1}张图片`"
                @click="draft.images.splice(index, 1)"
              >
                ×
              </button>
            </div>
          </div>
          <div class="moment-add-media">
            <button type="button" :disabled="draft.images.length >= 9" @click="editImage('post')">
              <i class="fa-regular fa-image"></i> 上传真实图片</button
            ><button type="button" :disabled="draft.images.length >= 9" @click="describing = true">
              添加文字描述图</button
            ><small>{{ draft.images.length }}/9</small>
          </div>
          <div class="space-tag-editor">
            <label for="wave-post-tag">话题标签</label>
            <div class="space-tag-entry">
              <input
                id="wave-post-tag"
                v-model="tagDraft"
                maxlength="26"
                :disabled="draft.tags.length >= MAX_POST_TAGS"
                placeholder="# 添加话题，回车确认"
                @keydown.enter="addTag"
              /><button
                type="button"
                :disabled="!tagDraft.trim() || draft.tags.length >= MAX_POST_TAGS"
                @click="addTag"
              >
                添加
              </button>
            </div>
            <div v-if="draft.tags.length" class="space-post-tags">
              <button
                v-for="tag in draft.tags"
                :key="tag"
                type="button"
                :aria-label="`删除标签 ${tag}`"
                @click="draft.tags = draft.tags.filter(item => item !== tag)"
              >
                #{{ tag }} <span aria-hidden="true">×</span>
              </button>
            </div>
            <small>{{ draft.tags.length }}/{{ MAX_POST_TAGS }}</small>
          </div>
          <label>所在位置<input v-model="draft.location" maxlength="200" placeholder="填写位置（选填）" /></label
          ><button type="button" class="moment-compose-row" @click="choose('mentions')">
            <span>提醒谁看</span
            ><small>{{
              draft.mentions.length ? draft.mentions.map(key => nameFor(key, '联系人')).join('、') : '不提醒'
            }}</small
            ><i class="fa-solid fa-chevron-right"></i></button
          ><label
            >谁可以看<WaveSelect v-model="draft.visibility" :options="visibilityOptions" aria-label="谁可以看" /></label
          ><button
            v-if="draft.visibility === 'include' || draft.visibility === 'exclude'"
            type="button"
            class="moment-compose-row"
            @click="choose('audience')"
          >
            <span>{{ draft.visibility === 'include' ? '可见联系人' : '不可见联系人' }}</span
            ><small>已选 {{ draft.audience.length }} 人</small><i class="fa-solid fa-chevron-right"></i>
          </button>
          <p v-if="composeError" role="status">{{ composeError }}</p>
        </div>
      </section>
    </Teleport>
    <Teleport v-if="surface && (describing || preview)" :to="surface"
      ><div
        class="moments-media-modal"
        @click.self="
          describing = false;
          preview = null;
        "
        @keydown.esc.stop.prevent="
          describing = false;
          preview = null;
        "
      >
        <section
          ref="mediaElement"
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          :aria-label="describing ? '添加文字描述图' : '图片预览'"
          @keydown.tab="trapFocus"
        >
          <button
            type="button"
            class="moment-media-close"
            aria-label="关闭"
            @click="
              describing = false;
              preview = null;
            "
          >
            ×</button
          ><template v-if="describing"
            ><div class="wave-settings-title">文字描述图</div>
            <textarea
              v-model="description"
              maxlength="1000"
              rows="5"
              placeholder="描述照片里的画面…"
              aria-label="图片画面描述"
            ></textarea
            ><button type="button" class="settings-save-wide" @click="addDescription">添加图片</button></template
          ><template v-else-if="preview"
            ><img v-if="preview.kind === 'image'" :src="preview.url" :alt="preview.description || '图片预览'" />
            <p v-else>{{ preview.description }}</p></template
          >
        </section>
      </div></Teleport
    >
    <WaveImageUpload
      v-if="imageTarget"
      :key="imageTarget"
      inline
      purpose="artwork"
      :model-value="imageValue"
      :label="imageTarget === 'cover' ? '空间动态封面' : imageTarget === 'post' ? '空间动态图片' : '我的头像'"
      @cancel="imageTarget = ''"
      @confirm="applyImage"
      @reset="applyImage({ avatar: '' })"
    />
  </div>
</template>
<script setup lang="ts">
import WaveAnonymousAvatar from './WaveAnonymousAvatar.vue';
import { randomAnonymousId, randomAnonymousAvatarSeed } from '../../services/space/tree-hole';
import WaveDeleteConfirm from '../shared/WaveDeleteConfirm.vue';
const deleting = ref('');
function confirmDelete() {
  phone.deleteMoment(deleting.value);
  deleting.value = '';
}
import { titleColors } from '../../services/space/profile-badges';
import { PostTagsSchema, MAX_POST_TAGS } from '../../services/space/post-tags';
import WaveProfileDecorations from './WaveProfileDecorations.vue';
import WaveProfileBadgePicker from './WaveProfileBadgePicker.vue';
import { MomentUserProfileSchema } from '../../services/space/moments';
import WaveNpcProfile from './WaveNpcProfile.vue';
import { parseZonePage } from '../../services/space/zone';
import { npcAvatarUrl } from '../../services/space/npc-avatar';
import WaveWalletWorkspace from '../wallet/WaveWalletWorkspace.vue';
import WaveBilingualSettings from '../shared/WaveBilingualSettings.vue';
import WaveModuleTranslation from '../shared/WaveModuleTranslation.vue';
import { computed, inject, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { klona } from 'klona';
import { usePhoneStore } from '../../stores/phone';
import { displayIdentityName } from '../../services/core/identity';
import { phoneSurfaceKey } from '../../services/core/ui-context';
import type { MomentComment, MomentMedia, MomentPost } from '../../services/space/moments';
import WaveImageUpload from '../shared/WaveImageUpload.vue';
import WaveSelect from '../shared/WaveSelect.vue';
import WaveToggle from '../shared/WaveToggle.vue';
import WaveSlider from '../shared/WaveSlider.vue';
const props = withDefaults(
  defineProps<{
    view: 'feed' | 'me';
    userName: string;
    userAvatar: string;
    context?: 'messenger' | 'space';
    embedded?: boolean;
    authorKey?: string;
    query?: string;
    likedOnly?: boolean;
    initialPanel?: 'home' | 'settings';
  }>(),
  { context: 'messenger', initialPanel: 'home', authorKey: '', query: '', likedOnly: false },
);
defineEmits<{ share: [post: MomentPost, author: string] }>();
const phone = usePhoneStore(),
  surface = inject(phoneSurfaceKey, ref(null));
const viewingNpc = ref('');
const failedAvatars = ref(new Set<string>());
const panel = ref<'home' | 'profile' | 'settings' | 'own' | 'wallet'>(props.initialPanel),
  notice = ref('');
const clearConfirm = ref(false);
const settings = computed(() => phone.state.moments.settings);
const contacts = computed(() => phone.identities.filter(identity => identity.source !== 'local_group'));
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000);
});
onUnmounted(() => clearInterval(timer));
const profileTabs = [
  { id: 'own', label: '发布' },
  { id: 'liked', label: '喜欢' },
  { id: 'commented', label: '评论' },
] as const;
const profileFilter = ref<'own' | 'liked' | 'commented'>('own');
const ownPosts = computed(() =>
  phone.momentsFeed.posts.filter(post => post.authorKey === 'user' && post.availableAt <= now.value),
);
const receivedLikes = computed(
  () =>
    phone.momentsFeed.likes.filter(
      like =>
        like.availableAt <= now.value &&
        like.authorKey !== 'user' &&
        ownPosts.value.some(post => post.id === like.postId),
    ).length,
);
const posts = computed(() =>
  phone.momentsFeed.posts.filter(post => {
    if (post.availableAt > now.value || (props.authorKey && post.authorKey !== props.authorKey)) return false;
    if (
      props.query &&
      !`${post.content} ${post.authorName} ${post.tags.join(' ')}`
        .toLocaleLowerCase()
        .includes(props.query.toLocaleLowerCase())
    )
      return false;
    if (props.likedOnly && !likesFor(post.id).some(like => like.authorKey === 'user')) return false;
    if (props.view === 'feed') return true;
    if (profileFilter.value === 'liked') return likesFor(post.id).some(like => like.authorKey === 'user');
    if (profileFilter.value === 'commented') return commentsFor(post.id).some(comment => comment.authorKey === 'user');
    return post.authorKey === 'user';
  }),
);
function legacyTitle(post: MomentPost): string {
  if (!post.id.startsWith(`zone:${post.authorKey}:`)) return '';
  const id = post.id.slice(`zone:${post.authorKey}:`.length);
  return (
    parseZonePage(phone.state.snapshots[post.authorKey]?.zone || '').posts.find(item => item.id === id)?.title || ''
  );
}
function likesFor(id: string) {
  return phone.momentsFeed.likes.filter(like => like.postId === id && like.availableAt <= now.value);
}
function commentsFor(id: string) {
  return phone.momentsFeed.comments.filter(comment => comment.postId === id && comment.availableAt <= now.value);
}
function nameFor(key: string, fallback: string) {
  return key === 'user'
    ? props.userName
    : phone.state.identities[key]
      ? displayIdentityName(phone.state.identities[key])
      : phone.state.moments.npcs[key]?.username || fallback;
}
function accountFor(key: string) {
  return (
    key === 'user'
      ? phone.state.moments.profile.account
      : parseZonePage(phone.state.snapshots[key]?.zone || '').profile.handle || ''
  ).replace(/^@+/, '');
}
function avatarFor(key: string) {
  if (failedAvatars.value.has(key)) return '';
  return key === 'user'
    ? props.userAvatar
    : phone.state.identities[key]?.avatar ||
        (phone.state.moments.npcs[key] ? npcAvatarUrl(phone.state.moments.npcs[key].avatarSeed) : '');
}
function timeLabel(value: number) {
  if (!value) return '此前';
  const minutes = Math.max(0, Math.floor((now.value - value) / 60000));
  return minutes < 1
    ? '刚刚'
    : minutes < 60
      ? `${minutes}分钟前`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}小时前`
        : new Date(value).toLocaleDateString();
}
const visibilityOptions = [
  { value: 'all', label: '所有人可见' },
  { value: 'self', label: '仅自己可见' },
  { value: 'include', label: '部分联系人可见' },
  { value: 'exclude', label: '不给这些联系人看' },
];
function visibilityLabel(post: MomentPost) {
  return visibilityOptions.find(option => option.value === post.visibility)?.label || '';
}
const profileDraft = reactive(MomentUserProfileSchema.parse({}));
function openProfile() {
  phone.ensureAnonymousProfile();
  Object.assign(profileDraft, klona(phone.state.moments.profile));
  panel.value = 'profile';
  notice.value = '';
}
function saveProfile() {
  try {
    phone.state.moments.profile = {
      ...profileDraft,
      nickname: profileDraft.nickname.trim(),
      account: profileDraft.account.trim().replace(/^@/, ''),
    };
    phone.saveMoments();
    notice.value = '资料已保存';
    panel.value = 'home';
  } catch (error) {
    notice.value = String(error);
  }
}
function toggleActor(key: string) {
  settings.value.postingCharKeys = settings.value.postingCharKeys.includes(key)
    ? settings.value.postingCharKeys.filter(value => value !== key)
    : [...settings.value.postingCharKeys, key];
}
function saveSettings() {
  try {
    if (settings.value.maxInteractions < settings.value.minInteractions) throw new Error('互动上限不能小于下限');
    if (settings.value.maxDelaySeconds < settings.value.minDelaySeconds) throw Error('最长延迟不能小于最短延迟');
    phone.saveMoments();
    notice.value = '互动设置已保存';
  } catch (error) {
    notice.value = String(error);
  }
}
const composing = ref(false),
  composeError = ref(''),
  selection = ref<'' | 'mentions' | 'audience'>(''),
  selectionQuery = ref('');
const tagDraft = ref('');
function addTag(event?: Event) {
  if (event && 'isComposing' in event && event.isComposing) return;
  event?.preventDefault();
  draft.tags = PostTagsSchema.parse([...draft.tags, tagDraft.value]);
  tagDraft.value = '';
}
const draft = reactive<{
  tags: string[];
  content: string;
  images: MomentMedia[];
  location: string;
  mentions: string[];
  visibility: MomentPost['visibility'];
  audience: string[];
}>({ tags: [], content: '', images: [], location: '', mentions: [], visibility: 'all', audience: [] });
const filteredContacts = computed(() =>
  contacts.value.filter(contact =>
    displayIdentityName(contact).toLowerCase().includes(selectionQuery.value.toLowerCase()),
  ),
);
function openComposer() {
  composing.value = true;
  selection.value = '';
  composeError.value = '';
}
function backFromSelection() {
  if (selection.value) selection.value = '';
  else closeComposer();
}
function closeComposer() {
  composing.value = false;
  selection.value = '';
}
function choose(value: 'mentions' | 'audience') {
  selection.value = value;
  selectionQuery.value = '';
}
function togglePerson(key: string) {
  const field = selection.value;
  if (!field) return;
  draft[field] = draft[field].includes(key) ? draft[field].filter(value => value !== key) : [...draft[field], key];
}
function publish() {
  try {
    if (tagDraft.value.trim()) addTag();
    phone.publishMoment(klona(draft));
    Object.assign(draft, {
      tags: [],
      content: '',
      images: [],
      location: '',
      mentions: [],
      visibility: 'all',
      audience: [],
    });
    closeComposer();
    now.value = Date.now();
    if (props.view === 'me') {
      panel.value = props.context === 'space' ? 'home' : 'own';
      profileFilter.value = 'own';
    }
  } catch (error) {
    composeError.value = String(error);
  }
}
const imageTarget = ref<'' | 'post' | 'avatar' | 'cover' | 'draftAvatar'>('');
const imageValue = computed(() =>
  imageTarget.value === 'cover'
    ? phone.state.moments.profile.cover
    : imageTarget.value === 'post'
      ? ''
      : imageTarget.value === 'draftAvatar'
        ? profileDraft.avatar
        : phone.state.moments.profile.avatar,
);
function editImage(value: typeof imageTarget.value) {
  imageTarget.value = value;
}
function applyImage(value: { avatar: string }) {
  if (imageTarget.value === 'post') {
    if (value.avatar && draft.images.length < 9)
      draft.images.push({ kind: 'image', url: value.avatar, description: '' });
  } else if (imageTarget.value === 'draftAvatar') profileDraft.avatar = value.avatar;
  else if (imageTarget.value === 'cover' || imageTarget.value === 'avatar') {
    phone.state.moments.profile[imageTarget.value] = value.avatar;
    phone.saveMoments();
  }
  imageTarget.value = '';
}
const describing = ref(false),
  description = ref(''),
  preview = ref<MomentMedia | null>(null);
function addDescription() {
  if (!description.value.trim() || draft.images.length >= 9) return;
  draft.images.push({ kind: 'description', url: '', description: description.value.trim() });
  description.value = '';
  describing.value = false;
}
const commenting = ref(''),
  commentText = ref('');
const replyingComment = ref<MomentComment | null>(null);
function startReply(postId: string, comment: MomentComment) {
  commenting.value = postId;
  replyingComment.value = comment;
}
async function sendComment(id: string) {
  try {
    await phone.commentMoment(id, commentText.value, replyingComment.value || undefined);
    commentText.value = '';
    replyingComment.value = null;
    commenting.value = '';
    now.value = Date.now();
  } catch (error) {
    notice.value = `评论已保存，但后续回复生成失败：${String(error)}`;
  }
}
const composerElement = ref<HTMLElement | null>(null),
  mediaElement = ref<HTMLElement | null>(null);
function trapFocus(event: KeyboardEvent) {
  const root = event.currentTarget as HTMLElement;
  const elements = [
    ...root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    ),
  ];
  const first = elements[0],
    last = elements.at(-1);
  if (!first) {
    event.preventDefault();
    root.focus();
    return;
  }
  const active = root.ownerDocument.activeElement;
  if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
function manageFocus(open: () => boolean, element: typeof composerElement) {
  let previous: HTMLElement | null = null;
  watch(open, async value => {
    if (value) {
      previous = surface.value?.ownerDocument.activeElement as HTMLElement | null;
      await nextTick();
      (element.value?.querySelector<HTMLElement>('textarea, input, button') || element.value)?.focus();
    } else if (previous?.isConnected) previous.focus();
  });
}
manageFocus(() => composing.value, composerElement);
manageFocus(() => describing.value || !!preview.value, mediaElement);
watch(
  () => [phone.context?.cardKey, phone.context?.chatKey],
  () => {
    deleting.value = '';
  },
);
function back() {
  if (deleting.value) {
    deleting.value = '';
    return true;
  }
  if (viewingNpc.value) {
    viewingNpc.value = '';
    return true;
  }
  if (imageTarget.value) {
    imageTarget.value = '';
    return true;
  }
  if (describing.value || preview.value) {
    describing.value = false;
    preview.value = null;
    return true;
  }
  if (composing.value) {
    backFromSelection();
    return true;
  }
  if (panel.value !== 'home') {
    panel.value = 'home';
    return true;
  }
  return false;
}
const isSubpage = computed(() => !!viewingNpc.value || (props.view === 'me' && panel.value !== 'home'));
const subpageTitle = computed(() =>
  viewingNpc.value
    ? '详细资料'
    : { home: '我的', profile: '编辑资料', settings: '空间互动', own: '我的动态', wallet: '我的钱包' }[panel.value],
);
const isComposing = computed(() => composing.value);
const canPublish = computed(() => !viewingNpc.value && props.view === 'me' && panel.value === 'own');
defineExpose({ openComposer, openProfile, back, isSubpage, subpageTitle, canPublish, isComposing });
</script>

<style scoped>
.moment-person-link {
  appearance: none;
  padding: 0;
  border: 0;
  background: none;
  color: #5e80be;
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.moment-person-link:disabled,
.moment-author-avatar:disabled {
  opacity: 1;
  cursor: default;
}
.moment-author-avatar {
  border: 0;
  padding: 0;
  cursor: pointer;
}
</style>
