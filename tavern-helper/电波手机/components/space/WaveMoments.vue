<template>
  <div ref="viewRoot" class="moments-view" :class="{ 'space-moments': context === 'space' }">
    <WaveDeleteConfirm v-if="deleting" title="删除这条动态？" @cancel="deleting = ''" @confirm="confirmDelete" />
    <WaveNpcProfile
      v-if="viewingPerson"
      :npc-id="viewingPerson.key"
      :fallback-name="viewingPerson.name"
      :fallback-avatar="avatarFor(viewingPerson.key, viewingPerson.name)"
      :user-name="userName"
      :user-avatar="userAvatar"
      @close="viewingPerson = null"
    />
    <template v-if="view === 'feed' && !embedded">
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
    <section
      v-else-if="view === 'me' && panel === 'home' && !openedCommentPost"
      :class="{ 'space-user-card': context === 'space' }"
    >
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
        <WaveAppearanceImport v-model="profileDraft.imageAppearance" :name="profileDraft.nickname || userName" />
        <button class="settings-save-wide" type="button" @click="saveProfile">保存资料</button>
      </section>
    </template>
    <template v-else-if="panel === 'settings'">
      <section class="settings-card system-settings-card moments-form space-settings-card">
        <div class="wave-settings-title">空间配图与互动</div>
        <label
          >配图方式<WaveSelect
            v-model="settings.imageMode"
            :options="[
              { value: 'description', label: '文字图（画面描述）' },
              { value: 'ai', label: 'AI 生图' },
            ]"
        /></label>
        <label
          >新动态配图概率 · {{ settings.imageProbability }}%<WaveSlider
            v-model="settings.imageProbability"
            :min="0"
            :max="100"
        /></label>
        <label
          >每条动态最多配图 {{ settings.maxImages }} 张<WaveSlider v-model="settings.maxImages" :min="0" :max="9"
        /></label>
        <label v-if="settings.maxImages > 1"
          >命中配图后，多图概率 · {{ settings.multiImageProbability }}%<WaveSlider
            v-model="settings.multiImageProbability"
            :min="0"
            :max="100"
        /></label>
        <p>
          每条新动态独立抽取是否配图；命中多图时，在 2 张到上限之间随机选择，否则配 1 张。上限为 1 时只配 1 张，为 0
          时不配图。手动发布的图片不受概率影响。
        </p>
        <template v-if="settings.imageMode === 'ai'">
          <label
            >生图接口<WaveSelect
              v-model="settings.imageProfileId"
              :options="phone.settings.imageServices.profiles.map(p => ({ value: p.id, label: p.name }))"
          /></label>
          <p>新动态的配图会调用所选接口。已有图片不重复生成，可点开图片单独修改和重生成。</p>
        </template>
        <div class="system-toggle-row">
          <span>发布后自动点赞 / 评论</span><WaveToggle v-model="settings.autoUserInteractions" />
        </div>
        <p>调用副 API，使用下方选择的角色与互动数量；遵守动态可见范围。也可在帖子和评论下点击「触发互动」。</p>
      </section>
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
        <div class="system-toggle-row">
          <span>定时自动互动</span>
          <WaveToggle v-model="settings.heartbeatEnabled" aria-label="定时自动互动" />
        </div>
        <p class="moments-heartbeat-hint">
          启用副 API 后按最小间隔检查空间与树洞；关闭手机界面仍运行，网页关闭后暂停；间隔为 0 时定时检查仍至少相隔 1
          分钟。
        </p>
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
    <div
      v-if="context === 'space' && view === 'me' && panel === 'home' && !openedCommentPost"
      class="space-profile-tabs"
    >
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
    <div v-if="showCommentCards" class="my-comment-list">
      <button
        v-for="item in myComments"
        :key="item.comment.id"
        type="button"
        class="my-comment-card"
        :aria-label="`查看原帖：${nameFor(item.post.authorKey, item.post.authorName)}的动态`"
        @click="openCommentPost(item.post.id, item.comment.id)"
      >
        <span class="my-comment-heading"
          ><span
            ><i class="fa-regular fa-comment-dots" aria-hidden="true"></i>我的{{
              item.comment.parentId ? '回复' : '评论'
            }}</span
          ><time>{{ timeLabel(item.comment.createdAt) }}</time></span
        >
        <span v-if="item.comment.replyToAuthorName" class="my-comment-recipient"
          >回复 {{ nameFor(item.comment.replyToAuthorKey, item.comment.replyToAuthorName) }}</span
        >
        <span class="my-comment-text">{{ item.comment.content }}</span>
        <span v-if="item.comment.translation?.content" class="my-comment-translation">{{
          item.comment.translation.content
        }}</span>
        <span class="my-comment-source"
          ><span class="my-comment-source-copy"
            ><strong>{{ nameFor(item.post.authorKey, item.post.authorName) }}</strong
            ><span>{{ item.post.content || (item.post.images.length ? '分享了图片' : '查看原帖') }}</span></span
          ><i class="fa-solid fa-chevron-right" aria-hidden="true"></i
        ></span>
        <span class="my-comment-link"
          >查看原帖<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i
        ></span>
      </button>
      <p v-if="!myComments.length" class="messenger-empty">还没有发表过评论</p>
    </div>
    <div
      v-else-if="
        openedCommentPost ||
        view === 'feed' ||
        panel === 'own' ||
        (context === 'space' && view === 'me' && panel === 'home')
      "
      class="moments-feed"
    >
      <article v-for="post in posts" :key="post.id" class="moment-post">
        <header class="space-post-header">
          <button
            type="button"
            class="moment-author-avatar"
            :aria-label="`查看${nameFor(post.authorKey, post.authorName)}的资料`"
            @click="openPerson(post.authorKey, post.authorName)"
          >
            <img
              v-if="avatarFor(post.authorKey, post.authorName || post.id)"
              :src="avatarFor(post.authorKey, post.authorName || post.id)"
              :style="avatarCropFor(post.authorKey)"
              alt=""
              @error="markAvatarFailed(post.authorKey, post.authorName || post.id)"
            /><span v-else>{{ nameFor(post.authorKey, post.authorName).slice(0, 1) }}</span>
          </button>
          <div class="space-post-author-details">
            <button
              type="button"
              class="moment-author moment-person-link"
              @click="openPerson(post.authorKey, post.authorName)"
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
            <button v-for="(media, index) in post.images" :key="index" type="button" @click="openGallery(post, index)">
              <img
                loading="lazy"
                decoding="async"
                v-if="media.kind === 'image'"
                :src="media.url"
                :alt="media.description || '空间动态图片'"
              /><span v-else
                ><i class="fa-regular fa-image"></i>{{ media.description
                }}<small v-if="postImageStatus(post, index)" role="status">{{
                  postImageStatus(post, index)
                }}</small></span
              >
            </button>
          </div>
          <div v-if="post.location" class="moment-location">
            <i class="fa-solid fa-location-dot"></i>{{ post.location }}
          </div>
          <div v-if="post.mentions.length" class="moment-mentions">
            提醒
            <template v-for="(key, index) in post.mentions" :key="key"
              ><span v-if="index">、</span
              ><button type="button" class="moment-person-link" @click="openPerson(key, '联系人')">
                {{ nameFor(key, '联系人') }}
              </button></template
            >
            看
          </div>
          <div class="moment-meta">
            <small
              >{{ timeLabel(post.createdAt)
              }}<template v-if="post.authorKey === 'user'"> · {{ visibilityLabel(post) }}</template></small
            >
            <div class="moment-action-bar">
              <div class="moment-primary-actions">
                <button
                  type="button"
                  :aria-pressed="likesFor(post.id).some(like => like.authorKey === 'user')"
                  @click="phone.likeMoment(post.id)"
                >
                  <i class="fa-regular fa-heart"></i
                  >{{ post.legacyLikeCount + likesFor(post.id).length || '赞' }}</button
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
              </div>
              <div class="moment-secondary-actions">
                <button
                  type="button"
                  :disabled="!!interacting || phone.moduleGenerating || phone.zoneGenerating"
                  @click="interact(post.id)"
                >
                  {{ interacting === post.id ? '互动生成中…' : '触发互动' }}
                </button>
                <button type="button" class="wave-content-delete" aria-label="删除空间动态" @click="deleting = post.id">
                  <i class="fa-regular fa-trash-can"></i>删除
                </button>
              </div>
            </div>
          </div>
          <div v-if="likesFor(post.id).length || commentsFor(post.id).length" class="moment-interactions">
            <div v-if="likesFor(post.id).length" class="moment-likes">
              <i class="fa-regular fa-heart" aria-hidden="true"></i>
              <template v-for="(like, index) in likesFor(post.id)" :key="like.id"
                ><span v-if="index">、</span
                ><button type="button" class="moment-person-link" @click="openPerson(like.authorKey, like.authorName)">
                  {{ nameFor(like.authorKey, like.authorName) }}
                </button></template
              >
            </div>
            <div
              v-for="comment in commentsFor(post.id)"
              :key="comment.id"
              class="moment-comment-row space-comment"
              :class="{ 'comment-jump-target': comment.id === openedCommentId }"
              :data-comment-id="comment.id"
            >
              <button
                type="button"
                class="space-comment-avatar"
                :aria-label="`查看${nameFor(comment.authorKey, comment.authorName)}的资料`"
                @click="openPerson(comment.authorKey, comment.authorName)"
              >
                <img
                  v-if="avatarFor(comment.authorKey, comment.authorName || comment.id)"
                  :src="avatarFor(comment.authorKey, comment.authorName || comment.id)"
                  :style="avatarCropFor(comment.authorKey)"
                  alt=""
                  @error="markAvatarFailed(comment.authorKey, comment.authorName || comment.id)"
                /><span v-else>{{ nameFor(comment.authorKey, comment.authorName).slice(0, 1) }}</span>
              </button>
              <div class="space-comment-main">
                <header>
                  <button
                    type="button"
                    class="moment-person-link"
                    @click="openPerson(comment.authorKey, comment.authorName)"
                  >
                    {{ nameFor(comment.authorKey, comment.authorName) }}</button
                  ><time>{{ timeLabel(comment.createdAt) }}</time>
                </header>
                <p>
                  <button
                    v-if="comment.replyToAuthorName"
                    type="button"
                    class="space-mention moment-person-link"
                    @click="openPerson(comment.replyToAuthorKey, comment.replyToAuthorName)"
                  >
                    @{{ nameFor(comment.replyToAuthorKey, comment.replyToAuthorName) }}</button
                  >{{ comment.content }}
                </p>
                <WaveModuleTranslation
                  inline
                  :app="post.id.startsWith('zone:') ? 'zone' : 'moments'"
                  :translation="comment.translation"
                />
                <div class="moment-comment-actions">
                  <button type="button" class="moment-reply-action" @click="startReply(post.id, comment)">回复</button>
                  <button
                    type="button"
                    class="moment-reply-action"
                    :disabled="!!interacting || phone.moduleGenerating || phone.zoneGenerating"
                    @click="interact(post.id, comment.id)"
                  >
                    触发互动
                  </button>
                  <button
                    type="button"
                    class="moment-comment-delete"
                    :aria-label="`删除${nameFor(comment.authorKey, comment.authorName)}的评论`"
                    @click="phone.deleteMomentComment(comment.id)"
                  >
                    <i class="fa-regular fa-trash-can" aria-hidden="true"></i>删除
                  </button>
                </div>
              </div>
            </div>
          </div>
          <form v-if="commenting === post.id" class="moment-comment-form" @submit.prevent="sendComment(post.id)">
            <div v-if="replyingComment" class="moment-reply-target">
              <i class="fa-solid fa-reply" aria-hidden="true"></i>
              <span class="moment-reply-label">回复</span>
              <strong
                class="moment-reply-name"
                :title="nameFor(replyingComment.authorKey, replyingComment.authorName)"
                >{{ nameFor(replyingComment.authorKey, replyingComment.authorName) }}</strong
              >
              <WaveCloseButton label="取消回复" @close="replyingComment = null" />
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
                <img
                  loading="lazy"
                  decoding="async"
                  v-if="media.kind === 'image'"
                  :src="media.url"
                  :alt="media.description || '图片'"
                /><span v-else>{{ media.description }}</span></button
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
              描述图片 / AI 生图</button
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
          :aria-label="describing ? '添加画面图片' : '图片预览'"
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
            ><div class="wave-settings-title">画面图片</div>
            <textarea
              v-model="description"
              maxlength="1000"
              rows="5"
              placeholder="描述照片里的画面…"
              aria-label="图片画面描述"
            ></textarea
            ><WaveManualImageOptions
              v-model:enabled="descriptionAi"
              v-model:count="descriptionCount"
              v-model:profile-id="descriptionProfile"
              :max="Math.max(1, 9 - draft.images.length)"
            />
            <p v-if="descriptionError" role="alert">{{ descriptionError }}</p>
            <button
              type="button"
              class="settings-save-wide"
              :disabled="!description.trim() || (descriptionAi && !descriptionProfile)"
              @click="addDescription"
            >
              {{ descriptionAi ? `添加 ${descriptionCount} 张 AI 图片` : '添加图片' }}
            </button></template
          ><template v-else-if="preview"
            ><img v-if="preview.kind === 'image'" :src="preview.url" :alt="preview.description || '图片预览'" />
            <p v-else>{{ preview.description }}</p></template
          >
        </section>
      </div></Teleport
    >
    <WaveImageViewer v-if="gallery" :targets="gallery.targets" :initial-index="gallery.index" @close="gallery = null" />
    <WaveImageUpload
      v-if="imageTarget"
      :key="imageTarget"
      inline
      :purpose="imageTarget === 'avatar' || imageTarget === 'draftAvatar' ? 'avatar' : 'artwork'"
      :allow-ai="imageTarget === 'cover'"
      :ai-seed="
        imageTarget === 'avatar' || imageTarget === 'draftAvatar'
          ? [profileDraft.nickname || userName, profileDraft.imageAppearance, '单人正方形头像，无水印']
              .filter(Boolean)
              .join('，')
          : ''
      "
      :model-value="imageValue"
      :label="imageTarget === 'cover' ? '空间动态封面' : imageTarget === 'post' ? '空间动态图片' : '我的头像'"
      @cancel="imageTarget = ''"
      @confirm="applyImage"
      @reset="applyImage({ avatar: '' })"
    />
  </div>
