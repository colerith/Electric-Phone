import { WalletBookSchema } from './services/wallet-accounts';
import { ModuleSettingsSchema } from './services/module-settings';
import { PromptLibrarySchema } from './services/preset-schema';
import { MomentsStateSchema } from './services/moments';
import { MusicTrackSchema } from './services/music';
import { VoiceServicesSchema, CharacterVoiceSchema } from './services/speech';
import { BrowserStateSchema, SearchEngineSchema } from './services/browser';
import { WeatherLocationSchema } from './services/weather';
import { z } from 'zod';
import { ChatPreferencesSchema } from './services/chat-preferences';
import { ZoneInteractionsSchema } from './services/zone';

export const APP_IDS = ['status', 'messages', 'memo', 'zone', 'wallet', 'calendar', 'browse', 'music'] as const;
export type AppId = (typeof APP_IDS)[number];
export const WAVE_PHONE_IDENTIFIER = 'cn.wave-phone.tavern-helper';
export const WAVE_PHONE_RELEASE_VERSION = '1.1.8';
export const WAVE_PHONE_STORAGE_VERSION = 1;

export const ProviderSchema = z.enum(['openai', 'siliconflow', 'deepseek', 'google_ai_studio', 'vertex_ai']);
export type Provider = z.infer<typeof ProviderSchema>;

export const ApiSettingsSchema = z
  .object({
    enabled: z.boolean().prefault(false),
    provider: ProviderSchema.prefault('openai'),
    apiurl: z.string().prefault(''),
    key: z.string().prefault(''),
    model: z.string().prefault(''),
    proxyPassword: z.string().prefault(''),
    vertexLocation: z.string().prefault('global'),
    vertexProjectId: z.string().prefault(''),
    temperature: z.coerce
      .number()
      .transform(value => _.clamp(value, 0, 2))
      .prefault(0.95),
    frequencyPenalty: z.coerce.number().min(-2).max(2).prefault(0),
    presencePenalty: z.coerce.number().min(-2).max(2).prefault(0),
    topK: z.coerce.number().int().min(0).max(500).prefault(0),
    contextLength: z.coerce.number().int().min(2048).max(2000000).prefault(100000),
    retryCount: z.coerce.number().int().min(0).max(5).prefault(0),
    topP: z.coerce
      .number()
      .transform(value => _.clamp(value, 0, 1))
      .prefault(0.9),
    maxTokens: z.coerce
      .number()
      .transform(value => _.clamp(Math.round(value), 256, 131072))
      .prefault(30000),
    timeoutMs: z.coerce
      .number()
      .transform(value => _.clamp(Math.round(value), 10_000, 180_000))
      .prefault(60_000),
  })
  .prefault({});

export const ChatBehaviorSettingsSchema = z
  .object({
    minReplies: z.number().int().min(1).max(15).prefault(1),
    maxReplies: z.number().int().min(1).max(15).prefault(5),
    enterToSend: z.boolean().prefault(true),
    autoCloseExtras: z.boolean().prefault(true),
  })
  .prefault({});

export const MediaSettingsSchema = z
  .object({
    imageMaxSide: z.coerce
      .number()
      .transform(value => _.clamp(Math.round(value), 480, 1600))
      .prefault(1200),
    imageQuality: z.coerce
      .number()
      .transform(value => _.clamp(value, 0.55, 0.95))
      .prefault(0.82),
  })
  .prefault({});

export const SoundEventSchema = z
  .object({
    enabled: z.boolean().prefault(true),
    soundId: z.string().prefault('default'),
    customSound: z.string().prefault(''),
    customSoundName: z.string().prefault(''),
    volume: z.coerce.number().min(0).max(1).prefault(0.65),
  })
  .prefault({});
export const NotificationSettingsSchema = z
  .object({
    events: z
      .object({ message: SoundEventSchema, send: SoundEventSchema, click: SoundEventSchema, poke: SoundEventSchema })
      .prefault({}),
    toastEnabled: z.boolean().prefault(true),
    soundEnabled: z.boolean().prefault(false),
    soundId: z.string().prefault('2354'),
    customSound: z.string().prefault(''),
    customSoundName: z.string().prefault(''),
    volume: z.coerce.number().min(0).max(1).prefault(0.65),
  })
  .prefault({});

export const AppearanceSettingsSchema = z
  .object({
    hideElectric: z.boolean().prefault(false),
    showStatusBar: z.boolean().prefault(true),
    coverWallpaper: z.string().prefault(''),
    desktopWallpaper: z.string().prefault(''),
    iconNames: z.record(z.string(), z.string()).prefault({}),
    iconImages: z.record(z.string(), z.string()).prefault({}),
    anniversaries: z.record(z.string(), z.string()).prefault({}),
    fontFamily: z.enum(['system', 'source_serif', 'source_sans']).prefault('system'),
    fontScale: z.coerce
      .number()
      .transform(value => _.clamp(value, 0.85, 1.2))
      .prefault(1),
    serifWeight: z.coerce
      .number()
      .transform(value => _.clamp(Math.round(value / 100) * 100, 400, 900))
      .prefault(700),
  })
  .prefault({});

