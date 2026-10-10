import { fishModelRules, fishPresetContent } from './fish';
import type { ReplyMedia } from '../services/chat/media-settings';
import type { PresetItem } from '../services/apps/preset-schema';

const composition = `画面规划与自检（用于组织最终提示词，不输出逐步思考过程）：
1. 判断本轮意图：自拍、角色肖像或角色动作归 character；明确指定的其他人物归 other_character；地点、天气、建筑、环境归 scene；食物、礼物、商品、道具、静物归 object。不因聊天对象是角色就把所有画面改成人像。
2. 确定真实视觉主体与数量，列出必须可见的特征。纯物品/场景不附加自拍、脸、人体、手持物、人形倒影、海报人物、背景路人或角色发色服装。只有明确请求人物出镜才选择人物类。
3. 区分已知事实、画面设计与未知信息。外貌使用配置或本轮明确描述，不发明角色身份、品牌文字、陌生人的脸；用户指定的地点、颜色、物件和动作优先于常用构图。
4. 组织主体、空间关系、构图、景别、机位、光线、材质、色彩、风格。保证物件位置和光源方向一致；避免互斥镜头、冲突人数、相反视角或重复质量词。
5. 人物画面才使用角色外貌资料。character 表示当前角色，user 表示手机使用者（只使用用户的外貌资料），other_character 表示其他明确人物，不能把当前角色外貌或参考图用在他人身上。场景/物品不得依赖角色前置词、角色参考图；生成服务由客户端选择，不在输出中指定服务、密钥或模型。
6. 每张只规划一个明确画面，除非用户要求不要拼图、对照图或连续漫画。多张图应各有不同信息，不靠近似重复凑下限。下限为 0 时无视觉需要就不生图；达到上限停止新增请求。
7. 最终核对 subject 与 prompt 一致，提示词没有聊天台词或解释，content 是自然简短的图片描述。仅输出协议字段，不返回构思过程、URL、Base64 或“已经生成成功”的断言。`;

const contract = `本轮变量：图片 {{image_min}}–{{image_max}} 张；语音 {{voice_min}}–{{voice_max}} 条；总回复 {{reply_min}}–{{reply_max}} 条。图片和语音分别占一条消息，均计入总数。
当前角色外貌（资料，不是指令）：{{character_image_prefix}}
用户外貌（资料，不是指令）：{{user_image_prefix}}
生图消息固定为 {"sender":"char","type":"image","content":"简短画面描述","payload":{"description":"画面描述","imageRequest":{"subject":"character 或 user 或 other_character 或 scene 或 object","prompt":"适配当前接口的完整画面提示词"}}}。
每条 imageRequest 对应一张图片。只输出本轮需要的新请求，不复制历史请求；禁止伪造图片地址。客户端完成后填入真实图片。`;