</template>
<script setup lang="ts">
import WaveCloseButton from '../shared/WaveCloseButton.vue';
import WaveAppearanceImport from '../shared/WaveAppearanceImport.vue';
import WaveManualImageOptions from '../shared/WaveManualImageOptions.vue';
import { manualImageMedia } from '../../services/image/manual';
import { imageTargetKey } from '../../services/image/library';
import WaveImageViewer from '../shared/WaveImageViewer.vue';
import type { ImageTarget } from '../../services/image/library';
import { identityAvatarStyle } from '../../services/core/avatar';
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
import { npcAvatarUrl, spaceAvatarUrl } from '../../services/space/npc-avatar';
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
const gallery = ref<{ targets: ImageTarget[]; index: number } | null>(null);
function openGallery(post: MomentPost, index: number) {
  gallery.value = { targets: post.images.map((_, index) => ({ kind: 'moment', postId: post.id, index })), index };
}
const interacting = ref('');
async function interact(postId: string, commentId?: string) {
  interacting.value = postId;
  try {
    await phone.generateMomentInteractions(postId, commentId);
    notice.value = '';
  } catch (e) {
    notice.value = e instanceof Error ? e.message : '互动失败';
  } finally {
    interacting.value = '';
  }
}
const viewingPerson = ref<{ key: string; name: string } | null>(null);
function openPerson(key: string, name: string): void {
  viewingPerson.value = { key, name };
}
const failedAvatars = ref(new Set<string>());
const panel = ref<'home' | 'profile' | 'settings' | 'own' | 'wallet'>(props.initialPanel),
  notice = ref('');