export const StickerScopeSchema = z.enum(['global', 'user', 'char']);
export type StickerScope = z.infer<typeof StickerScopeSchema>;

export const StickerCategorySchema = z.object({
  id: z.string(),
  name: z.string().prefault('未命名分类'),
});
export type StickerCategory = z.infer<typeof StickerCategorySchema>;

export const StickerItemSchema = z.object({
  id: z.string(),
  name: z.string().prefault('未命名表情'),
  url: z.string().prefault(''),
  categoryId: z.string().prefault(''),
  scope: StickerScopeSchema.prefault('global'),
  charKey: z.string().prefault(''),
  favorite: z.boolean().prefault(false),
  createdAt: z.string().prefault(''),
});
export type StickerItem = z.infer<typeof StickerItemSchema>;

export const DEFAULT_STICKER_LIBRARY = { categories: [], stickers: [] };

export const StickerLibrarySchema = z
  .object({
    categories: z.array(StickerCategorySchema),
    stickers: z.array(StickerItemSchema),
  })
  .prefault(DEFAULT_STICKER_LIBRARY)
  .transform(library => {
    const stickers = library.stickers.filter(
      sticker => !(sticker.id.startsWith('bundled-work-dog-') && sticker.createdAt === 'bundled'),
    );
    return {
      stickers,
      categories: library.categories
        .filter(category => category.id !== 'work-dog' || stickers.some(sticker => sticker.categoryId === category.id))
        .map(category =>
          category.id === 'work-dog' && category.name === '下班小狗' ? { ...category, name: '我的表情' } : category,
        ),
    };
  });
export type StickerLibrary = z.infer<typeof StickerLibrarySchema>;

export const ScriptSettingsSchema = z
  .object({
    basic: z
      .object({
        autoOpenOnUpdate: z.boolean().prefault(false),
        historyDepth: z.number().int().nonnegative().nullable().prefault(null),
        cacheEnabled: z.boolean().prefault(true),
        cacheLimitMb: z.coerce
          .number()
          .transform(value => _.clamp(value, 1, 512))
          .prefault(32),
        excludedCards: z.array(z.string()).prefault([]),
        excludedTags: z.array(z.string()).prefault([]),
      })
      .prefault({}),
    worldbooks: z
      .object({
        managed: z.boolean().prefault(false),
        entries: z.record(z.string(), z.enum(['include', 'exclude'])).prefault({}),
        books: z.record(z.string(), z.enum(['include', 'exclude'])).prefault({}),
      })
      .prefault({}),
    generation: z
      .object({
        followEnabled: z.boolean().prefault(false),
        randomMin: z.number().int().min(1).max(4).prefault(1),
        randomMax: z.number().int().min(2).max(4).prefault(2),
        probability: z.number().min(0).max(100).prefault(35),
        modules: z.array(z.enum(APP_IDS)).prefault(['status', 'messages', 'memo', 'calendar']),
        requiredModules: z.array(z.enum(APP_IDS)).prefault([]),
        narrativeMode: z.enum(['auto', 'linked', 'independent']).prefault('auto'),
        shareChatContext: z.boolean().prefault(true),
      })
      .prefault({}),
    debugEnabled: z.boolean().prefault(false),
    browserSearchEngine: SearchEngineSchema.prefault('google'),
    browserEndpoint: z.string().prefault(''),
    musicApi: z.string().prefault('https://api.vkeys.cn/v2/music'),
    musicPlaybackMode: z.enum(['sequence', 'shuffle', 'loop', 'single']).prefault('sequence'),
    musicPersonalized: z.boolean().prefault(false),
    neteaseApi: z.string().prefault('https://netease-cloud-music-wheat.vercel.app'),
    qqMusicApi: z.string().prefault(''),
    musicSource: z.string().prefault('aggregate'),
    musicSearchRevision: z.number().prefault(0),
    weatherLocation: WeatherLocationSchema.nullable().prefault(null),
    version: z.literal(1).prefault(1),
    theme: z.enum(['light', 'dark']).prefault('light'),
    launcherPosition: z.enum(['left', 'right']).prefault('right'),
    openOnLoad: z.boolean().prefault(false),
    sendMode: z.enum(['secondary_api', 'main_api', 'append']).prefault('secondary_api'),
    moduleSettings: ModuleSettingsSchema,
    api: ApiSettingsSchema,
    apiProfiles: z.array(z.object({ id: z.string(), name: z.string(), api: ApiSettingsSchema })).prefault([]),
    presets: PromptLibrarySchema,
    activeApiProfileId: z.string().prefault(''),
    chat: ChatBehaviorSettingsSchema,
    media: MediaSettingsSchema,
    voiceServices: VoiceServicesSchema,
    notifications: NotificationSettingsSchema,
    appearance: AppearanceSettingsSchema,
    stickers: StickerLibrarySchema,
    translation: z
      .object({
        provider: z.enum(['mymemory', 'libretranslate', 'lingva', 'secondary_api']).prefault('mymemory'),
        endpoint: z.string().prefault(''),
        apiKey: z.string().prefault(''),
      })
      .prefault({}),
    customPrompt: z.string().prefault(''),
  })
  .prefault({});

