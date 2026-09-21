<template>
  <div class="wave-phone-host">
    <div v-if="store.isOpen" class="wave-overlay" @click.self="store.isOpen = false">
      <section
        ref="phoneSurface"
        class="wave-device"
        :style="[deviceStyle, playlistSurfaceStyle, momentsSurfaceStyle]"
        :class="[
          `theme-${store.settings.theme}`,
          `page-${store.currentPage}`,
          {
            'is-subpage': store.currentPage !== 'home',
            'space-composing': store.currentPage === 'zone' && space?.isComposing,
            'music-immersive': store.currentPage === 'music' && music.view === 'player' && !appSettingsOpen,
            'music-is-playing': music.playing,
            'playlist-immersive': playlistImmersive,
            'has-music-dock': showMusicDock,
            'has-extra-modal': Boolean(extraMode && extraMode !== '表情'),
          },
        ]"
        aria-label="电波手机"
        @click.capture="onInteractionSound"
      >
        <div class="wave-statusbar">
          <span v-if="store.settings.appearance.showStatusBar" class="wave-status-time">{{ clock }}</span>
          <WaveGenerationIsland
            v-if="store.manualGeneratingApp"
            :app="store.manualGeneratingApp"
            @stop="store.stopManualGeneration"
          />
          <WaveMusicIsland
            v-else
            @open="
              openApp('music');
              music.view = 'player';
              appSettingsOpen = false;
            "
          />
          <WaveDeviceStatus v-if="store.settings.appearance.showStatusBar" />
        </div>

        <div v-if="!store.isReady" class="wave-loading">
          <i class="fa-solid fa-satellite-dish"></i>
          <strong>正在捕捉讯号</strong>
          <p>{{ store.syncError || '读取当前聊天…' }}</p>
          <button type="button" @click="store.synchronize">重新同步</button>
        </div>

        <template v-else>
          <header
            v-if="
              store.currentPage !== 'home' &&
              !playlistImmersive &&
              !(store.currentPage === 'music' && music.view === 'player' && !appSettingsOpen)
            "
            class="wave-appbar"
          >
            <button type="button" aria-label="返回" @click="goBack"><i class="fa-solid fa-chevron-left"></i></button>
            <div>
              <strong class="wave-page-title">{{ pageTitle }}</strong>
            </div>
            <div class="appbar-tools">
              <button
                v-if="canManualGenerateMoments && !appSettingsOpen"
                type="button"
                :aria-label="momentsGenerating ? '中止空间动态生成' : 'AI 更新空间动态'"
                :disabled="Boolean(store.manualGeneratingApp && !momentsGenerating)"
                @click="toggleMomentsGeneration"
              >
                <i :class="momentsGenerating ? 'fa-solid fa-stop' : 'fa-solid fa-wand-magic-sparkles'"></i>
              </button>
              <button
                v-if="canManualGeneratePage && !appSettingsOpen"
                type="button"
                :aria-label="manualPageGenerating ? `中止${pageTitle}生成` : `AI 更新${pageTitle}`"
                :disabled="Boolean(store.manualGeneratingApp && !manualPageGenerating)"
                @click="toggleManualGeneration"
              >
                <i :class="manualPageGenerating ? 'fa-solid fa-stop' : 'fa-solid fa-wand-magic-sparkles'"></i>
              </button>
              <button
                v-if="store.currentPage === 'messages' && !appSettingsOpen && messenger?.headerIcon"
                data-messenger-plus
                type="button"
                :aria-label="messenger?.headerLabel || '新增聊天或联系人'"
                :aria-haspopup="messengerTab === 'me' ? undefined : 'menu'"
                :aria-expanded="messenger?.menuOpen || false"
                @click="messenger?.toggleMenu()"
              >
                <i :class="messenger?.headerIcon || 'fa-solid fa-plus'"></i>
              </button>
              <button
                v-else-if="
                  !['settings', 'profile', 'avatar', 'presets'].includes(store.currentPage) &&
                  (store.currentPage !== 'messages' || appSettingsOpen)
                "
                type="button"
                :aria-label="appSettingsOpen ? '完成设置' : '应用功能设置'"
                @click="toggleAppSettings"
              >
                <i :class="appSettingsOpen ? 'fa-solid fa-check' : 'fa-solid fa-bars'"></i>
              </button>
            </div>
          </header>

          <main class="wave-screen">
            <details
              v-if="
                !appSettingsOpen &&
                store.currentPage === 'messages' &&
                !store.settings.appearance.hideElectric &&
                store.state.electricByApp[`${store.state.activeCharKey}:${store.currentPage}`]
              "
              class="wave-electric"
            >
              <summary>
                <i class="fa-regular fa-clock"></i
                ><span>{{
                  store.state.electricTitleByApp[`${store.state.activeCharKey}:${store.currentPage}`] || '查看 Ecot'
                }}</span
                ><i class="fa-solid fa-chevron-right"></i>
              </summary>
              <pre>{{ store.state.electricByApp[`${store.state.activeCharKey}:${store.currentPage}`] }}</pre>
            </details>
            <WaveAppSettings
              v-if="appSettingsOpen"
              ref="appSettings"
              :app="store.currentPage"
              :name="pageTitle"
              :artwork="currentArtwork"
              :weather-location="store.settings.weatherLocation"
              :search-engine="store.settings.browserSearchEngine"
              :browser-endpoint="store.settings.browserEndpoint"
              :music-api="store.settings.musicApi"
              :music-source="store.settings.musicSource"
              @service="store.setServicePreference"
              @engine="store.setBrowserEngine"
              @clear-history="store.clearBrowserHistory"
              @location="store.setWeatherLocation"
              @artwork="value => store.setAppArtwork(store.currentPage, value)"
              @settings="openGlobalSettings"
              @clear-app="clearCurrentAppContent"
            />
            <WaveHome
              v-else-if="store.currentPage === 'home'"
              v-model:page="homePage"
              :clock="clock"
              :user-avatar="userAvatar"
              :card-key="store.context?.cardKey || ''"
              :source-avatar="store.context?.avatar || ''"
              :user-name="userName"
              :apps="apps"
              :agenda="homeAgenda"
              :unread="homeUnread"
              :updated-apps="store.unreadApps"
              :music-title="music.current?.title || ''"
              @appearance="openAppearance"
              @presets="store.currentPage = 'presets'"
              @open="openApp"
              @settings="openSettings"
            />

            <WavePresets v-else-if="store.currentPage === 'presets'" />
            <section v-else-if="store.currentPage === 'profile'" class="profile-page">
              <div v-if="store.activeIdentity" class="profile-editor-card">
                <div class="profile-orbit" aria-hidden="true"><i></i><i></i><i></i></div>
                <WaveImageUpload
                  :model-value="store.activeIdentity.avatar"
                  :fallback="store.context?.avatar || ''"
                  :label="`${displayIdentityName(store.activeIdentity)}的头像`"
                  :zoom="store.activeIdentity.avatarZoom"
                  :offset-x="store.activeIdentity.avatarOffsetX"
                  :offset-y="store.activeIdentity.avatarOffsetY"
                  :max-side="store.settings.media.imageMaxSide"
                  :quality="store.settings.media.imageQuality"
                  @confirm="updateAvatar"
                  @reset="resetAvatar"
                />
                <div class="profile-name">{{ displayIdentityName(store.activeIdentity) }}</div>
                <div class="profile-source">{{ profileSourceLabel }}</div>

                <label class="profile-remark-field">
                  <span>我的备注</span>
                  <textarea
                    v-model="profileRemark"
                    rows="3"
                    maxlength="240"
                    placeholder="填写后，手机各处统一显示此备注"
                  ></textarea>
                  <small>{{ profileRemark.length }}/240</small>
                </label>

                <div class="profile-meta-grid">
                  <div>
                    <small>角色标识</small><strong>{{ store.activeIdentity.stableId || '尚未解析' }}</strong>
                  </div>
                  <div>
                    <small>隔离模式</small><strong>{{ store.state.mode === 'multi' ? '多人独立' : '单卡独立' }}</strong>
                  </div>
                </div>
                <p class="profile-note">
                  备注与自定义头像按角色卡和实际 Char 保存；聊天消息仍按角色卡、聊天与 Char 三层隔离。
                </p>
                <button class="primary-action profile-save" type="button" @click="saveProfile">
                  <i class="fa-solid fa-floppy-disk"></i> 保存 Char 信息
                </button>
              </div>
              <div v-else class="empty-state">当前没有可编辑的实际 Char。</div>
            </section>

            <section v-else-if="store.currentPage === 'avatar'" class="avatar-edit-page">
              <WaveImageUpload
                v-if="store.activeIdentity"
                inline
                :model-value="store.activeIdentity.avatar"
                :fallback="store.context?.avatar || ''"
                :label="`${displayIdentityName(store.activeIdentity)}的头像`"
                :zoom="store.activeIdentity.avatarZoom"
                :offset-x="store.activeIdentity.avatarOffsetX"
                :offset-y="store.activeIdentity.avatarOffsetY"
                :max-side="store.settings.media.imageMaxSide"
                :quality="store.settings.media.imageQuality"
                @cancel="goBack"
                @confirm="saveAvatarAndReturn"
                @reset="resetAvatarAndReturn"
              />
              <div v-else class="empty-state">当前没有可编辑的实际 Char。</div>
            </section>

            <WaveMessenger
              v-else-if="store.currentPage === 'messages'"
              ref="messenger"
              :user-name="userName"
              :user-avatar="userAvatar"
              @tab-change="messengerTab = $event"
              @open="openConversation"
              @settings="openGlobalSettings('chat')"
              @appearance="openAppearance"
              @activity="
                key => {
                  store.selectIdentity(key);
                  store.currentPage = 'zone';
                }
              "
              @share-moment="shareMoment"
            />

            <section v-else-if="store.currentPage === 'conversation'" class="chat-page">
              <WaveTogether />
              <div ref="threadElement" class="chat-thread" @click="closeMessageMenu">
                <div
                  v-for="(message, messageIndex) in visibleMessages"
                  :key="message.id"
                  class="message-unit"
                  :class="message.sender"
                >
                  <div v-if="shouldShowTimeDivider(messageIndex)" class="chat-time-divider">
                    <time :datetime="message.createdAt">{{ formatMessageDividerTime(message.createdAt) }}</time>
                  </div>
                  <div v-if="activeMessage?.id === message.id" class="message-actions-popover" @click.stop>
                    <template v-if="messageMenuView === 'actions'">
                      <WaveReactionPicker
                        v-if="canReactToMessage(activeMessage)"
                        :selected="activeMessage.reactions || []"
                        :recent="store.settings.recentReactionEmoji"
                        @select="reactToActiveMessage"
                      />
                      <div class="message-action-grid primary-row">
                        <button type="button" :disabled="!canEditActiveMessage" @click="beginEditMessage">
                          <i class="fa-solid fa-pen"></i><span>编辑</span>
                        </button>
                        <button type="button" @click="copyActiveMessage">
                          <i class="fa-regular fa-copy"></i><span>复制</span>
                        </button>
                        <button type="button" :disabled="!canMutateActiveMessage" @click="favoriteActiveMessage">
                          <i :class="activeMessage.favorite ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i
                          ><span>{{ activeMessage.favorite ? '取消收藏' : '收藏' }}</span>
                        </button>
                        <button type="button" :disabled="!canMutateActiveMessage" @click="beginMultiSelect">
                          <i class="fa-solid fa-circle-check"></i><span>多选</span>
                        </button>
                        <button type="button" :disabled="!canWithdrawActiveMessage" @click="withdrawActiveMessage">
                          <i class="fa-solid fa-arrow-rotate-left"></i><span>撤回</span>
                        </button>
                      </div>
                      <div class="message-action-grid secondary-row">
                        <button type="button" :disabled="activeMessage.withdrawn" @click="quoteActiveMessage">
                          <i class="fa-solid fa-quote-right"></i><span>引用</span>
                        </button>
                        <button type="button" :disabled="activeMessage.withdrawn" @click="messageMenuView = 'forward'">
                          <i class="fa-solid fa-share"></i><span>转发</span>
                        </button>
                        <button type="button" :disabled="!canMutateActiveMessage" @click="deleteActiveMessage">
                          <i class="fa-solid fa-trash-can"></i><span>删除</span>
                        </button>
                      </div>
                    </template>
                    <template v-else>
                      <div class="message-forward-heading">
                        <button type="button" aria-label="返回消息操作" @click="messageMenuView = 'actions'">
                          <i class="fa-solid fa-chevron-left"></i>
                        </button>
                        <span><strong>转发讯号</strong><small>选择一个独立 Char 线程</small></span>
                      </div>
                      <div class="message-forward-list">
                        <button
                          v-for="identity in store.identities"
                          :key="identity.charKey"
                          type="button"
                          :disabled="identity.charKey === store.activeIdentity?.charKey"
                          @click="forwardActiveMessage(identity.charKey)"
                        >
                          <span>{{ displayIdentityName(identity).slice(0, 1) }}</span
                          ><strong>{{ displayIdentityName(identity) }}</strong
                          ><i class="fa-solid fa-chevron-right"></i>
                        </button>
                      </div>
                    </template>
                    <i class="message-actions-pointer" aria-hidden="true"></i>
                  </div>

                  <div
                    v-if="store.activeIdentity?.source === 'local_group' && message.sender === 'char'"
                    class="group-sender-name"
                  >
                    {{ displayIdentityName(messageIdentity(message)) }}
                  </div>
                  <article
                    :data-message-id="message.id"
                    class="message-row"
                    :class="[
                      message.sender,
                      {
                        selected: selectedMessageIds.has(message.id),
                        'selection-anchor': selectionAnchorId === message.id,
                        'has-favorite': message.favorite,
                        'is-poke': message.payload.interaction === 'poke' && !message.withdrawn,
                      },
                    ]"
                    @contextmenu.prevent="openMessageMenu(message)"
                    @pointerdown="startMessageHold(message, $event)"
                    @pointermove="moveMessageHold"
                    @pointerup="cancelMessageHold"
                    @pointercancel="cancelMessageHold"
                    @pointerleave="cancelMessageHold"
                    @click.stop="handleMessageClick(message)"
                  >
                    <button
                      v-if="multiSelectMode && !message.id.startsWith('legacy-')"
                      class="message-select-control"
                      type="button"
                      :aria-label="selectedMessageIds.has(message.id) ? '取消选择消息' : '选择消息'"
                      @click.stop="toggleMessageSelection(message.id)"
                    >
                      <i v-if="selectedMessageIds.has(message.id)" class="fa-solid fa-check"></i>
                    </button>
                    <span
                      v-if="
                        message.sender !== 'system' && (message.payload.interaction !== 'poke' || message.withdrawn)
                      "
                      class="chat-avatar"
                      role="button"
                      tabindex="0"
                      title="双击头像拍一拍"
                      :aria-label="message.sender === 'user' ? userName : displayIdentityName(messageIdentity(message))"
                      @keydown.enter.stop.prevent="pokeAvatar(message.sender, messageIdentity(message))"
                      @dblclick.stop="pokeAvatar(message.sender, messageIdentity(message))"
                    >
                      <img
                        v-if="message.sender === 'user' ? userAvatar : messageIdentity(message)?.avatar"
                        :src="message.sender === 'user' ? userAvatar : messageIdentity(message)?.avatar"
                        alt=""
                        :style="
                          message.sender === 'char' && store.activeIdentity
                            ? avatarStyle(messageIdentity(message))
                            : undefined
                        "
                      />
                      <span v-else>{{
                        (message.sender === 'user' ? userName : displayIdentityName(messageIdentity(message))).slice(
                          0,
                          1,
                        )
                      }}</span>
                    </span>
                    <WavePokeNotice
                      v-if="message.payload.interaction === 'poke' && !message.withdrawn"
                      :message="message"
                      :char-name="displayIdentityName(store.activeIdentity)"
                    />
                    <div v-else class="message-stack">
                      <WaveMessageContent :message="message" :quoted-text="quotedMessageText(message)" />
                      <div
                        v-if="canReactToMessage(message) && message.reactions?.length"
                        class="message-reactions"
                        aria-label="消息反应"
                        @pointerdown.stop
                        @click.stop
                        @contextmenu.stop.prevent
                      >
                        <button
                          v-for="emoji in message.reactions"
                          :key="emoji"
                          type="button"
                          :aria-label="`取消反应 ${emoji}`"
                          aria-pressed="true"
                          @click="store.toggleReaction(message.id, emoji)"
                        >
                          <span>{{ emoji }}</span
                          ><small>1</small>
                        </button>
                        <button
                          type="button"
                          class="message-reaction-add"
                          aria-label="添加消息反应"
                          @click="openMessageMenu(message)"
                        >
                          <i class="fa-regular fa-face-smile"></i><span>+</span>
                        </button>
                      </div>
                      <div
                        v-if="!message.withdrawn && message.sender === 'user' && message.characterReactions?.length"
                        class="message-reactions"
                        aria-label="对方的消息反应"
                        @pointerdown.stop
                        @click.stop
                      >
                        <span
                          v-for="reaction in message.characterReactions"
                          :key="reaction.actorKey"
                          class="message-reaction-received"
                          :title="`${store.state.identities[reaction.actorKey]?.name || '对方'}贴了 ${reaction.emoji}`"
                          ><span>{{ reaction.emoji }}</span
                          ><small>1</small></span
                        >
                      </div>
                      <div
                        v-if="message.editedAt || message.favorite || message.status === 'failed' || multiSelectMode"
                        class="message-state"
                      >
                        <span v-if="message.editedAt">已编辑</span>
                        <i v-if="message.favorite" class="fa-solid fa-star" aria-label="已收藏"></i>
                        <em v-if="message.status === 'failed'" :title="message.error">发送失败</em>
                        <button
                          v-if="
                            multiSelectMode && !message.id.startsWith('legacy-') && message.id !== selectionAnchorId
                          "
                          class="select-to-here"
                          type="button"
                          @click.stop="selectRangeTo(message.id)"
                        >
                          选到这里
                        </button>
                        <span
                          v-else-if="multiSelectMode && message.id === selectionAnchorId"
                          class="selection-anchor-label"
                        >
                          起点
                        </span>
                      </div>
                    </div>
                  </article>
                </div>
                <div v-if="showTypingBubble" class="message-row char typing-row" aria-live="polite">
                  <span class="chat-avatar typing-avatar" aria-hidden="true">
                    <img
                      v-if="store.activeIdentity?.avatar"
                      :src="store.activeIdentity.avatar"
                      alt=""
                      :style="avatarStyle(store.activeIdentity)"
                    />
                    <span v-else>{{ displayIdentityName(store.activeIdentity).slice(0, 1) }}</span>
                  </span>
                  <span class="typing-bubble wave-message-text" aria-label="对方正在输入"> <i></i><i></i><i></i> </span>
                </div>
                <div v-if="!visibleMessages.length" class="empty-state">发送第一条只属于这个聊天的手机消息。</div>
              </div>

              <div v-if="multiSelectMode" class="message-multi-toolbar">
                <span
                  ><strong>已选择 {{ selectedMessageIds.size }} 条</strong
                  ><small>点消息旁“选到这里”可连续多选</small></span
                >
                <button type="button" @click="scrollToSelectionAnchor">
                  <i class="fa-solid fa-arrow-up"></i> 起点
                </button>
                <button type="button" @click="scrollToThreadEnd"><i class="fa-solid fa-arrow-down"></i> 末尾</button>
                <button type="button" :disabled="!selectedMessageIds.size" @click="favoriteSelectedMessages">
                  <i class="fa-solid fa-star"></i> 收藏
                </button>
                <button
                  class="danger"
                  type="button"
                  :disabled="!selectedMessageIds.size"
                  @click="deleteSelectedMessages"
                >
                  <i class="fa-solid fa-trash-can"></i> 删除
                </button>
                <button type="button" @click="leaveMultiSelect">完成</button>
              </div>

              <div v-if="editingMessageId || quotedMessage" class="composer-context">
                <i :class="editingMessageId ? 'fa-solid fa-pen' : 'fa-solid fa-quote-left'"></i>
                <span
                  ><strong>{{ editingMessageId ? '编辑消息' : '引用消息' }}</strong
                  ><small>{{ editingMessageId ? '保存后不会重新触发生成' : quotedMessage?.content }}</small></span
                >
                <button type="button" aria-label="取消" @click="clearComposerContext">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>

              <WaveDraftTranslation
                v-if="!multiSelectMode"
                ref="draftTranslation"
                :disabled="Boolean(editingMessageId) || composerComposing"
              />
              <section v-if="suggestedStickers.length" class="sticker-suggestions" aria-label="表情包联想">
                <header>
                  <span>表情包联想 · 点击发送</span
                  ><button type="button" aria-label="关闭表情包联想" @click="dismissStickerSuggestions">×</button>
                </header>
                <div class="sticker-suggestions-list">
                  <button
                    v-for="sticker in suggestedStickers"
                    :key="sticker.id"
                    type="button"
                    :title="sticker.name"
                    :aria-label="`发送表情包：${sticker.name}`"
                    @click="sendSticker(sticker)"
                  >
                    <img :src="sticker.url" :alt="sticker.name" loading="lazy" />
                  </button>
                </div>
              </section>
              <form v-if="!multiSelectMode" class="composer" @submit.prevent="handlePrimarySend">
                <button type="button" aria-label="扩展功能" @click="toggleExtras">
                  <i class="fa-solid fa-plus"></i>
                </button>
                <textarea
                  ref="composerInput"
                  :value="store.activeThread?.draft || ''"
                  rows="1"
                  :placeholder="editingMessageId ? '修改这条讯号…' : '输入一条讯号…'"
                  @compositionstart="composerComposing = true"
                  @compositionend="composerComposing = false"
                  @input="onDraft"
                  @keydown.enter.exact="onComposerEnter"
                  @beforeinput="onComposerBeforeInput"
                ></textarea>
                <button
                  class="mobile-return"
                  type="button"
                  aria-label="回车：短按发送，长按换行"
                  @pointerdown.prevent="startReturnPress"
                  @pointerup.prevent="endReturnPress"
                  @pointercancel="cancelReturnPress"
                  @contextmenu.prevent
                >
                  ↵
                </button>
                <button
                  class="send-button"
                  :class="{ stopping: primaryReplyGenerating }"
                  type="submit"
                  :aria-label="primaryReplyGenerating ? '中止生成' : '发送并激活回复'"
                >
                  <i :class="primaryReplyGenerating ? 'fa-solid fa-stop' : 'fa-solid fa-paper-plane'"></i>
                </button>
              </form>
              <div v-if="extrasOpen && !multiSelectMode" class="extras-panel">
                <button v-for="extra in extras" :key="extra.name" type="button" @click="useExtra(extra.name)">
                  <span><i :class="extra.icon"></i></span>{{ extra.name }}
                </button>
              </div>
              <WaveStickerPicker
                v-if="extraMode === '表情' && !multiSelectMode"
                :library="store.settings.stickers"
                :active-char-key="store.activeIdentity?.charKey || ''"
                @update:library="updateStickerLibrary"
                @send-emoji="sendEmoji"
                @send-sticker="sendSticker"
                @notify="message => notifySuccess(message, '表情包')"
                @close="closeExtra"
              />

              <div v-if="extraMode && extraMode !== '表情'" class="extra-modal-backdrop" @click.self="closeExtra">
                <form class="extra-modal" @submit.prevent="submitExtra">
                  <header>
                    <div>
                      <small>SEND A SIGNAL</small><strong>{{ extraMode }}消息</strong>
                    </div>
                    <button type="button" aria-label="关闭" @click="closeExtra">
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  </header>

                  <template v-if="extraMode !== '表情'">
                    <label v-if="extraMode === '媒体'">
                      <span>媒体类型</span>
                      <WaveSelect v-model="extraDraft.kind" aria-label="媒体类型" :options="mediaKindOptions" />
                    </label>
                    <label v-if="extraMode === '媒体' || extraMode === '链接'"
                      ><span>{{ extraMode === '媒体' ? '资源 URL（可留空）' : '链接 URL' }}</span
                      ><input v-model.trim="extraDraft.url" type="url" placeholder="https://…"
                    /></label>
                    <input
                      ref="photoFileInput"
                      class="wave-visually-hidden"
                      type="file"
                      accept="image/*"
                      multiple
                      @change="selectPhotos"
                    />
                    <div
                      v-if="extraMode === '媒体' && extraDraft.kind === 'image' && selectedPhotos.length"
                      class="photo-selection"
                    >
                      <div v-for="(photo, index) in selectedPhotos" :key="photo.url">
                        <img :src="photo.url" alt="待发送照片" /><input
                          v-model="photo.description"
                          aria-label="照片描述"
                        /><button type="button" @click="selectedPhotos.splice(index, 1)">移除</button>
                      </div>
                    </div>
                    <label v-if="extraMode === '转账' || extraMode === '红包'"
                      ><span>金额</span
                      ><input v-model.trim="extraDraft.amount" type="number" min="0.01" step="0.01" placeholder="0.00"
                    /></label>
                    <label v-if="extraMode === '转账' || extraMode === '红包'">
                      <span>币种</span>
                      <WaveSelect v-model="extraDraft.currency" aria-label="币种" :options="currencyOptions" />
                    </label>
                    <label v-if="extraMode === '转账'">
                      <span>收款状态</span>
                      <WaveSelect v-model="extraDraft.state" aria-label="收款状态" :options="transferStateOptions" />
                    </label>
                    <label v-if="extraMode === '红包'">
                      <span>红包类型</span>
                      <WaveSelect v-model="extraDraft.kind" aria-label="红包类型" :options="redPacketKindOptions" />
                    </label>
                    <label v-if="extraMode === '红包' && extraDraft.kind === 'group'"
                      ><span>红包个数</span
                      ><input v-model.trim="extraDraft.count" type="number" min="1" step="1" placeholder="1"
                    /></label>
                    <label
                      ><span>{{ extraContentLabel }}</span
                      ><textarea v-model.trim="extraDraft.content" rows="3" :placeholder="extraPlaceholder"></textarea>
                    </label>
                    <label v-if="extraMode === '位置'"
                      ><span>距离（km，可留空随机）</span
                      ><input
                        v-model.trim="extraDraft.distance"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="留空随机，或输入自定义距离"
                    /></label>
                    <p class="extra-hint">{{ extraHint }}</p>
                    <div class="media-send-actions">
                      <button
                        v-if="extraMode === '媒体' && extraDraft.kind === 'image'"
                        class="media-choose-photos"
                        type="button"
                        @click="photoFileInput?.click()"
                      >
                        <i class="fa-regular fa-images"></i>选择照片<small>{{
                          selectedPhotos.length ? `已选 ${selectedPhotos.length} / 9` : '最多 9 张'
                        }}</small></button
                      ><button class="primary-action" type="submit">
                        <i class="fa-solid fa-paper-plane"></i>发送讯号
                      </button>
                    </div>
                  </template>
                </form>
              </div>
            </section>

            <section v-else-if="store.currentPage === 'settings'" class="settings-page wave-settings-surface">
              <template v-if="settingsSection === 'root'">
                <div class="settings-hub-grid">
                  <button
                    v-for="section in settingsSections.filter(item => item.id !== 'appearance')"
                    :key="section.id"
                    type="button"
                    @click="settingsSection = section.id"
                  >
                    <i :class="section.icon"></i>
                    <span
                      ><strong>{{ section.name }}</strong
                      ><small>{{ section.caption }}</small></span
                    >
                    <i class="fa-solid fa-chevron-right"></i>
                  </button>
                </div>
                <p class="settings-storage-mark">电波手机 · {{ WAVE_PHONE_RELEASE_VERSION }} © 2026</p>
              </template>

              <div v-else class="settings-detail">
                <WaveSystemSettings
                  v-if="settingsSection === 'basic' || settingsSection === 'worldbooks' || settingsSection === 'debug'"
                  :key="settingsSection"
                  :section="settingsSection"
                />
                <WaveApiSettings v-else-if="settingsSection === 'api'" />
                <WaveBackupSettings v-else-if="settingsSection === 'backup'" />
                <WaveCopyrightCredits v-else-if="settingsSection === 'credits'" />

                <div v-else-if="settingsSection === 'chat'" class="settings-detail">
                  <WaveGenerationSettings />
                  <div class="settings-card">
                    <div class="wave-settings-title">发送与回复</div>
                    <label>
                      <strong>发送方式</strong>
                      <WaveSelect
                        :model-value="store.settings.sendMode"
                        aria-label="发送方式"
                        :options="sendModeOptions"
                        @update:model-value="updateSendMode"
                      />
                    </label>
                    <label
                      ><strong>私聊与正文的关系</strong
                      ><WaveSelect
                        v-model="store.settings.generation.narrativeMode"
                        aria-label="私聊与正文的关系"
                        :options="[
                          { value: 'auto', label: '动态判断', description: '根据话题关联判断是否承接正文' },
                          { value: 'linked', label: '正文联动', description: '参考正文场景与已确认事件' },
                          { value: 'independent', label: '独立聊天', description: '独立话题，不续写或推动正文情节' },
                        ]"
                    /></label>
                    <div
                      v-for="field in ['minReplies', 'maxReplies'] as const"
                      :key="field"
                      class="settings-slider-row"
                    >
                      <span
                        ><strong>{{ field === 'minReplies' ? '每轮最少回复条数' : '每轮最多回复条数' }}</strong
                        ><b>{{ store.settings.chat[field] }} 条</b></span
                      >
                      <WaveSlider
                        v-model="store.settings.chat[field]"
                        :min="1"
                        :max="15"
                        :step="1"
                        :aria-label="field === 'minReplies' ? '每轮最少回复条数' : '每轮最多回复条数'"
                        @update:model-value="
                          value => {
                            if (field === 'minReplies')
                              store.settings.chat.maxReplies = Math.max(value, store.settings.chat.maxReplies);
                            else store.settings.chat.minReplies = Math.min(value, store.settings.chat.minReplies);
                          }
                        "
                      />
                    </div>
                    <div class="toggle-row">
                      <span
                        ><strong>为酒馆提供手机聊天参考</strong
                        ><small>区分正文联动和独立聊天，不把闲聊意向当成已完成的行动</small></span
                      ><WaveToggle
                        v-model="store.settings.generation.shareChatContext"
                        aria-label="为酒馆提供手机聊天参考"
                      />
                    </div>
                    <p class="api-note">
                      回车发送消息，点击纸飞机才激活回复；可连续发送多条后一起回复。电脑 Shift+Enter 换行，手机输入栏 ↵
                      长按换行。
                    </p>
                  </div>
                  <div class="settings-card">
                    <WaveTranslationServices />
                  </div>
                  <button class="settings-save-wide" type="button" @click="saveSettings">
                    <i class="fa-solid fa-floppy-disk"></i> 保存聊天与行为
                  </button>
                </div>

                <div v-else-if="settingsSection === 'media'" class="settings-card">
                  <div class="wave-settings-title">图片处理</div>
                  <div class="settings-slider-row">
                    <span
                      ><strong>图片最大边</strong><small>上传头像时自动压缩</small
                      ><b>{{ store.settings.media.imageMaxSide }}px</b></span
                    >
                    <WaveSlider
                      v-model="store.settings.media.imageMaxSide"
                      :min="480"
                      :max="1600"
                      :step="80"
                      aria-label="图片最大边"
                    />
                  </div>
                  <div class="settings-slider-row">
                    <span
                      ><strong>图片质量</strong><small>越高越清晰，也会占用更多存储</small
                      ><b>{{ Math.round(store.settings.media.imageQuality * 100) }}%</b></span
                    >
                    <WaveSlider
                      v-model="store.settings.media.imageQuality"
                      :min="0.55"
                      :max="0.95"
                      :step="0.05"
                      aria-label="图片质量"
                    />
                  </div>
                  <WaveVoiceServices />
                  <button class="settings-save-wide" type="button" @click="saveSettings">
                    <i class="fa-solid fa-floppy-disk"></i> 保存语音与媒体
                  </button>
                </div>

                <div v-else-if="settingsSection === 'appearance'" class="appearance-settings-page">
                  <WaveHomeAppearance :apps="apps" />
                  <section class="settings-card appearance-settings-card appearance-group">
                    <div class="wave-settings-title">字体与显示</div>
                    <div class="appearance-preview">
                      <small>FONT PREVIEW</small>
                      <strong>电波抵达思念的另一端</strong>
                      <span>字体、字重和字号会实时应用到整台电波手机。</span>
                    </div>
                    <label>
                      <span>界面字体</span>
                      <WaveSelect
                        v-model="store.settings.appearance.fontFamily"
                        aria-label="界面字体"
                        :options="fontFamilyOptions"
                      />
                    </label>
                    <div class="settings-slider-row">
                      <span
                        ><strong>UI 整体字体大小</strong><small>同时调整正文、标题与控件文字</small
                        ><b>{{ Math.round(store.settings.appearance.fontScale * 100) }}%</b></span
                      >
                      <WaveSlider
                        v-model="store.settings.appearance.fontScale"
                        :min="0.85"
                        :max="1.2"
                        :step="0.05"
                        aria-label="UI 整体字体大小"
                      />
                    </div>
                    <div class="settings-slider-row">
                      <span
                        ><strong>思源宋体字重</strong><small>应用于页面标题和展示文字</small
                        ><b>{{ store.settings.appearance.serifWeight }}</b></span
                      >
                      <WaveSlider
                        v-model="store.settings.appearance.serifWeight"
                        :min="400"
                        :max="900"
                        :step="100"
                        aria-label="思源宋体字重"
                      />
                    </div>
                  </section>
                  <button class="settings-save-wide" type="button" @click="saveSettings">
                    <i class="fa-solid fa-floppy-disk"></i> 保存外观设置
                  </button>
                </div>

                <div v-else class="settings-card">
                  <div class="toggle-row">
                    <span><strong>界面通知</strong><small>保存、发送与连接状态使用轻提示</small></span>
                    <WaveToggle v-model="store.settings.notifications.toastEnabled" aria-label="界面通知" />
                  </div>

                  <WaveNotificationSound />
                  <button class="settings-save-wide" type="button" @click="saveSettings">
                    <i class="fa-solid fa-floppy-disk"></i> 保存通知与音效
                  </button>
                </div>
              </div>
            </section>

            <WaveSpace
              v-else-if="store.currentPage === 'zone'"
              :key="`${store.context?.chatKey}-${store.activeIdentity?.charKey}`"
              ref="space"
              :raw="store.activeSnapshot.zone"
              :artwork="currentArtwork"
              :name="displayIdentityName(store.activeIdentity)"
              :avatar="store.activeIdentity?.avatar || ''"
              :avatar-style="avatarStyle(store.activeIdentity)"
              :user-name="userName"
              :user-avatar="userAvatar"
              :busy="store.zoneGenerating"
              :error="store.zoneError"
              @cover="openZoneCover"
              @refresh="refreshZone"
              @share="shareMoment"
              @message="store.currentPage = 'conversation'"
            />
            <WaveWalletWorkspace
              v-else-if="store.currentPage === 'wallet'"
              mode="app"
              :user-avatar="userAvatar"
              :artwork="currentArtwork"
              @settings="appSettingsOpen = true"
            />
            <WaveCalendarPanel
              v-else-if="store.currentPage === 'calendar'"
              :key="`calendar-${store.activeIdentity?.charKey}`"
              :raw="store.activeSnapshot.calendar"
              :location="store.settings.weatherLocation"
              @settings="appSettingsOpen = true"
              @delete="id => store.deleteSnapshotItem('calendar', 'event', id)"
            />
            <WaveBrowserPanel
              v-else-if="store.currentPage === 'browse'"
              :key="`browse-${store.activeIdentity?.charKey}`"
              :raw="store.activeSnapshot.browse"
              :history="store.state.browser[store.activeIdentity?.charKey || '']?.history || []"
              :bookmarks="store.state.browser[store.activeIdentity?.charKey || '']?.bookmarks || []"
              :engine="store.settings.browserSearchEngine"
              :endpoint="store.settings.browserEndpoint"
              @visit="store.recordBrowserVisit"
              @bookmark="store.toggleBrowserBookmark"
              @remove="store.removeBrowserEntry"
              @delete-note="id => store.deleteSnapshotItem('browse', 'note', id)"
              @share="shareBrowserPage"
              @settings="appSettingsOpen = true"
            />
            <WaveMusicPanel
              v-else-if="store.currentPage === 'music'"
              :raw="store.activeSnapshot.music"
              @settings="toggleAppSettings"
            />
            <WaveApps
              v-else-if="currentApp"
              :key="`${store.activeIdentity?.charKey}-${currentApp.id}`"
              :app-id="currentApp.id"
              :raw="store.activeSnapshot[currentApp.id]"
              :name="displayIdentityName(store.activeIdentity)"
              :avatar="store.activeIdentity?.avatar || ''"
              @delete="(app, kind, id) => store.deleteSnapshotItem(app, kind, id)"
            />
          </main>
          <WaveMusicDock
            v-if="showMusicDock"
            @open="
              music.view = 'player';
              appSettingsOpen = false;
            "
          />
          <WaveMusicQueue />
          <div v-if="music.notice && store.currentPage === 'music'" class="music-action-notice" role="status">
            {{ music.notice }}
          </div>

          <WaveForwardDialog
            v-if="forwardDraft"
            :identities="store.identities"
            :title="forwardDraft.title"
            :preview="forwardDraft.preview"
            @cancel="forwardDraft = null"
            @confirm="confirmSharedForward"
          />

          <button class="wave-homebar" type="button" aria-label="返回主屏或关闭手机" @click="handleHomebar">
            <span></span>
          </button>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import WaveReactionPicker from './components/chat/WaveReactionPicker.vue';