const clearConfirm = ref(false);
const settings = computed(() => phone.state.moments.settings);
const contacts = computed(() => phone.identities.filter(identity => identity.source !== 'local_group'));
const now = ref(Date.now());
let timer: ReturnType<typeof setTimeout> | undefined;
function refreshTimeline(): void {
  clearTimeout(timer);
  now.value = Date.now();
  // The script iframe may be hidden while its teleported phone is visible in the host.
  const feed = phone.momentsFeed;
  const next = [...feed.posts, ...feed.comments, ...feed.likes].reduce(
    (due, item) => (item.availableAt > now.value ? Math.min(due, item.availableAt) : due),
    now.value + 30000,
  );
  timer = setTimeout(refreshTimeline, Math.max(1, next - now.value));
}
watch(() => phone.momentsFeed, refreshTimeline);
onMounted(() => {
  refreshTimeline();
  document.addEventListener('visibilitychange', refreshTimeline);
});
onUnmounted(() => {
  clearTimeout(timer);
  document.removeEventListener('visibilitychange', refreshTimeline);
});
const profileTabs = [
  { id: 'own', label: '发布' },
  { id: 'liked', label: '喜欢' },
  { id: 'commented', label: '评论' },
] as const;
const viewRoot = ref<HTMLElement | null>(null);
const openedCommentPost = ref(''),
  openedCommentId = ref('');