export type ScriptSettings = z.infer<typeof ScriptSettingsSchema>;

export const IdentitySchema = z.object({
  actorType: z.enum(['main', 'npc']).optional(),
  relationshipToUser: z.string().max(160).optional(),
  npcProfile: z.string().max(10000).optional(),
  charKey: z.string(),
  stableId: z.string().prefault(''),
  name: z.string().min(1),
  avatar: z.string().prefault(''),
  avatarZoom: z.coerce
    .number()
    .transform(value => _.clamp(value, 1, 2.5))
    .prefault(1),
  avatarOffsetX: z.coerce
    .number()
    .transform(value => _.clamp(value, -60, 60))
    .prefault(0),
  avatarOffsetY: z.coerce
    .number()
    .transform(value => _.clamp(value, -60, 60))
    .prefault(0),
  remark: z.string().prefault(''),
  avatarCustomized: z.boolean().prefault(false),
  source: z
    .enum(['auto_single_card', 'parsed', 'group_member', 'temporary', 'local_contact', 'local_group'])
    .prefault('parsed'),
  memberKeys: z.array(z.string()).optional(),
  about: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Identity = z.infer<typeof IdentitySchema>;

export const CardRosterMapSchema = z.record(z.string(), z.record(z.string(), IdentitySchema)).prefault({});
export type CardRosterMap = z.infer<typeof CardRosterMapSchema>;

export const CharacterProfileOverrideSchema = z
  .object({
    remark: z.string().prefault(''),
    avatar: z.string().prefault(''),
    avatarZoom: z.coerce
      .number()
      .transform(value => _.clamp(value, 1, 2.5))
      .prefault(1),
    avatarOffsetX: z.coerce
      .number()
      .transform(value => _.clamp(value, -60, 60))
      .prefault(0),
    avatarOffsetY: z.coerce
      .number()
      .transform(value => _.clamp(value, -60, 60))
      .prefault(0),
    avatarCustomized: z.boolean().prefault(false),
    chatPreferences: ChatPreferencesSchema.optional(),
    characterVoice: CharacterVoiceSchema.optional(),
    updatedAt: z.string().prefault(''),
  })
  .prefault({});
export type CharacterProfileOverride = z.infer<typeof CharacterProfileOverrideSchema>;
export const CharacterProfileMapSchema = z.record(z.string(), CharacterProfileOverrideSchema).prefault({});

export const MessageTypeSchema = z.enum([
  'text',
  'image',
  'video',
  'emoji',
  'voice',
  'transfer',
  'location',
  'link',
  'call',
  'system',
  'zone',
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const PhoneMessageSchema = z.object({
  id: z.string(),
  clientId: z.string().prefault(''),
  sender: z.enum(['user', 'char', 'system']),
  type: MessageTypeSchema.prefault('text'),
  content: z.string().prefault(''),
  createdAt: z.string(),
  status: z.enum(['sending', 'sent', 'failed']).prefault('sent'),
  payload: z.record(z.string(), z.unknown()).prefault({}),
  quotedMessageId: z.string().prefault(''),
  favorite: z.boolean().prefault(false),
  withdrawn: z.boolean().prefault(false),
  editedAt: z.string().prefault(''),
  error: z.string().prefault(''),
});
export type PhoneMessage = z.infer<typeof PhoneMessageSchema>;

export const ThreadSchema = z.object({
  clearRevision: z.number().int().prefault(0),
  historyArchive: z.array(PhoneMessageSchema).prefault([]),
  displayFloorCutoff: z.number().int().prefault(-1),
  historyFloorCutoff: z.number().int().prefault(-1),
  id: z.string(),
  charKey: z.string(),
  messages: z.array(PhoneMessageSchema).prefault([]),
  draft: z.string().prefault(''),
  unread: z.coerce
    .number()
    .transform(value => Math.max(0, Math.round(value)))
    .prefault(0),
  hidden: z.boolean().optional(),
  pinned: z.boolean().prefault(false),
  muted: z.boolean().prefault(false),
  generating: z.boolean().prefault(false),
  generationId: z.string().prefault(''),
  updatedAt: z.string(),
});
export type Thread = z.infer<typeof ThreadSchema>;

export const AppSnapshotSchema = z
  .object({
    status: z.string().prefault(''),
    messages: z.string().prefault(''),
    memo: z.string().prefault(''),
    zone: z.string().prefault(''),
    wallet: z.string().prefault(''),
    calendar: z.string().prefault(''),
    browse: z.string().prefault(''),
    music: z.string().prefault(''),
    sourceMessageIds: z.array(z.coerce.number()).prefault([]),
  })
  .prefault({});
export type AppSnapshot = z.infer<typeof AppSnapshotSchema>;

export const IndependentAppUpdateSchema = z.object({
  id: z.string(),
  charKey: z.string(),
  app: z.enum(APP_IDS),
  value: z.unknown(),
  settings: ModuleSettingsSchema,
  createdAt: z.string(),
});
export type IndependentAppUpdate = z.infer<typeof IndependentAppUpdateSchema>;

export const ChatStateSchema = z
  .object({
    moments: MomentsStateSchema,
    chatPreferences: z.record(z.string(), ChatPreferencesSchema).prefault({}),
    characterVoices: z.record(z.string(), CharacterVoiceSchema).prefault({}),
    musicCatalog: z.record(z.string(), z.array(MusicTrackSchema)).prefault({}),
    musicQueues: z.record(z.string(), z.array(MusicTrackSchema)).prefault({}),
    musicPlaylists: z
      .record(
        z.string(),
        z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            cover: z.string().prefault(''),
            tracks: z.array(MusicTrackSchema),
          }),
        ),
      )
      .prefault({}),
    musicFavorites: z.record(z.string(), z.array(z.string())).prefault({}),
    musicHiddenTracks: z.record(z.string(), z.array(z.string())).prefault({}),
    browser: z.record(z.string(), BrowserStateSchema).prefault({}),
    appArtwork: z.record(z.string(), z.record(z.string(), z.string())).prefault({}),
    version: z.literal(1).prefault(1),
    cardKey: z.string().prefault(''),
    chatKey: z.string().prefault(''),
    mode: z.enum(['unknown', 'single', 'multi']).prefault('unknown'),
    identities: z.record(z.string(), IdentitySchema).prefault({}),
    threads: z.record(z.string(), ThreadSchema).prefault({}),
    snapshots: z.record(z.string(), AppSnapshotSchema).prefault({}),
    independentAppUpdates: z.array(IndependentAppUpdateSchema).prefault([]),
    contentTombstones: z.record(z.string(), z.record(z.string(), z.array(z.string()))).prefault({}),
    appFloorCutoffs: z.record(z.string(), z.record(z.string(), z.number().int())).prefault({}),
    zoneInteractions: ZoneInteractionsSchema,
    activeCharKey: z.string().prefault(''),
    walletBook: WalletBookSchema,
    legacyModuleFloors: z.array(z.number().int()).prefault([]),
    modulePolicies: z.record(z.string(), ModuleSettingsSchema).prefault({}),
    electricByApp: z.record(z.string(), z.string()).prefault({}),
    electricTitleByApp: z.record(z.string(), z.string()).prefault({}),
    appUnread: z.record(z.string(), z.array(z.enum(APP_IDS))).prefault({}),
    deletedCharKeys: z.array(z.string()).prefault([]),
    lastSyncedAt: z.string().prefault(''),
  })
  .prefault({});
export type ChatState = z.infer<typeof ChatStateSchema>;

export const ModelMessageSchema = z.object({
  client_id: z.string().prefault(''),
  sender: z.enum(['char', 'system']),
  type: MessageTypeSchema.prefault('text'),
  content: z.string().prefault(''),
  created_at: z.string().prefault(''),
  payload: z.record(z.string(), z.unknown()).prefault({}),
});

export const PhoneChatResponseSchema = z.object({
  context_relation: z.enum(['linked', 'independent']).optional(),
  version: z.literal(1).prefault(1),
  thread_id: z.string().prefault(''),
  messages: z.array(ModelMessageSchema).min(1).max(15),
  app_updates: z.record(z.string(), z.unknown()).prefault({}),
});
export type PhoneChatResponse = z.infer<typeof PhoneChatResponseSchema>;

export const SCRIPT_VARIABLE_KEY = 'wave_phone_settings';
export const PROFILE_VARIABLE_KEY = 'wave_phone_character_profiles';
export const USER_PROFILE_VARIABLE_KEY = 'wave_phone_user_profiles';
export const CARD_ROSTER_VARIABLE_KEY = 'wave_phone_card_rosters';
export const CHAT_VARIABLE_KEY = 'wave_phone_chat';