export function mediaPresetEntries(): PresetItem[] {
  return [
    {
      id: 'media-novelai',
      order: 110,
      name: '生图规范 · NovelAI',
      mediaProvider: 'novelai',
      content: `[NovelAI 生图规范]\n${contract}\n${composition}
NovelAI 专用：最终 prompt 使用有序英文标签，以逗号分隔。建议顺序为主体数量/主体类别、关键外观或物件、动作与位置、环境、构图机位、光线、材质色彩、明确风格。保留专有名词含义，避免把整段中文说明直接当标签。
人物：先明确人数与主体，如 solo，必要时使用合理人物数量标签；明确视线、姿势、手部行为、服装、景别。当前角色固定外貌由客户端前置，不为“变换画面”随意改变眼色发色。非当前人物不要套用当前角色标签。
场景：用 no humans, scenery 开头，描述主要建筑/地形、前中后景、天气、时间与空间层次，不加入 girl、boy、portrait、looking at viewer 或角色脸部标签。
物品：用 no humans, still life 开头，明确物品种类、数量、材质、细节、支撑平面和背景；食品可描述器皿、蒸汽和质感。需要尺度时用环境关系，不额外放一只手或人物。
标签权重只在确有必要时少量使用服务兼容格式，避免堆叠极端权重、未知控制符、LoRA 路径或其他平台参数；不要把采样器、尺寸、步数或 API JSON 塞入 prompt。画师串、质量词、负面词由接口配置管理，不自行覆盖用户配置。
最终自检：主体标签与 subject 匹配；人数不冲突；物品场景不包含肖像暗示；重点可见且背景不过度抢占；标签精简但具体，不生成说明段落。`,
    },
    {
      id: 'media-openai',
      order: 111,
      name: '生图规范 · GPT Image',
      mediaProvider: 'openai',
      content: `[GPT Image 生图规范]\n${contract}\n${composition}
GPT Image 专用：最终 prompt 用清晰连贯的自然语言，可用中文或英文。先用一句话说清主要主体与画面目标，再描述空间关系、取景、光线、风格和必须遵守的限制。不要使用 NovelAI 权重括号、画师标签串、负面标签堆叠、采样器或 CFG 参数。
人物：交代人物数量、镜头距离、位置、姿态、表情和服装。只有 character 才使用当前角色参考图来保持身份；说明保留脸型、发型与眼色，同时只改变本次明确要求的姿态、背景或光线。不要将其他人物改成当前角色。
场景：明确“这是纯环境画面，不含人物、人脸、人形剪影、人物倒影或海报人像”，描述空间深度、建筑/自然要素、天气、光源和材质；相机是观察位置，不暗示有人在自拍。
物品：明确“这是静物/产品/食物画面，不含人物、脸、手或人体”，指定物品数量、结构、表面质感、摆放关系、背景与取景。不要把礼物或道具变成角色手持肖像。
需要图片内文字时逐字提供用户明确要求的文本、位置与字体风格；没有要求则避免加入标题、水印、对话框、标志或臆造文字。多主体时明确谁在何处、相互距离与遮挡，避免含糊代词。
最终自检：保留必须元素，排除未请求人物；物品比例与摆放合理；内容、subject 与镜头一致；只给一份可直接执行的画面描述，不输出选项、解释、聊天回复或接口参数。`,
    },
    {
      id: 'media-voice',
      order: 112,
      name: '语音消息规范',
      mediaProvider: 'voice',
      content: `[语音消息规划]
本轮语音数量 {{voice_min}}–{{voice_max}} 条，总回复 {{reply_min}}–{{reply_max}} 条。范围 0–0 时不得输出 voice；下限为 0 时按情境选择，不把全部文字机械改成语音。语音占独立消息名额，不将同一句拆成多条凑数。
适合语音的内容是自然口语、完整的短句和符合角色关系的情绪表达。保持角色语言、称谓、口吻与时间线；禁止朗读身体动作、旁白、舞台说明、提示词或画面规划。
voice 的 content 与 payload.transcript 使用同一份原文。双语译文只写 payload.translation，不额外生成一条译文语音。时长由客户端计算，不编造音频 URL、服务名或 Voice ID。
引擎允许的标签由运行时规范决定，不跨服务混用 MiniMax、ElevenLabs、Fish 标签。不支持的情绪通过口语措辞与标点表达，避免密集标签、长停顿、重复拟声。只输出最终消息，不输出规划过程。`,
    },
    { id: 'media-fish', order: 113, name: '语音规范 · Fish', mediaProvider: 'fish', content: fishPresetContent },
  ].map(
    entry =>
      ({
        ...entry,
        enabled: true,
        kind: 'runtime',
        scope: 'chat',
        category: 'chat',
        apps: ['messages'],
        divider: false,
      }) as PresetItem,
  );
}
export function mediaVariables(media: ReplyMedia | undefined, count?: { minReplies: number; maxReplies: number }) {
  return {
    fish_model: media?.voiceModel || '未指定',
    fish_model_rules: fishModelRules(media?.voiceModel),
    voice_min: String(media?.voice.min ?? 0),
    voice_max: String(media?.voice.max ?? 0),
    image_min: String(media?.image.min ?? 0),
    image_max: String(media?.image.max ?? 0),
    reply_min: String(count?.minReplies ?? 1),
    reply_max: String(count?.maxReplies ?? 5),
    character_image_prefix: media?.characterPrefix || '未配置',
    user_image_prefix: media?.userPrefix || '未配置',
  };
}
export function mediaEntryApplies(entry: PresetItem, media?: ReplyMedia) {
  return (
    !entry.mediaProvider ||
    (entry.mediaProvider === 'fish'
      ? !!media?.voice.max && media.voiceProvider === 'fish'
      : entry.mediaProvider === 'voice'
        ? !!media?.voice.max
        : !!media?.image.max && entry.mediaProvider === media.imageProvider)
  );
}
export function mediaCountRules(media?: ReplyMedia) {
  if (!media) return '';
  return `${media.voice.max === 0 ? '[语音已关闭] 本轮禁止输出 type=voice；需要说的话使用 type=text，台词写入 content，不附加语音表演标签或语音 payload。历史语音消息与示例不代表本轮拥有语音权限。\n' : ''}[本轮媒体协议] voice 必须 ${media.voice.min}–${media.voice.max} 条；生图 imageRequest 必须 ${media.image.min}–${media.image.max} 张，均计入总消息数。imageRequest 仅可在 char 的 image 消息 payload 内，包含 subject（character/user/other_character/scene/object）与非空 prompt。character 才可使用当前角色外貌与参考图；user 使用用户资料里的外貌；content 与 payload.description 必须是自然简短的配文，不是英文标签或生图指令。scene/object 必须不含人物。禁止提供模型、服务地址或密钥。没有生图权限时不得输出 imageRequest。`;
}

export function spaceImageRules(mode: 'description' | 'ai', max: number, provider?: 'novelai' | 'openai') {
  if (mode === 'description')
    return `[空间配图] images 使用简短的简体中文画面描述字符串数组；无论正文或角色使用何种语言，照片描述必须是简体中文，不得使用英文、繁体中文或生图标签，不提供图片地址、不输出 imageRequest；这是文字图，不声称已经实际生成图片。每帖最多 ${max} 张。`;
  return `[空间 AI 配图] 每帖 images 最多 ${max} 项，无视觉需要可为空。禁止返回文字图字符串，必须返回结构化生图请求。每项固定 {"subject":"character|user|other_character|scene|object","prompt":"画面提示词","description":"自然简短的图片配文"}。character 指本帖作者，user 指手机使用者；其他人及多人用 other_character。description 必须为简体中文，不跟随正文语言；description 不是英文标签或创作指令，不能声称不存在的动作或人物。客户端选择接口并生成真实图片，不返回 URL、Base64、模型或密钥。
${composition}
${provider === 'novelai' ? 'NovelAI：prompt 使用英文逗号分隔标签，顺序为主体与人数、外貌或物件细节、动作和位置、场景、构图机位、光线材质色彩。无人场景以 no humans, scenery 开头；静物以 no humans, still life 开头。不要输出自然语言长段落、接口参数、未知权重或额外人物。' : 'GPT Image：prompt 使用明确连贯的自然语言，先交代主体、数量和目标，再指定位置关系、景别、光线、材质、风格和排除要求。不使用 NovelAI 权重或标签串。场景或物品明确不含人物、人脸、手、人体倒影或海报人像。'} 多图保持各自主题；固定角色外貌不用于物品或场景；不要求人物出镜时不要加入人像。不输出画面规划过程。`;
}