import { canReactToMessage } from './services/chat/message-reactions';
import { parseCalendar } from './services/apps/calendar';
import WaveTogether from './components/chat/WaveTogether.vue';
import WaveSystemSettings from './components/settings/WaveSystemSettings.vue';
import WaveMessenger from './components/chat/WaveMessenger.vue';
import WaveGenerationSettings from './components/settings/WaveGenerationSettings.vue';
import WaveHomeAppearance from './components/settings/WaveHomeAppearance.vue';
import WavePresets from './components/apps/WavePresets.vue';
import WaveHome from './components/shell/WaveHome.vue';
import WaveMusicIsland from './components/music/WaveMusicIsland.vue';
import WaveGenerationIsland from './components/shell/WaveGenerationIsland.vue';
import WaveDeviceStatus from './components/shell/WaveDeviceStatus.vue';
import WavePokeNotice from './components/chat/WavePokeNotice.vue';
import { computed, nextTick, onMounted, onUnmounted, ref, watch, provide } from 'vue';
import WaveImageUpload from './components/shared/WaveImageUpload.vue';
import WaveMessageContent from './components/chat/WaveMessageContent.vue';
import WaveSelect, { type WaveSelectOption } from './components/shared/WaveSelect.vue';
import WaveSlider from './components/shared/WaveSlider.vue';
import WaveStickerPicker from './components/chat/WaveStickerPicker.vue';
import { parseZonePage } from './services/space/zone';
import WaveAppSettings from './components/settings/WaveAppSettings.vue';
import WaveBrowserPanel from './components/apps/WaveBrowserPanel.vue';
import type { BrowserEntry } from './services/apps/browser';
import WaveCalendarPanel from './components/apps/WaveCalendarPanel.vue';
import { normalizeArtwork } from './services/core/artworks';
import WaveWalletWorkspace from './components/wallet/WaveWalletWorkspace.vue';
import WaveSpace from './components/space/WaveSpace.vue';
import WaveForwardDialog from './components/chat/WaveForwardDialog.vue';
import type { MomentPost } from './services/space/moments';
import WaveApps from './components/shell/WaveApps.vue';
import WaveMusicPanel from './components/music/WaveMusicPanel.vue';
import WaveMusicDock from './components/music/WaveMusicDock.vue';
import WaveMusicQueue from './components/music/WaveMusicQueue.vue';
import { phoneSurfaceKey } from './services/core/ui-context';
const phoneSurface = ref<HTMLElement | null>(null);
provide(phoneSurfaceKey, phoneSurface);