let commentListScroll = 0;
let commentHighlightTimer: ReturnType<typeof setTimeout> | undefined;
onUnmounted(() => clearTimeout(commentHighlightTimer));
const showCommentCards = computed(
  () =>
    props.context === 'space' &&
    props.view === 'me' &&
    panel.value === 'home' &&
    profileFilter.value === 'commented' &&
    !openedCommentPost.value,
);
const myComments = computed(() => {
  const postsById = new Map(
    phone.momentsFeed.posts.filter(post => post.availableAt <= now.value).map(post => [post.id, post]),
  );
  return phone.momentsFeed.comments
    .filter(
      comment => comment.authorKey === 'user' && comment.availableAt <= now.value && postsById.has(comment.postId),
    )
    .map(comment => ({ comment, post: postsById.get(comment.postId)! }))
    .sort((a, b) => b.comment.createdAt - a.comment.createdAt);
});
async function openCommentPost(postId: string, commentId: string) {
  const scroller = viewRoot.value?.closest('.space-scroll');
  commentListScroll = scroller?.scrollTop || 0;
  clearTimeout(commentHighlightTimer);
  openedCommentPost.value = postId;
  openedCommentId.value = commentId;
  await nextTick();
  const target = Array.from(viewRoot.value?.querySelectorAll<HTMLElement>('[data-comment-id]') || []).find(
    node => node.dataset.commentId === commentId,
  );
  if (target?.scrollIntoView) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  else if (scroller) scroller.scrollTop = 0;
  commentHighlightTimer = setTimeout(() => {
    openedCommentId.value = '';
  }, 3000);
}
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
    if (openedCommentPost.value) return post.id === openedCommentPost.value && post.availableAt <= now.value;
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
      ? parseZonePage(phone.state.snapshots[key]?.zone || '').profile.username ||
        displayIdentityName(phone.state.identities[key])
      : phone.state.moments.npcs[key]?.username || fallback;
}
function accountFor(key: string) {
  return (
    key === 'user'
      ? phone.state.moments.profile.account
      : parseZonePage(phone.state.snapshots[key]?.zone || '').profile.handle || ''
  ).replace(/^@+/, '');
}
function avatarToken(key: string, fallbackSeed: string): string {
  return key || `guest:${fallbackSeed}`;
}
function avatarCropFor(key: string) {
  const identity = phone.state.identities[key];
  return key !== 'user' && identity?.avatar ? identityAvatarStyle(identity) : undefined;
}
function avatarFor(key: string, fallbackSeed = '') {
  const token = avatarToken(key, fallbackSeed);
  if (failedAvatars.value.has(token)) return '';
  const known =
    key === 'user'
      ? props.userAvatar
      : phone.state.identities[key]?.avatar ||
        (phone.state.moments.npcs[key] ? npcAvatarUrl(phone.state.moments.npcs[key].avatarSeed) : '');
  return known || spaceAvatarUrl(`space-${token}`);
}
function markAvatarFailed(key: string, fallbackSeed: string): void {
  failedAvatars.value.add(avatarToken(key, fallbackSeed));
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
    Object.assign(phone.settings.moduleSettings.zone, {
      syncChat: settings.value.syncChat,
      autoTranslate: settings.value.autoTranslate,
      expandTranslation: settings.value.expandTranslation,
      sourceLanguage: settings.value.sourceLanguage,
      targetLanguage: settings.value.targetLanguage,
    });
    phone.saveSettings();
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
const descriptionAi = ref(false),
  descriptionCount = ref(1),
  descriptionProfile = ref(phone.state.moments.settings.imageProfileId),
  descriptionError = ref('');
const describing = ref(false),
  description = ref(''),
  preview = ref<MomentMedia | null>(null);
function addDescription() {
  descriptionError.value = '';
  if (!description.value.trim() || draft.images.length >= 9) return;
  try {
    const media = descriptionAi.value
      ? manualImageMedia({
          description: description.value,
          count: descriptionCount.value,
          profileId: descriptionProfile.value,
        })
      : [{ kind: 'description' as const, url: '', description: description.value.trim() }];
    if (draft.images.length + media.length > 9) throw Error('每条动态最多添加 9 张图片');
    draft.images.push(...media);
    description.value = '';
    describing.value = false;
  } catch (error) {
    descriptionError.value = error instanceof Error ? error.message : String(error);
  }
}
function postImageStatus(post: MomentPost, index: number): string {
  const asset = phone.state.moments.imageEdits[imageTargetKey({ kind: 'moment', postId: post.id, index })];
  if (asset?.status === 'pending') return '正在生成…';
  if (asset?.status === 'failed') return '生图失败，点开重试';
  return post.images[index]?.manualGeneration && !post.images[index].url && !asset?.versions.length ? '等待生成…' : '';
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
    await phone.commentMoment(id, commentText.value, replyingComment.value || undefined, () => {
      commentText.value = '';
      replyingComment.value = null;
      commenting.value = '';
      now.value = Date.now();
    });
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
    viewingPerson.value = null;
  },
);
function back() {
  if (deleting.value) {
    deleting.value = '';
    return true;
  }
  if (viewingPerson.value) {
    viewingPerson.value = null;
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
  if (openedCommentPost.value) {
    clearTimeout(commentHighlightTimer);
    openedCommentPost.value = '';
    openedCommentId.value = '';
    void nextTick(() => {
      const scroller = viewRoot.value?.closest('.space-scroll');
      if (scroller) scroller.scrollTop = commentListScroll;
    });
    return true;
  }
  if (panel.value !== 'home') {
    panel.value = 'home';
    return true;
  }
  return false;
}
const isSubpage = computed(() => !!openedCommentPost.value || (props.view === 'me' && panel.value !== 'home'));
const subpageTitle = computed(() =>
  openedCommentPost.value
    ? '动态详情'
    : { home: '我的', profile: '编辑资料', settings: '空间互动', own: '我的动态', wallet: '我的钱包' }[panel.value],
);
watch(
  () => [phone.context?.cardKey, phone.context?.chatKey, props.view],
  () => {
    clearTimeout(commentHighlightTimer);
    openedCommentPost.value = '';
    openedCommentId.value = '';
  },
);
const isComposing = computed(() => composing.value);
const canPublish = computed(() => !viewingPerson.value && props.view === 'me' && panel.value === 'own');
defineExpose({
  openPost: openCommentPost,
  openComposer,
  openProfile,
  back,
  isSubpage,
  subpageTitle,
  canPublish,
  isComposing,
});
</script>

<style scoped>
.my-comment-list {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}
#wave-phone-script-root .space-moments button.my-comment-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--settings-line, #edf0f4);
  border-radius: 20px;
  background: var(--wave-card, #fff);
  color: var(--settings-text, #41464f);
  text-align: left;
  cursor: pointer;
}
.my-comment-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--settings-muted, #8c919b);
  font-size: 11px;
}
.my-comment-heading > span {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--settings-accent, #6283bd);
}
.my-comment-heading time {
  white-space: nowrap;
}
.my-comment-text,
.my-comment-translation,
.my-comment-source-copy > span {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  line-height: 1.7;
  font-size: 13px;
}
.my-comment-translation {
  -webkit-line-clamp: 2;
  color: var(--settings-muted, #8c919b);
  font-size: 12px;
}
.my-comment-recipient {
  color: var(--settings-accent, #6283bd);
  font-size: 11px;
}
.my-comment-source {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 11px 12px;
  border-radius: 12px;
  background: var(--wave-tint, #f5f7fa);
}
.my-comment-source-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.my-comment-source-copy strong {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.my-comment-source-copy > span {
  -webkit-line-clamp: 2;
  font-size: 11px;
  color: var(--settings-muted, #8c919b);
}
.my-comment-source > i {
  font-size: 10px;
  color: var(--settings-muted, #8c919b);
}
.my-comment-link {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--settings-accent, #6283bd);
}
.my-comment-card:focus-visible {
  outline: 2px solid var(--settings-accent, #6283bd);
  outline-offset: 3px;
}
#wave-phone-script-root .space-moments .comment-jump-target {
  border-radius: 0;
  scroll-margin-block: 20px;
  animation: comment-location-glow 3s ease-out both;
}
@keyframes comment-location-glow {
  0%,
  35% {
    background-color: #6687be0e;
    box-shadow: inset 2px 0 #7896c18c;
  }
  100% {
    background-color: transparent;
    box-shadow: inset 2px 0 transparent;
  }
}
@media (prefers-reduced-motion: reduce) {
  #wave-phone-script-root .space-moments .comment-jump-target {
    animation: none;
    background: #6687be0e;
    box-shadow: inset 2px 0 #7896c18c;
  }
}

.moment-generation-feedback {
  margin: 8px 0;
  padding: 0;
  text-indent: 0;
  font-size: 12px;
  opacity: 0.65;
}
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
/* Metadata never competes with actions for the same narrow row. */
#wave-phone-script-root .space-moments .moment-meta {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  margin-top: 14px;
}
#wave-phone-script-root .space-moments .moment-meta > small {
  flex: none;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.moment-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 14px;
}
.moment-primary-actions,
.moment-secondary-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.moment-secondary-actions {
  margin-left: auto;
}
#wave-phone-script-root .space-moments .moment-meta button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 32px;
  padding: 5px 2px;
  line-height: 1.4;
  white-space: nowrap;
  flex-shrink: 0;
}
#wave-phone-script-root .space-moments .moment-meta button i {
  margin: 0;
}
#wave-phone-script-root .space-moments .moment-reply-target {
  display: flex;
  align-items: center;
  gap: 7px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 6px 8px 6px 12px;
  margin-bottom: 3px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--settings-accent) 7%, transparent);
  color: var(--settings-muted);
  font-size: 11px;
  line-height: 1.5;
  --wave-close-bg: transparent;
  --wave-close-color: var(--settings-muted);
}
.moment-reply-target > i {
  color: var(--settings-accent);
  font-size: 11px;
  flex-shrink: 0;
}
.moment-reply-label {
  flex-shrink: 0;
}
.moment-reply-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: inherit;
  font-weight: 600;
  color: var(--settings-accent);
}
#wave-phone-script-root .space-moments .space-settings-card {
  gap: 12px;
}
#wave-phone-script-root .space-moments .space-settings-card > .wave-settings-title {
  margin: 0;
  padding: 0;
}
#wave-phone-script-root .space-moments .space-settings-card > label {
  margin: 0;
  padding: 10px 0 14px;
  gap: 8px;
}
#wave-phone-script-root .space-moments .space-settings-card > .wave-settings-title + label {
  padding-top: 0;
}
</style>