import WaveVoiceServices from './components/settings/WaveVoiceServices.vue';
import WaveTranslationServices from './components/settings/WaveTranslationServices.vue';
import WaveDraftTranslation from './components/chat/WaveDraftTranslation.vue';
import WaveNotificationSound from './components/settings/WaveNotificationSound.vue';
import { playSoundEvent, stopNotification, type SoundEvent } from './services/core/notification';
import { useMusicStore } from './stores/music';
import WaveToggle from './components/shared/WaveToggle.vue';
import {
  WAVE_PHONE_RELEASE_VERSION,
  type AppId,
  type Identity,
  type PhoneMessage,
  type StickerLibrary,
} from './schemas';
import type { SendMessageInput } from './stores/phone';
import WaveApiSettings from './components/settings/WaveApiSettings.vue';
import WaveBackupSettings from './components/settings/WaveBackupSettings.vue';
import WaveCopyrightCredits from './components/settings/WaveCopyrightCredits.vue';
import { formatPhoneMessage } from './services/chat/message-format';
import { displayIdentityName } from './services/core/identity';
import { parseLegacyMessages } from './services/generation/parser';
import { usePhoneStore } from './stores/phone';

const store = usePhoneStore();
const music = useMusicStore();
watch(
  () => [store.state.activeCharKey, store.activeSnapshot.music, store.settings.musicApi, store.settings.musicSource],
  () => {
    void music.sync(store.activeSnapshot.music, store.state.activeCharKey);
  },
  { immediate: true },
);
const clock = ref('00:00');
const originalUserName = ref('我');
const originalUserAvatar = ref('');
const userName = computed(() => store.state.moments.profile.nickname || originalUserName.value);
const userAvatar = computed(() => store.state.moments.profile.avatar || originalUserAvatar.value);
const personaEvents: EventOnReturn[] = [];
function refreshUserProfile(avatarId?: string): void {
  originalUserName.value = SillyTavern.name1 || '我';
  const selectedAvatar = avatarId || $('#user_avatar_block .avatar-container.selected').attr('data-avatar-id');
  store.selectUserScope(String(selectedAvatar || SillyTavern.name1 || 'default'));
  originalUserAvatar.value = selectedAvatar
    ? SillyTavern.getThumbnailUrl('persona', selectedAvatar)
    : $('#chat .mes[is_user="true"] .avatar img').last().attr('src') || '/img/user-default.png';
}
watch(
  () => store.isOpen,
  open => {
    if (open) refreshUserProfile();
  },
);
const extrasOpen = ref(false);
const extraMode = ref('');
const manualGenerationApps: AppId[] = ['status', 'memo', 'zone', 'wallet', 'calendar', 'browse'];
const canManualGeneratePage = computed(
  () =>
    manualGenerationApps.includes(store.currentPage as AppId) &&
    (store.currentPage !== 'zone' || space.value?.tab === 'char'),
);
const manualPageGenerating = computed(() => store.manualGeneratingApp === store.currentPage);

const profileRemark = ref('');
const settingsSection = ref<SettingsSectionId>('root');
const activeMessageId = ref('');
const messageMenuView = ref<'actions' | 'forward'>('actions');
const editingMessageId = ref('');
const appSettingsOpen = ref(false);
const appSettings = ref<InstanceType<typeof WaveAppSettings> | null>(null);
const showMusicDock = computed(
  () =>
    store.currentPage === 'music' &&
    (music.view === 'home' || appSettingsOpen.value) &&
    music.hasStarted &&
    Boolean(music.current),
);
const playlistImmersive = computed(
  () => store.currentPage === 'music' && music.view === 'home' && music.playlistOpen && !appSettingsOpen.value,
);
const playlistSurfaceStyle = computed(() =>
  playlistImmersive.value
    ? { '--playlist-cover': music.playlistCover ? `url(${JSON.stringify(music.playlistCover)})` : 'none' }
    : {},
);

const currentArtwork = computed(() => {
  const chosen = store.state.appArtwork[store.activeIdentity?.charKey || '']?.[store.currentPage];
  return normalizeArtwork(
    store.currentPage,
    chosen ??
      (store.currentPage === 'zone' ? parseZonePage(store.activeSnapshot.zone).profile.coverUrl : 'card-pencil'),
  );
});
const photoFileInput = ref<HTMLInputElement | null>(null);
const selectedPhotos = ref<Array<{ url: string; description: string }>>([]);
function toggleAppSettings(): void {
  if (!appSettingsOpen.value && store.currentPage === 'zone') openZoneCover();
  else if (appSettingsOpen.value) {
    if (appSettings.value?.save() === false) return;
    appSettingsOpen.value = false;
  } else appSettingsOpen.value = true;
}
function openZoneCover(): void {
  appSettingsOpen.value = true;
}
function openGlobalSettings(section: SettingsSectionId): void {
  appSettingsOpen.value = false;
  store.currentPage = 'settings';
  settingsSection.value = section;
}
function clearCurrentAppContent(app: string): void {
  const target = apps.find(item => item.id === app);
  if (!target || target.id === 'messages') return;
  if (target.id === 'music') music.stop();
  store.clearAppContent(target.id);
  if (store.settings.notifications.toastEnabled) toastr.success(`${target.name}内容已清空`, '内容管理');
}
async function selectPhotos(event: Event): Promise<void> {
  const element = event.target as HTMLInputElement;
  try {
    const files = Array.from(element.files || []).slice(0, 9);
    const photos = await Promise.all(
      files.map(
        file =>
          new Promise<{ url: string; description: string }>((resolve, reject) => {
            if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
              reject(new Error('请选择 8MB 以内的图片'));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve({ url: String(reader.result), description: file.name });
            reader.onerror = () => reject(new Error('图片读取失败'));
            reader.readAsDataURL(file);
          }),
      ),
    );
    selectedPhotos.value = photos;
  } catch (error) {
    toastr.error(String(error));
  } finally {
    element.value = '';
  }
}
watch(
  () => store.currentPage,
  () => {
    appSettingsOpen.value = false;
  },
);
const quotedMessageId = ref('');
const multiSelectMode = ref(false);
const selectedMessageIds = ref(new Set<string>());
const selectionAnchorId = ref('');
const extraDraft = ref({
  kind: 'image',
  url: '',
  amount: '',
  currency: 'CNY',
  count: '1',
  distance: '',
  state: 'pending',
  content: '',
});
const threadElement = ref<HTMLElement | null>(null);
const hiddenMessageIds = ref(new Set<string>());
const revealQueue: string[] = [];
const revealTypingThreadId = ref('');
const replyVisualThreadId = ref('');
const replyMessageVisibleThreadId = ref('');
let revealTimer = 0;
let revealSequenceStarted = false;
const messenger = ref<InstanceType<typeof WaveMessenger> | null>(null);
const messengerTab = ref('messages');
const space = ref<InstanceType<typeof WaveSpace> | null>(null);
type ForwardDraft = {
  title: string;
  preview: string;
  content: string;
  type: 'zone' | 'link';
  payload: Record<string, unknown>;
  zoneSource?: { charKey: string; postId: string };
};
const forwardDraft = ref<ForwardDraft | null>(null);
const canManualGenerateMoments = computed(() => store.currentPage === 'zone' && space.value?.tab === 'world');
const momentsGenerating = computed(() => store.manualGeneratingApp === 'moments');
const momentsSurfaceStyle = computed(() => ({
  '--moments-cover': store.state.moments.profile.cover
    ? `url(${JSON.stringify(store.state.moments.profile.cover)})`
    : 'linear-gradient(135deg,#a9bbd2,#d9b8c9)',
}));
let clockTimer = 0;
let messageHoldTimer = 0;
let messageHoldOrigin: { x: number; y: number } | null = null;

const apps: Array<{ id: AppId; name: string; caption: string; eyebrow: string; icon: string }> = [
  { id: 'status', name: '状态', caption: '心绪档案', eyebrow: 'INNER SIGNAL', icon: 'fa-solid fa-heart-pulse' },
  { id: 'messages', name: '消息', caption: '聊天与联系人', eyebrow: 'MESSAGES', icon: 'fa-solid fa-comment-dots' },
  { id: 'memo', name: '备忘', caption: '随手记录', eyebrow: 'FRAGMENTS', icon: 'fa-solid fa-note-sticky' },
  { id: 'zone', name: '空间', caption: '动态切片', eyebrow: 'SOCIAL WAVE', icon: 'fa-solid fa-book-open' },
  { id: 'wallet', name: '钱包', caption: '生活账本', eyebrow: 'SOFT WALLET', icon: 'fa-solid fa-wallet' },
  { id: 'calendar', name: '日历', caption: '约定时刻', eyebrow: 'TIME CAPSULE', icon: 'fa-solid fa-calendar-days' },
  { id: 'browse', name: '浏览', caption: '搜索痕迹', eyebrow: 'SEARCH TRACE', icon: 'fa-solid fa-compass' },
  { id: 'music', name: '音乐', caption: '心动频率', eyebrow: 'RADIO MEMORY', icon: 'fa-solid fa-headphones' },
];
const extras = [
  { name: '表情', icon: 'fa-regular fa-face-smile' },
  { name: '媒体', icon: 'fa-regular fa-image' },
  { name: '语音', icon: 'fa-solid fa-microphone-lines' },
  { name: '红包', icon: 'fa-solid fa-gift' },
  { name: '转账', icon: 'fa-solid fa-yen-sign' },
  { name: '位置', icon: 'fa-solid fa-location-dot' },
  { name: '链接', icon: 'fa-solid fa-link' },
  { name: '刷新', icon: 'fa-solid fa-rotate' },
];
const mediaKindOptions: WaveSelectOption[] = [
  { value: 'image', label: '照片', description: '静态画面讯号' },
  { value: 'video', label: '视频', description: '动态影像讯号' },
];
const redPacketKindOptions = computed<WaveSelectOption[]>(() =>
  store.activeIdentity?.source === 'local_group'
    ? [{ value: 'group', label: '群聊红包', description: '群成员一起抢红包' }]
    : [{ value: 'private', label: '私聊红包', description: '发送给当前联系人' }],
);
const currencyOptions: WaveSelectOption[] = ['CNY', 'JPY', 'USD', 'EUR', 'GBP', 'KRW'].map(value => ({
  value,
  label: value,
}));
const transferStateOptions: WaveSelectOption[] = [
  { value: 'pending', label: '未收款', description: '等待对方确认接收' },
  { value: 'received', label: '已收款', description: '剧情内已确认收款' },
  { value: 'refunded', label: '已退款', description: '款项已在剧情内退回' },
];
const sendModeOptions: WaveSelectOption[] = [
  { value: 'secondary_api', label: '独立副 API', description: '不占用酒馆主生成' },
  { value: 'main_api', label: '同步酒馆正文', description: '发送后触发主生成' },
  { value: 'append', label: '仅尾附输入框', description: '交给你手动发送' },
];
type SettingsSectionId =
  | 'basic'
  | 'worldbooks'
  | 'debug'
  | 'root'
  | 'api'
  | 'chat'
  | 'media'
  | 'appearance'
  | 'notifications'
  | 'backup'
  | 'credits';
const settingsSections: Array<{
  id: Exclude<SettingsSectionId, 'root'>;
  name: string;
  caption: string;
  description: string;
  eyebrow: string;
  icon: string;
}> = [
  {
    id: 'api',
    name: 'API连接',
    caption: '模型、连接与服务状态',
    description: '配置独立生成接口、模型参数并测试连接。',
    eyebrow: 'API CONNECTION',
    icon: 'fa-solid fa-link',
  },
  {
    id: 'basic',
    name: '基础设置',
    caption: '上下文、缓存与排除名单',
    description: '管理正文读取与运行范围',
    eyebrow: 'BASIC',
    icon: 'fa-solid fa-sliders',
  },
  {
    id: 'chat',
    name: '聊天与行为',
    caption: '消息能力、输入与生成',
    description: '管理发送方式、输入动作和手机提示词。',
    eyebrow: 'CHAT BEHAVIOR',
    icon: 'fa-solid fa-comment-dots',
  },
  {
    id: 'worldbooks',
    name: '世界书管理',
    caption: '绑定来源与条目读取规则',
    description: '管理手机生成使用的世界书内容',
    eyebrow: 'WORLDBOOKS',
    icon: 'fa-solid fa-book',
  },
  {
    id: 'media',
    name: '语音与媒体',
    caption: '语音、图片与红包',
    description: '调整头像压缩品质与剧情语音的默认参数。',
    eyebrow: 'VOICE & MEDIA',
    icon: 'fa-solid fa-volume-high',
  },
  {
    id: 'notifications',
    name: '通知与音效',
    caption: '提醒、铃声与触感反馈',
    description: '选择需要保留的操作提醒与回复提示音。',
    eyebrow: 'NOTIFICATIONS',
    icon: 'fa-solid fa-bell',
  },
  {
    id: 'backup',
    name: '备份与恢复',
    caption: 'ZIP 导入、导出与迁移',
    description: '备份电波手机设置与当前聊天数据',
    eyebrow: 'BACKUP & RESTORE',
    icon: 'fa-solid fa-box-archive',
  },
  {
    id: 'debug',
    name: '调试工具',
    caption: '同步状态、提示词与运行日志',
    description: '查看和排查手机运行状态',
    eyebrow: 'DEBUG',
    icon: 'fa-solid fa-bug',
  },
  {
    id: 'credits',
    name: '版权与致谢',
    caption: '开源声明、使用边界与鸣谢',
    description: '查看电波手机的版权声明、使用边界和鸣谢清单。',
    eyebrow: 'COPYRIGHT & CREDITS',
    icon: 'fa-solid fa-heart',
  },
  {
    id: 'appearance',
    name: '外观',
    caption: '字体、字重与整体字号',
    description: '调整整台手机的字体家族、思源宋体字重和界面文字大小。',
    eyebrow: 'FONT & DISPLAY',
    icon: 'fa-solid fa-font',
  },
];

const fontFamilyOptions: WaveSelectOption[] = [
  { value: 'system', label: '系统界面字体', description: '适合长时间阅读的无衬线字体' },
  { value: 'source_serif', label: '思源宋体', description: '标题与正文统一使用思源宋体' },
  { value: 'source_sans', label: '思源黑体', description: '清晰克制的现代中文字体' },
];

const homeUnread = computed(() => Object.values(store.state.threads).reduce((sum, thread) => sum + thread.unread, 0));
const homeAgenda = computed(() => {
  const event = parseCalendar(store.activeSnapshot.calendar)
    .filter(item => !item.done)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  return event
    ? [event.date, event.time, event.content.replace(/<[^>]*>/g, '')].filter(Boolean).join(' · ').slice(0, 100)
    : '';
});
const currentApp = computed(() => apps.find(app => app.id === store.currentPage));
const activeSettingsSection = computed(() => settingsSections.find(section => section.id === settingsSection.value));
const deviceStyle = computed<Record<string, string>>(() => {
  const fontFamilies = {
    system: "Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    source_serif: "'Source Han Serif SC', 'Noto Serif CJK SC', '思源宋体 CN', 'Songti SC', serif",
    source_sans: "'Source Han Sans SC', 'Noto Sans CJK SC', '思源黑体 CN', 'Microsoft YaHei', sans-serif",
  } as const;
  const fontFamily = fontFamilies[store.settings.appearance.fontFamily];
  const displayFont =
    store.settings.appearance.fontFamily === 'source_sans' ? fontFamilies.source_sans : fontFamilies.source_serif;
  const wallpaper =
    homePage.value === 0 ? store.settings.appearance.coverWallpaper : store.settings.appearance.desktopWallpaper;
  return {
    ...(store.currentPage === 'home' && wallpaper
      ? {
          backgroundImage: `url(${JSON.stringify(wallpaper)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : {}),
    '--wave-ui-font': fontFamily,
    '--wave-display-font': displayFont,
    '--wave-font-scale': String(store.settings.appearance.fontScale),
    '--wave-serif-weight': String(store.settings.appearance.serifWeight),
  };
});
const pageTitle = computed(() =>
  appSettingsOpen.value
    ? store.currentPage === 'conversation'
      ? '聊天设置'
      : `${currentApp.value?.name || '应用'}设置`
    : store.currentPage === 'presets'
      ? '预设'
      : store.currentPage === 'messages'
        ? messenger.value?.headerTitle || '消息'
        : store.currentPage === 'zone'
          ? space.value?.headerTitle || '空间'
          : store.currentPage === 'conversation'
            ? displayIdentityName(store.activeIdentity)
            : currentApp.value?.name ||
              (store.currentPage === 'settings'
                ? activeSettingsSection.value?.name || '设置'
                : store.currentPage === 'profile'
                  ? 'Char 信息'
                  : store.currentPage === 'avatar'
                    ? '修改头像'
                    : '电波手机'),
);
const profileSourceLabel = computed(() => {
  const source = store.activeIdentity?.source;
  if (source === 'auto_single_card') return '已自动读取当前角色卡';
  if (source === 'local_contact') return '手机通讯录联系人';
  if (source === 'local_group') return '手机群聊';
  if (source === 'temporary') return '临时 Char · 等待稳定标识';
  return '从当前聊天内容识别的实际 Char';
});
const extraContentLabel = computed(
  () =>
    ({
      媒体: '图片/视频描述',
      语音: '语音转写',
      红包: '红包祝福',
      转账: '转账备注',
      位置: '位置名称与说明',
      链接: '链接标题',
    })[extraMode.value] || '内容',
);
const extraPlaceholder = computed(
  () =>
    ({
      媒体: '描述画面内容',
      语音: '输入语音转写文本',
      红包: '恭喜发财，大吉大利',
      转账: '最多 10 字的备注',
      位置: '手动输入，不读取真实定位',
      链接: '这个链接是…',
    })[extraMode.value] || '',
);
const extraHint = computed(
  () =>
    ({
      媒体: '没有真实 URL 时仅作为剧情媒体描述。',
      语音: '时长会按文字长度自动换算；点击气泡可展开转写，不伪造音频文件。',
      红包: '发送时默认为待领取，后续状态由角色互动推进；仅用于剧情互动，不涉及真实支付。',
      转账: '只影响剧情内虚构钱包，不涉及真实支付。',
      位置: '只保存手动文本，不请求设备定位。',
      链接: '仅允许 http/https URL。',
    })[extraMode.value] || '',
);
const visibleMessages = computed<PhoneMessage[]>(() => {
  const legacy = parseLegacyMessages(store.activeSnapshot.messages).map(
    (message, index): PhoneMessage => ({
      id: `legacy-${index}`,
      clientId: '',
      sender: message.sender,
      type: 'text',
      content: message.content,
      createdAt: '',
      status: 'sent',
      payload: {},
      quotedMessageId: '',
      favorite: false,
      withdrawn: false,
      editedAt: '',
      error: '',
    }),
  );
  return [...legacy, ...(store.activeThread?.messages || [])].filter(
    message => !hiddenMessageIds.value.has(message.id),
  );
});
const showTypingBubble = computed(
  () =>
    Boolean(store.activeThread?.id && replyMessageVisibleThreadId.value !== store.activeThread.id) &&
    (Boolean(
      store.activeThread?.generating && store.activeThread.id && replyVisualThreadId.value === store.activeThread.id,
    ) ||
      Boolean(store.activeThread?.id && revealTypingThreadId.value === store.activeThread.id && revealQueue.length)),
);
const primaryReplyGenerating = computed(() =>
  Boolean(store.activeThread?.generating && replyVisualThreadId.value === store.activeThread.id),
);
function revealDelay(message: PhoneMessage | undefined, first: boolean): number {
  const contentLength = message?.content.trim().length || 0;
  const readingDelay = Math.min(1800, contentLength * 28);
  return (first ? 550 : 350) + readingDelay + Math.round(Math.random() * (first ? 700 : 950));
}
function scheduleMessageReveal(): void {
  if (revealTimer || !revealQueue.length) return;
  const id = revealQueue[0];
  const message = Object.values(store.state.threads)
    .flatMap(thread => thread.messages)
    .find(item => item.id === id);
  const first = !revealSequenceStarted;
  revealSequenceStarted = true;
  revealTimer = window.setTimeout(
    () => {
      revealTimer = 0;
      revealQueue.shift();
      const hidden = new Set(hiddenMessageIds.value);
      hidden.delete(id);
      hiddenMessageIds.value = hidden;
      if (message?.sender === 'char') sound('message');
      if (store.activeThread?.id) replyMessageVisibleThreadId.value = store.activeThread.id;
      if (revealQueue.length) scheduleMessageReveal();
      else {
        revealTypingThreadId.value = '';
        revealSequenceStarted = false;
      }
      void nextTick(() => {
        if (threadElement.value)
          threadElement.value.scrollTo({ top: threadElement.value.scrollHeight, behavior: 'smooth' });
      });
    },
    revealDelay(message, first),
  );
}
watch(
  () => store.activeThread?.messages.map(message => message.id) || [],
  (_ids, previousIds) => {
    if (!store.activeThread?.generating || replyVisualThreadId.value !== store.activeThread.id || !previousIds) return;
    const known = new Set(previousIds);
    const incoming = store.activeThread.messages.filter(
      message => !known.has(message.id) && message.sender !== 'user' && !message.withdrawn,
    );
    if (!incoming.length) return;
    const hidden = new Set(hiddenMessageIds.value);
    incoming.forEach(message => {
      hidden.add(message.id);
      if (!revealQueue.includes(message.id)) revealQueue.push(message.id);
    });
    hiddenMessageIds.value = hidden;
    revealTypingThreadId.value = store.activeThread.id;
    scheduleMessageReveal();
  },
  { flush: 'sync' },
);
watch(showTypingBubble, visible => {
  if (!visible) return;
  void nextTick(() => {
    if (threadElement.value)
      threadElement.value.scrollTo({ top: threadElement.value.scrollHeight, behavior: 'smooth' });
  });
});
const activeMessage = computed(
  () => visibleMessages.value.find(message => message.id === activeMessageId.value) || null,
);
const quotedMessage = computed(
  () => visibleMessages.value.find(message => message.id === quotedMessageId.value && !message.withdrawn) || null,
);
const canMutateActiveMessage = computed(() =>
  Boolean(activeMessage.value && !activeMessage.value.id.startsWith('legacy-')),
);
const canEditActiveMessage = computed(() =>
  Boolean(canMutateActiveMessage.value && activeMessage.value && !activeMessage.value.withdrawn),
);
const canWithdrawActiveMessage = computed(() =>
  Boolean(canMutateActiveMessage.value && activeMessage.value?.sender === 'user' && !activeMessage.value.withdrawn),
);

const homePage = ref(0);
watch(
  () => store.context?.cardKey,
  key => {
    homePage.value = 0;
    pageHistory.length = 0;
    if (!key || key in store.settings.appearance.anniversaries) return;
    try {
      const oldDate = localStorage.getItem('wave-anniversary:' + key);
      if (oldDate) store.settings.appearance.anniversaries[key] = oldDate;
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
  },
);
const pageHistory: Array<typeof store.currentPage> = [];
let returning = false;
watch(
  () => store.currentPage,
  (page, previous) => {
    if (!returning) {
      if (page === 'home') pageHistory.length = 0;
      else pageHistory.push(previous);
    }
    appSettingsOpen.value = false;
  },
  { flush: 'sync' },
);
function returnToPreviousPage(): void {
  returning = true;
  store.currentPage = pageHistory.pop() || 'home';
  returning = false;
}
function openApp(id: AppId): void {
  if (id === 'music') music.view = 'home';
  store.markAppRead(id);
  store.currentPage = id;
}
function openAppearance(): void {
  settingsSection.value = 'appearance';
  store.currentPage = 'settings';
}
function openSettings(): void {
  settingsSection.value = 'root';
  store.currentPage = 'settings';
}
function openConversation(charKey: string): void {
  store.startConversation(charKey);
  store.markAppRead('messages', charKey);
  store.currentPage = 'conversation';
  void nextTick(() => {
    if (threadElement.value) threadElement.value.scrollTop = threadElement.value.scrollHeight;
  });
}
function goBack(): void {
  if (forwardDraft.value) {
    forwardDraft.value = null;
    return;
  }
  if (store.currentPage === 'messages' && !appSettingsOpen.value && messenger.value?.handleBack()) return;
  if (store.currentPage === 'zone' && !appSettingsOpen.value && space.value?.back()) return;
  if (appSettingsOpen.value) {
    appSettingsOpen.value = false;
    return;
  }
  if (store.currentPage === 'settings' && settingsSection.value === 'appearance') {
    returnToPreviousPage();
    return;
  }
  if (store.currentPage === 'settings' && settingsSection.value !== 'root') {
    settingsSection.value = 'root';
    return;
  }
  if (store.currentPage === 'profile') {
    returnToPreviousPage();
    appSettingsOpen.value = true;
    return;
  }
  if (store.currentPage === 'avatar') {
    returnToPreviousPage();
    return;
  }
  returnToPreviousPage();
}
function handleHomebar(): void {
  if (forwardDraft.value) {
    forwardDraft.value = null;
    return;
  }
  if (store.currentPage === 'home') {
    store.isOpen = false;
    return;
  }
  store.currentPage = 'home';
}
function messageIdentity(message: PhoneMessage): Identity | null {
  return store.state.identities[String(message.payload.actorKey || '')] || store.activeIdentity;
}
function avatarStyle(identity: Identity | null | undefined): Record<string, string> {
  if (!identity) return {};
  const maximumTranslation = Math.max(0, (identity.avatarZoom - 1) * 50);
  const translateX = _.clamp(identity.avatarOffsetX * 0.32, -maximumTranslation, maximumTranslation);
  const translateY = _.clamp(identity.avatarOffsetY * 0.32, -maximumTranslation, maximumTranslation);
  return {
    objectPosition: 'center',
    transform: `translate3d(${translateX}%, ${translateY}%, 0) scale(${identity.avatarZoom})`,
    transformOrigin: 'center',
  };
}
function updateAvatar(value: { avatar: string; zoom: number; offsetX: number; offsetY: number }): void {
  const avatarChanged = value.avatar !== store.activeIdentity?.avatar;
  store.updateActiveIdentityProfile({
    avatar: avatarChanged ? value.avatar : undefined,
    avatarZoom: value.zoom,
    avatarOffsetX: value.offsetX,
    avatarOffsetY: value.offsetY,
  });
  notifySuccess('头像已保存', 'Char 信息');
}
function saveAvatarAndReturn(value: { avatar: string; zoom: number; offsetX: number; offsetY: number }): void {
  updateAvatar(value);
  store.currentPage = 'profile';
}
function resetAvatar(): void {
  store.updateActiveIdentityProfile({ resetAvatar: true });
  notifySuccess('已恢复自动头像', 'Char 信息');
}
function resetAvatarAndReturn(): void {
  resetAvatar();
  store.currentPage = 'profile';
}
function saveProfile(): void {
  store.updateActiveIdentityProfile({ remark: profileRemark.value });
  notifySuccess('Char 信息已保存', '电波手机');
}
function updateSendMode(value: string): void {
  store.settings.sendMode = value as typeof store.settings.sendMode;
}

const composerComposing = ref(false);
const dismissedStickerDraft = ref('');
watch(
  () => [store.activeThread?.id, store.activeThread?.draft],
  () => {
    dismissedStickerDraft.value = '';
  },
);
const suggestedStickers = computed(() => {
  const draft = (store.activeThread?.draft || '').trim().toLocaleLowerCase();
  if (
    !draft ||
    composerComposing.value ||
    multiSelectMode.value ||
    editingMessageId.value ||
    (extraMode.value && extraMode.value !== '表情') ||
    dismissedStickerDraft.value === draft
  )
    return [];
  const keywords = draft.split(/[\s，。！？、,.!?；;：:]+/u).filter(Boolean);
  return store.settings.stickers.stickers
    .filter(
      sticker => sticker.scope !== 'char' || !sticker.charKey || sticker.charKey === store.activeIdentity?.charKey,
    )
    .map(sticker => {
      const name = sticker.name.trim().toLocaleLowerCase();
      const score =
        name === draft ? 3 : name && draft.includes(name) ? 2 : keywords.some(word => name.includes(word)) ? 1 : 0;
      return { sticker, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.sticker.favorite) - Number(a.sticker.favorite))
    .slice(0, 12)
    .map(item => item.sticker);
});
function dismissStickerSuggestions(): void {
  dismissedStickerDraft.value = (store.activeThread?.draft || '').trim().toLocaleLowerCase();
}
const draftTranslation = ref<InstanceType<typeof WaveDraftTranslation> | null>(null);
function onDraft(event: Event): void {
  store.setDraft((event.target as HTMLTextAreaElement).value);
}
const composerInput = ref<HTMLTextAreaElement | null>(null);
let enterHandledAt = 0;
function onComposerEnter(event: KeyboardEvent): void {
  if (event.isComposing || composerComposing.value || event.keyCode === 229) return;
  event.preventDefault();
  if (event.repeat) return;
  enterHandledAt = Date.now();
  void send(false);
}
function onComposerBeforeInput(event: InputEvent): void {
  if (event.isComposing || composerComposing.value) return;
  // Native mobile keyboards may only emit beforeinput, without keydown.
  if (event.inputType === 'insertLineBreak' && matchMedia('(pointer: coarse)').matches) {
    event.preventDefault();
    if (Date.now() - enterHandledAt > 150) {
      enterHandledAt = Date.now();
      void send(false);
    }
  }
}
let returnTimer: ReturnType<typeof setTimeout> | undefined;
let returnHeld = false;
function insertComposerNewline(): void {
  const input = composerInput.value;
  if (!input) return;
  const start = input.selectionStart,
    end = input.selectionEnd;
  const text = store.activeThread?.draft || '';
  store.setDraft(text.slice(0, start) + '\n' + text.slice(end));
  void nextTick(() => {
    input.focus();
    input.setSelectionRange(start + 1, start + 1);
  });
}
function startReturnPress(event: PointerEvent): void {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  returnHeld = false;
  clearTimeout(returnTimer);
  returnTimer = setTimeout(() => {
    returnHeld = true;
    insertComposerNewline();
  }, 500);
}
function endReturnPress(): void {
  clearTimeout(returnTimer);
  if (!returnHeld) void send(false);
}
function cancelReturnPress(): void {
  clearTimeout(returnTimer);
  returnHeld = true;
}
function sound(event: SoundEvent): void {
  void playSoundEvent(store.settings.notifications, event).catch(() => {});
}
let lastInteractionSound = 0;
function onInteractionSound(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (
    !target.closest('button, a, [role="switch"]') ||
    target.closest('.notification-sound-settings, .send-button, .mobile-return') ||
    Date.now() - lastInteractionSound < 70
  )
    return;
  lastInteractionSound = Date.now();
  sound('click');
}
async function pokeAvatar(sender: string, target: Identity | null = store.activeIdentity): Promise<void> {
  if (multiSelectMode.value || store.activeThread?.generating) return;
  sound('poke');
  try {
    await store.sendMessage(
      {
        type: 'text',
        content: `（拍了拍${sender === 'user' ? '自己' : displayIdentityName(target)}的头像）`,
        payload: {
          interaction: 'poke',
          actorName: userName.value,
          targetName: sender === 'user' ? '自己' : displayIdentityName(target),
        },
      },
      false,
    );
  } catch (error) {
    toastr.error(String(error), '拍一拍失败');
  }
}
function toggleExtras(): void {
  closeMessageMenu();
  extraMode.value = '';
  extrasOpen.value = !extrasOpen.value;
}
async function send(activateReply = true): Promise<void> {
  closeMessageMenu();
  extrasOpen.value = false;
  extraMode.value = '';
  try {
    if (editingMessageId.value) {
      const content = store.activeThread?.draft || '';
      if (!content.trim()) {
        toastr.error('编辑后的消息不能为空', '电波手机');
        return;
      }
      store.editMessage(editingMessageId.value, content);
      editingMessageId.value = '';
      return;
    }
    const previousMessageCount = store.activeThread?.messages.length || 0;
    const content = store.activeThread?.draft || '';
    const previewTranslation = draftTranslation.value?.currentResult();
    const translatedPayload =
      previewTranslation && previewTranslation.sourceText === content.trim()
        ? {
            originalText: content.trim(),
            translation: previewTranslation.text,
            translationProvider: previewTranslation.provider,
            outgoingLanguage: previewTranslation.targetLanguage,
          }
        : {};
    const sending = store.sendMessage(
      {
        type: 'text',
        content,
        quotedMessageId: quotedMessage.value?.id || '',
        payload: {
          ...translatedPayload,
          ...(quotedMessage.value
            ? {
                quote: { sender: quotedMessage.value.sender, text: formatPhoneMessage(quotedMessage.value, [], false) },
              }
            : {}),
        },
      },
      activateReply,
    );
    if ((store.activeThread?.messages.length || 0) > previousMessageCount) quotedMessageId.value = '';
    await sending;

    await nextTick();
    if (threadElement.value) threadElement.value.scrollTop = threadElement.value.scrollHeight;
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : String(error), '电波发送失败');
  }
}
async function handlePrimarySend(): Promise<void> {
  if (primaryReplyGenerating.value) {
    await stopGeneration();
    return;
  }
  if (editingMessageId.value) {
    await send(false);
    return;
  }
  const threadId = store.activeThread?.id || '';
  replyVisualThreadId.value = threadId;
  replyMessageVisibleThreadId.value = '';
  try {
    await send(true);
  } finally {
    if (replyVisualThreadId.value === threadId) replyVisualThreadId.value = '';
  }
}
async function stopGeneration(): Promise<void> {
  try {
    await store.stopActiveGeneration();
  } catch (error) {
    toastr.error(String(error), '停止失败');
  }
}
function useExtra(name: string): void {
  if (name === '刷新') {
    void store.synchronize();
    extrasOpen.value = false;
    return;
  }
  selectedPhotos.value = [];
  extraMode.value = name;
  extrasOpen.value = false;
  const groupPacket = name === '红包' && store.activeIdentity?.source === 'local_group';
  const groupMemberCount = Math.max(1, store.activeIdentity?.memberKeys?.length || 1);
  extraDraft.value = {
    kind: name === '红包' ? (groupPacket ? 'group' : 'private') : 'image',
    url: '',
    amount: '',
    currency: 'CNY',
    count: String(groupMemberCount),
    distance: '',
    state: groupPacket ? 'group_available' : 'pending',
    content: '',
  };
}
function closeExtra(): void {
  extraMode.value = '';
}
async function sendTyped(input: SendMessageInput): Promise<void> {
  closeExtra();
  extrasOpen.value = false;
  try {
    const previousMessageCount = store.activeThread?.messages.length || 0;
    const sending = store.sendMessage(
      {
        ...input,
        quotedMessageId: quotedMessage.value?.id || input.quotedMessageId || '',
        payload: {
          ...input.payload,
          ...(quotedMessage.value
            ? {
                quote: { sender: quotedMessage.value.sender, text: formatPhoneMessage(quotedMessage.value, [], false) },
              }
            : {}),
        },
      },
      false,
    );
    if ((store.activeThread?.messages.length || 0) > previousMessageCount) quotedMessageId.value = '';
    await sending;

    await nextTick();
    if (threadElement.value) threadElement.value.scrollTop = threadElement.value.scrollHeight;
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : String(error), '电波发送失败');
  }
}
function sendEmoji(emoji: string): void {
  closeExtra();
  void sendTyped({ type: 'emoji', content: emoji, payload: { emoji } });
}
function sendSticker(sticker: { name: string; url: string }): void {
  closeExtra();
  void sendTyped({
    type: 'emoji',
    content: sticker.name,
    payload: { emojiType: 'sticker', name: sticker.name, url: sticker.url },
  });
}
async function refreshZone(): Promise<void> {
  await runManualGeneration('zone');
}
async function runManualGeneration(app: AppId): Promise<void> {
  try {
    const notice = app === 'zone' ? (await store.refreshZone(), '') : await store.generateModule(app);
    if (notice && store.settings.notifications.toastEnabled) toastr.success(notice, `${pageTitle.value}生成完成`);
  } catch (error) {
    if (!/停止|取消/.test(String(error))) toastr.error(String(error), `${pageTitle.value}生成失败`);
  }
}
async function toggleManualGeneration(): Promise<void> {
  const app = store.currentPage as AppId;
  if (!manualGenerationApps.includes(app)) return;
  if (store.manualGeneratingApp === app) {
    await store.stopManualGeneration();
    return;
  }
  await runManualGeneration(app);
}
async function toggleMomentsGeneration(): Promise<void> {
  if (momentsGenerating.value) {
    await store.stopManualGeneration();
    return;
  }
  try {
    const notice = await store.generateMoments();
    if (notice && store.settings.notifications.toastEnabled) toastr.success(notice, '空间动态生成完成');
  } catch (error) {
    if (!/停止|取消/.test(String(error))) toastr.error(String(error), '空间动态生成失败');
  }
}
function compactPreview(value: string, length = 88): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}
function shareMoment(post: MomentPost, author: string): void {
  forwardDraft.value = {
    title: `${author}的空间动态`,
    preview: compactPreview(post.content),
    content: post.content,
    type: 'zone',
    payload: {
      shareKind: 'moment',
      postId: post.id,
      author,
      postContent: post.content,
      date: new Date(post.createdAt).toLocaleString('zh-CN'),
      location: post.location,
      images: post.images,
    },
  };
}
function confirmSharedForward(targets: string[], note: string): void {
  const draft = forwardDraft.value;
  if (!draft) return;
  const count = store.forwardSharedContent(
    { type: draft.type, content: draft.content, payload: draft.payload },
    targets,
    note,
  );
  if (count && draft.zoneSource) store.recordZoneShare(draft.zoneSource.charKey, draft.zoneSource.postId);
  forwardDraft.value = null;
  if (store.settings.notifications.toastEnabled) toastr.success(`已转发给 ${count} 个会话`, '转发完成');
}
function updateStickerLibrary(library: StickerLibrary): void {
  store.settings.stickers = library;
  store.saveSettings();
}
function shareBrowserPage(entry: BrowserEntry): void {
  forwardDraft.value = {
    title: entry.title || '分享网页',
    preview: entry.url,
    content: entry.title,
    type: 'link',
    payload: { url: entry.url, title: entry.title, source: 'browser' },
  };
}
function calculateVoiceDuration(text: string): number {
  return _.clamp(Math.ceil(Array.from(text.trim()).length / 4), 1, 120);
}
function submitExtra(): void {
  const draft = extraDraft.value;
  let input: SendMessageInput;
  if (extraMode.value === '媒体') {
    if (draft.url && !/^https?:\/\//i.test(draft.url)) {
      toastr.error('媒体 URL 仅允许 http/https');
      return;
    }
    input = {
      type: draft.kind === 'video' ? 'video' : 'image',
      content: draft.content || (draft.kind === 'video' ? '一段视频' : ''),
      payload: {
        url: selectedPhotos.value[0]?.url || draft.url,
        description: draft.content,
        ...(draft.kind === 'image' && selectedPhotos.value.length
          ? { images: selectedPhotos.value.map(photo => ({ ...photo })) }
          : {}),
      },
    };
  } else if (extraMode.value === '语音') {
    if (!draft.content) {
      toastr.error('请填写语音转写');
      return;
    }
    input = {
      type: 'voice',
      content: draft.content,
      payload: { transcript: draft.content, duration: calculateVoiceDuration(draft.content) },
    };
  } else if (extraMode.value === '转账') {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toastr.error('请输入有效的虚构转账金额');
      return;
    }
    input = {
      type: 'transfer',
      content: draft.content || '转账',
      payload: { amount, currency: draft.currency, note: draft.content.slice(0, 10), state: draft.state },
    };
  } else if (extraMode.value === '红包') {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toastr.error('请输入有效的虚构红包金额');
      return;
    }
    const packetType = draft.kind === 'group' ? 'group' : 'private';
    const count = packetType === 'group' ? Math.max(1, Math.round(Number(draft.count) || 1)) : 1;
    input = {
      type: 'red_packet',
      content: draft.content || '恭喜发财，大吉大利',
      payload: {
        amount,
        currency: draft.currency,
        note: draft.content || '恭喜发财，大吉大利',
        packetType,
        state: packetType === 'group' ? 'group_available' : 'pending',
        ...(packetType === 'group' ? { count, claimedCount: 0 } : {}),
      },
    };
  } else if (extraMode.value === '位置') {
    if (!draft.content) {
      toastr.error('请手动填写位置');
      return;
    }
    const distance =
      draft.distance === '' ? Math.round((0.2 + Math.random() * 19.8) * 10) / 10 : Number(draft.distance);
    if (!Number.isFinite(distance) || distance < 0) {
      toastr.error('请输入有效距离');
      return;
    }
    input = {
      type: 'location',
      content: draft.content,
      payload: {
        name: draft.content,
        distanceKm: distance,
        distanceSource: draft.distance === '' ? 'random' : 'custom',
      },
    };
  } else if (extraMode.value === '链接') {
    if (!/^https?:\/\//i.test(draft.url)) {
      toastr.error('链接仅允许 http/https');
      return;
    }
    input = { type: 'link', content: draft.content || draft.url, payload: { url: draft.url, title: draft.content } };
  } else return;
  void sendTyped(input);
}
function messagePlainText(message: PhoneMessage): string {
  if (message.withdrawn) return '这条讯号已撤回';
  return message.content || payloadSummary(message.payload);
}
function quotedMessageText(message: PhoneMessage): string {
  if (!message.quotedMessageId) return '';
  const quoted = visibleMessages.value.find(item => item.id === message.quotedMessageId);
  return quoted
    ? `${quoted.sender === 'user' ? userName.value : displayIdentityName(store.activeIdentity)} · ${formatPhoneMessage(quoted, [], false)}`
    : String((message.payload.quote as { text?: string } | undefined)?.text || '原消息已不可用');
}
function openMessageMenu(message: PhoneMessage): void {
  if (multiSelectMode.value) {
    toggleMessageSelection(message.id);
    return;
  }
  activeMessageId.value = message.id;
  messageMenuView.value = 'actions';
  void nextTick(() =>
    threadElement.value
      ?.querySelector('.message-actions-popover')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
  );
}
function reactToActiveMessage(emoji: string): void {
  if (!activeMessage.value) return;
  store.toggleReaction(activeMessage.value.id, emoji);
  closeMessageMenu();
}
function closeMessageMenu(): void {
  activeMessageId.value = '';
  messageMenuView.value = 'actions';
}
function startMessageHold(message: PhoneMessage, event: PointerEvent): void {
  if (event.pointerType === 'mouse' || multiSelectMode.value) return;
  window.clearTimeout(messageHoldTimer);
  messageHoldOrigin = { x: event.clientX, y: event.clientY };
  messageHoldTimer = window.setTimeout(() => {
    openMessageMenu(message);
    messageHoldOrigin = null;
  }, 460);
}
function moveMessageHold(event: PointerEvent): void {
  if (!messageHoldOrigin) return;
  if (Math.hypot(event.clientX - messageHoldOrigin.x, event.clientY - messageHoldOrigin.y) > 8) cancelMessageHold();
}
function cancelMessageHold(): void {
  window.clearTimeout(messageHoldTimer);
  messageHoldTimer = 0;
  messageHoldOrigin = null;
}
function handleMessageClick(message: PhoneMessage): void {
  if (multiSelectMode.value) toggleMessageSelection(message.id);
}
function beginEditMessage(): void {
  const message = activeMessage.value;
  if (!message || !canEditActiveMessage.value) return;
  editingMessageId.value = message.id;
  quotedMessageId.value = '';
  store.setDraft(message.content);
  closeMessageMenu();
}
async function copyActiveMessage(): Promise<void> {
  const message = activeMessage.value;
  if (!message) return;
  const text =
    message.type === 'text'
      ? messagePlainText(message)
      : formatPhoneMessage(message, store.activeThread?.messages || []);
  try {
    await window.navigator.clipboard.writeText(text);
  } catch {
    const ownerDocument = threadElement.value?.ownerDocument;
    if (!ownerDocument) return;
    const textarea = ownerDocument.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    ownerDocument.body.append(textarea);
    textarea.select();
    ownerDocument.execCommand('copy');
    textarea.remove();
  }
  notifySuccess('消息已复制', '电波手机');
  closeMessageMenu();
}
function favoriteActiveMessage(): void {
  const message = activeMessage.value;
  if (!message || !canMutateActiveMessage.value) return;
  store.toggleFavorite(message.id);
  closeMessageMenu();
}
function withdrawActiveMessage(): void {
  const message = activeMessage.value;
  if (!message || !canWithdrawActiveMessage.value) return;
  store.withdrawMessage(message.id);
  closeMessageMenu();
}
function quoteActiveMessage(): void {
  const message = activeMessage.value;
  if (!message || message.withdrawn) return;
  quotedMessageId.value = message.id;
  editingMessageId.value = '';
  closeMessageMenu();
}
function deleteActiveMessage(): void {
  const message = activeMessage.value;
  if (!message || !canMutateActiveMessage.value) return;
  store.deleteMessage(message.id);
  closeMessageMenu();
}
function forwardActiveMessage(charKey: string): void {
  const message = activeMessage.value;
  if (!message || message.withdrawn) return;
  store.forwardMessage(message.id, charKey);
  notifySuccess('讯号已转发到独立线程', '电波手机');
  closeMessageMenu();
}
function beginMultiSelect(): void {
  const message = activeMessage.value;
  if (!message || !canMutateActiveMessage.value) return;
  multiSelectMode.value = true;
  selectionAnchorId.value = message.id;
  selectedMessageIds.value.add(message.id);
  closeMessageMenu();
}
function toggleMessageSelection(messageId: string): void {
  if (messageId.startsWith('legacy-')) return;
  if (selectedMessageIds.value.has(messageId)) selectedMessageIds.value.delete(messageId);
  else selectedMessageIds.value.add(messageId);
}
function selectRangeTo(messageId: string): void {
  const messages = store.activeThread?.messages || [];
  const anchorIndex = messages.findIndex(message => message.id === selectionAnchorId.value);
  const targetIndex = messages.findIndex(message => message.id === messageId);
  if (anchorIndex < 0 || targetIndex < 0) return;
  const [start, end] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
  selectedMessageIds.value.clear();
  messages.slice(start, end + 1).forEach(message => selectedMessageIds.value.add(message.id));
  scrollToMessage(messageId);
}
function scrollToMessage(messageId: string): void {
  const messageElement = [...(threadElement.value?.querySelectorAll<HTMLElement>('[data-message-id]') || [])].find(
    element => element.dataset.messageId === messageId,
  );
  messageElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function scrollToSelectionAnchor(): void {
  if (selectionAnchorId.value) scrollToMessage(selectionAnchorId.value);
}
function scrollToThreadEnd(): void {
  threadElement.value?.scrollTo({ top: threadElement.value.scrollHeight, behavior: 'smooth' });
}
function favoriteSelectedMessages(): void {
  const messages = store.activeThread?.messages || [];
  messages.forEach(message => {
    if (selectedMessageIds.value.has(message.id) && !message.favorite && !message.withdrawn) {
      store.toggleFavorite(message.id);
    }
  });
  notifySuccess('已收藏所选消息', '电波手机');
  leaveMultiSelect();
}
function deleteSelectedMessages(): void {
  store.deleteMessages([...selectedMessageIds.value]);
  leaveMultiSelect();
}
function leaveMultiSelect(): void {
  multiSelectMode.value = false;
  selectedMessageIds.value.clear();
  selectionAnchorId.value = '';
}
function clearComposerContext(): void {
  if (editingMessageId.value) store.setDraft('');
  editingMessageId.value = '';
  quotedMessageId.value = '';
}
function saveSettings(): void {
  store.saveSettings();
  notifySuccess('设置已保存', '电波手机');
}
function notifySuccess(message: string, title: string): void {
  if (store.settings.notifications.toastEnabled) toastr.success(message, title);
}
watch(
  () => ({
    chat: store.state.chatKey,
    ids: Object.values(store.state.threads).flatMap(thread =>
      thread.messages.filter(message => message.sender === 'char').map(message => message.id),
    ),
  }),
  (next, previous) => {
    if (
      previous &&
      next.chat === previous.chat &&
      next.ids.some(id => !previous.ids.includes(id) && !hiddenMessageIds.value.has(id) && !revealQueue.includes(id))
    )
      sound('message');
  },
);

const MESSAGE_TIME_INTERVAL = 5 * 60 * 1000;
function messageDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function sameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
function shouldShowTimeDivider(index: number): boolean {
  const current = messageDate(visibleMessages.value[index]?.createdAt || '');
  if (!current) return false;
  const previous = messageDate(visibleMessages.value[index - 1]?.createdAt || '');
  return (
    !previous || !sameLocalDate(current, previous) || current.getTime() - previous.getTime() >= MESSAGE_TIME_INTERVAL
  );
}
function formatMessageDividerTime(value: string): string {
  const date = messageDate(value);
  if (!date) return '';
  const now = new Date();
  const clock = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (sameLocalDate(date, now)) return clock;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameLocalDate(date, yesterday)) return `昨天 ${clock}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
}
function payloadSummary(payload: Record<string, unknown>): string {
  return (
    Object.values(payload)
      .map(value => (typeof value === 'string' || typeof value === 'number' ? String(value) : ''))
      .filter(Boolean)
      .join(' · ') || '剧情事件'
  );
}

watch(
  () => [store.activeIdentity?.charKey, store.activeIdentity?.remark] as const,
  () => {
    profileRemark.value = store.activeIdentity?.remark || '';
  },
  { immediate: true },
);

watch(
  () => [store.activeIdentity?.charKey, store.currentPage] as const,
  () => {
    closeMessageMenu();
    leaveMultiSelect();
    editingMessageId.value = '';
    quotedMessageId.value = '';
    extrasOpen.value = false;
    extraMode.value = '';
  },
);

onMounted(async () => {
  const updateClock = () => {
    clock.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  updateClock();
  clockTimer = window.setInterval(updateClock, 30_000);
  await store.initialize();
  refreshUserProfile();
  personaEvents.push(eventOn('persona_changed', (avatarId: string) => refreshUserProfile(avatarId)));
  personaEvents.push(eventOn(tavern_events.SETTINGS_UPDATED, () => refreshUserProfile()));
  personaEvents.push(eventOn(tavern_events.CHAT_CHANGED, () => refreshUserProfile()));
});
onUnmounted(() => {
  cancelReturnPress();
  stopNotification();
  music.stop();
  window.clearInterval(clockTimer);
  window.clearTimeout(messageHoldTimer);
  window.clearTimeout(revealTimer);
  personaEvents.splice(0).forEach(event => event.stop());
  store.dispose();
});
</script>
