/**
 * Generated data file. Do not edit entries by hand; regenerate via the
 * one-off conversion script described in
 * docs/features/infinite-canvas-and-media-tools-prd.md (K1).
 *
 * Source (kunpeng project, MIT License, see /THIRD-PARTY-NOTICES.md):
 *   aigc-memory/prompt-templates/ (gpt-image-2, kling, seedance)
 *   aigc-memory/shot-patterns/
 *   aigc-memory/checklists/
 */
import type { StylePromptTemplateDoc } from '../StylePresetTypes';

export const STYLE_PROMPT_TEMPLATE_DOCS: readonly StylePromptTemplateDoc[] = [
  {
    docId: "gpt-image-2/character-sheet",
    group: "gpt-image-2",
    title: "角色定妆",
    content: "---\r\nengine: gpt-image-2\r\ntype: template\r\nversion: 1\r\ntags: [character, design]\r\n---\r\n\r\n## 角色定妆\r\n{characterName} — {director} 风格\r\n\r\n## 人物描述\r\n{characterDescription}\r\n\r\n## 角度\r\n正面/侧面/四分之三/背面\r\n\r\n## 服装与细节\r\n{outfitDetails}\r\n",
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: "aigc-memory/prompt-templates/gpt-image-2/character-sheet.md" },
  },
  {
    docId: "gpt-image-2/single-shot",
    group: "gpt-image-2",
    title: "角色设定",
    content: "---\r\nengine: gpt-image-2\r\ntype: template\r\nversion: 1\r\ntags: [single-shot]\r\n---\r\n\r\n## 角色设定\r\n你是一位专业分镜摄影师，{director} 风格。\r\n\r\n## 镜头描述\r\n{shotDescription}\r\n\r\n## 技术参数\r\n- 景别：{shotType}\r\n- 拍摄角度：{angle}\r\n- 布光：{lighting}\r\n- 色调：{colorTone}\r\n- 构图：{composition}\r\n\r\n## 约束\r\n{constraints}\r\n",
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: "aigc-memory/prompt-templates/gpt-image-2/single-shot.md" },
  },
  {
    docId: "gpt-image-2/storyboard-3x3",
    group: "gpt-image-2",
    title: "角色设定",
    content: "---\r\nengine: gpt-image-2\r\ntype: template\r\nversion: 1\r\ntags: [storyboard, 3x3, grid]\r\n---\r\n\r\n## 角色设定\r\n你是一位专业分镜导演，擅长{director}风格。\r\n\r\n## 基础格式\r\n画幅比例 {aspectRatio}，{resolution} 分辨率，9 格分镜（3×3）。\r\n\r\n## 逐格描述\r\n{gridContent}\r\n\r\n## 约束\r\nNo watermark, no extra panels, consistent character design, {constraints}\r\n",
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: "aigc-memory/prompt-templates/gpt-image-2/storyboard-3x3.md" },
  },
  {
    docId: "kling/final-shot",
    group: "kling",
    title: "描述",
    content: "---\r\nengine: kling\r\ntype: template\r\nversion: 1\r\ntags: [final-shot]\r\n---\r\n\r\n## 描述\r\n{subject}，{appearance}，{action}，{scene}\r\n\r\n## 环境\r\n{environment}\r\n\r\n## 拍摄\r\n{cameraMovement}，{lighting}，{mood}\r\n\r\n## 参数\r\n- 模型：{model}\r\n- 时长：{duration}s\r\n",
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: "aigc-memory/prompt-templates/kling/final-shot.md" },
  },
  {
    docId: "seedance/README",
    group: "seedance",
    title: "Seedance 权威模板入口",
    content: "---\r\nengine: seedance\r\ntype: authority-index\r\nversion: 1\r\n---\r\n\r\n# Seedance 权威模板入口\r\n\r\n本目录是鲲鹏唯一权威 Seedance 视频提示词规范。其它 skill、工坊、画布、旧 AIGC Project 中出现的 Seedance 写法只作为创作建议；若发生冲突，以本目录为准。\r\n\r\n## 模板选择\r\n\r\n- `single-shot.md`：单镜头视频，一次只描述一个连续镜头。\r\n- `multi-shot.md`：同一场景内 2-4 个子镜头合并，或需要 VO 跨镜头叙事。\r\n\r\n## 最小格式\r\n\r\n```text\r\n分镜场景设定在：{地点/场景} @图片一\r\n{人物}@图片N（VO）：{旁白/画外内心独白，仅需要时写}\r\n分镜具体动作描述：\r\n镜头1 {时长}s 时间: {时间}。 [{景别}/{运镜}] {运镜 -> 动作表情 -> 空间位置 -> 音频/台词} {人物/物体@图片N}\r\n```\r\n\r\n## 提交前红线\r\n\r\n1. 最终提交 API 的提示词里，所有图片引用必须是 `@图片一`、`@图片二` 这类位置编号。\r\n2. 不得残留 `.png`、`.jpg`、文件名、`@人一`、`@物一` 等非位置编号。\r\n3. 音频不占图片编号，只能写成 `用@音频一的音色...`。\r\n4. VO 行只用于旁白或画外内心独白；画面内对白/唱词写进镜头行。\r\n5. 台词用 `{}`，音效用 `<>`，音乐用 `（）`，字幕用 `【】`。\r\n6. 每张上传参考图都必须在提示词中被对应 `@图片N` 引用。\r\n7. 一个镜头只指定一种主要运镜，避免同时推、拉、摇、移。\r\n\r\n",
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: "aigc-memory/prompt-templates/seedance/README.md" },
  },
  {
    docId: "seedance/multi-shot",
    group: "seedance",
    title: "Seedance 2.0 多镜头合并视频提示词模板",
    content: "---\r\nengine: seedance\r\ntype: template\r\nversion: 2\r\ntags: [multi-shot, merged, dialogue, vo]\r\nsource: 火山方舟官方《Doubao Seedance 2.0 系列提示词指南》\r\n---\r\n\r\n# Seedance 2.0 多镜头合并视频提示词模板\r\n\r\n> 官方理念：复杂视频最理想形态是**时间轴化分镜**——把视频拆成几个分镜，按事件顺序动态描述每个分镜：谁 + 在哪 + 做什么 + 镜头怎么动 + 音频。\r\n\r\n## 适用场景\r\n\r\n- 多个短镜头合并为一个视频文件\r\n- 同一场景不同视角的快速切换\r\n- 蒙太奇/快剪序列\r\n- 带 VO（画外音）的跨镜头叙事\r\n\r\n## 标准格式\r\n\r\n```\r\n分镜场景设定在：{地点} @图片一\r\n{人物}@图片N（VO）：旁白/画外内心独白内容（仅旁白才写）\r\n分镜具体动作描述：\r\n镜头{编号}-1 {时长}s 时间: {时间}。 [{景别}/{运镜}] {运镜→动作表情→位置→音频} {物体@图片N}\r\n镜头{编号}-2 {时长}s 时间: {时间}。 [{景别}/{运镜}] {运镜→动作表情→位置→音频} {物体@图片N}\r\n镜头{编号}-3 {时长}s 时间: {时间}。 [{景别}/{运镜}] {运镜→动作表情→位置→音频} {物体@图片N}\r\n```\r\n\r\n## 关键规则\r\n\r\n1. 场景设定行只写一次，在提示词最开头\r\n2. 每个子镜头独立一行，编号用 `{镜号}-1`、`{镜号}-2`、`{镜号}-3` 区分\r\n3. VO 行放在场景设定行之后、镜头行之前——**仅旁白/画外内心独白才用 VO 行**\r\n4. 每个子镜头行的 @ 引用独立写，即使同一物体在多个子镜头出现也要重复写\r\n5. 每镜按官方四层组织：运镜/切换 → 动作表情 → 位置/空间 → 音频\r\n6. 一个镜头只用 **1 种运镜**（不要同时推拉摇移）\r\n7. 所有参数（duration 等）取总时长\r\n\r\n> ⚠️ 时长说明：保留 `{时长}s` 控制节奏，但官方提示模型对精确秒数支持不稳定，作节奏参考、不强依赖；总时长以 `--param duration` 为准。\r\n\r\n## 特殊符号规范（官方，重要）\r\n\r\n| 信息类型 | 符号 | 示例 |\r\n|---------|------|------|\r\n| 台词 | `{}` | `{你好，世界}`；小语种标语种：`用韩语说{밥 다 됐어요?}` |\r\n| 音效 | `<>` | `<远处传来狗叫声>` |\r\n| 音乐 | `（）` | `（背景中播放着紧凑的鼓点）` |\r\n| 字幕 | `【】` | `【第一章：启程】` |\r\n\r\n画面内对白/唱词写进对应镜头描述，台词部分用 `{}` 包裹。\r\n\r\n## 多主体定义（官方，防双胞胎/ID 漂移）\r\n\r\n多人物场景**必须分别定义唯一标签并贯穿使用**，否则易出现\"双胞胎\"（同画面两个相同人物）：\r\n\r\n- 定义：`将@图片N中的[2-3个稳定静态特征]定义为<主体N>`\r\n- 后续持续用同一标签指代（如定义\"警察\"\"小偷\"后全程用该词）\r\n- 或在人物名后标注对应图：`张三（对应图片一）将存折扔向李四（对应图片二）`\r\n- 末尾加全局约束：`视频全程禁止出现外形、着装完全一致的人物，禁止同款分身/双胞胎，同一画面仅保留单个对应人物`\r\n- 人物参考图优先单人独立照，**不用三视图/多视图**\r\n\r\n## 动作描述要求（官方）\r\n\r\n- 肢体细化 + 程度量化（缓慢抬手/快速转头/用力蹬地）\r\n- 优先低缓连续小动作，规避狂奔大跳剧烈翻滚\r\n- 补动作过渡衔接（借转身惯性顺势抬手）\r\n- 情绪用身体细节外化（低头肩颤/嘴角上扬/双拳紧握），不用\"很悲伤\"\"很愤怒\"抽象词\r\n\r\n## 画质 / 风格 / 约束词（片尾必带）\r\n\r\n- 画质：高清，细节丰富，电影质感，光影柔和\r\n- 风格：统一美术调性（项目风格串）\r\n- 约束词：`保持无字幕` / `不要生成Logo` / `不要生成水印` / 明确目标风格防漂移 / `人物面部稳定不变形，无穿模无卡顿`\r\n\r\n## 提交 API 红线\r\n\r\n提交给 API 的最终提示词，所有图片 @ 引用必须是 `@图片N` 位置编号，绝不能残留文件名 / `@人一` / `@物一` / `@音频一` 作图片占位。\r\n\r\n## 示例\r\n\r\n```\r\n分镜场景设定在：诗云塔三层·中庭 @图片一\r\n陈墨@图片二（VO）：长安城三百年前改了蒸汽历。钟楼报时不用钟，用诗。\r\n分镜具体动作描述：\r\n镜头9-1 4s 时间: 夜晚。 [蒙太奇/快速交叉剪辑] 齿轮@图片三从底层到顶层依次加速，蒸汽猛烈喷出，铜管@图片四共鸣朗诵{君不见黄河之水天上来}，陈墨@图片二缓慢抬手站在齿轮前，<蒸汽轰鸣声>。\r\n镜头9-2 4s 时间: 夜晚。 [幻象/慢动作] 蒸汽中凝聚出李白@图片五幻象——宽袍大袖、举杯对月，持续2秒后消散，陈墨@图片二微微睁大眼睛。\r\n镜头9-3 3s 时间: 夜晚。 [中景/固定] 齿轮@图片三缓慢减速，蒸汽消散，压力表回落，陈墨@图片二顺势擦手转身。（背景蒸汽机低鸣渐弱）\r\n```\r\n\r\n## 音频引用（音频不占图片编号）\r\n\r\n- 音频**不写 @音频 占位**，用文字描述音色：`用@音频一的音色用{方言}唱/说：{内容}`\r\n- `--audio` 第1个 = @音频一，仅文字引用，不参与 @图片N 编号\r\n\r\n## VO（画外音）写法\r\n\r\n```\r\n人物名@图片N（VO）：画外音内容...\r\n```\r\n\r\nVO 行放在场景设定行之后、第一个镜头行之前。**仅旁白/画外内心独白用此行**；画面内人物当场说/唱要写进镜头描述（台词用 `{}`），不用 VO 行。没有 VO 则跳过此行。\r\n\r\n## 视频延长 vs 分段拼接（官方）\r\n\r\n- **连续长镜头（视频延长）**：适用单一场景\"文戏\"——长对话、情绪递进、单一路径移动，实现一镜到底沉浸感。\r\n- **场景/动作转折（分段拼接）**：适用剧情转折或复杂快速\"武戏\"——追逐、打斗、蒙太奇，独立生成片段再剪辑组合。\r\n- 实际常结合：先延长生成连贯对话，再拼接空镜/转场。\r\n\r\n## 参数注意\r\n\r\n- `duration` 设各子镜头时长之和（上例 4+4+3=11s，所以 `--param \"duration=11\"`）\r\n- 所有子镜头必须在同一场景（场景图相同），否则应拆为多次调用\r\n- 其余参数同 single-shot 模板\r\n",
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: "aigc-memory/prompt-templates/seedance/multi-shot.md" },
  },
  {
    docId: "seedance/single-shot",
    group: "seedance",
    title: "Seedance 2.0 单镜头视频提示词模板",
    content: "---\r\nengine: seedance\r\ntype: template\r\nversion: 3\r\ntags: [single-shot, multimodal-video]\r\nsource: 火山方舟官方《Doubao Seedance 2.0 系列提示词指南》\r\n---\r\n\r\n# Seedance 2.0 单镜头视频提示词模板\r\n\r\n> 官方核心理念：Seedance 2.0 是「多模态 AI 导演」，把提示词拆成**空间层**（画面有什么）和**时间层**（如何随时间变化）。\r\n> 好提示词是**工程型指令**（谁/在哪/做什么/镜头怎么动/什么顺序），不是文案型形容。\r\n\r\n## 进阶公式（官方）\r\n\r\n```\r\n精准主体 + 动作细节 ＋（建议）场景环境 + 光影色调 + 镜头运镜 + 视觉风格 + 画质 + 约束条件\r\n```\r\n- **必需**：精准主体、动作细节\r\n- **建议**：场景环境、光影色调、镜头运镜、视觉风格、画质、约束条件\r\n- 顺序逻辑：先锁「谁」在「干什么」→ 再交代「在哪」「什么氛围」→ 再说「怎么拍」→ 最后用风格/画质/约束收紧。\r\n\r\n## 标准格式（项目惯例 + 官方四层组织）\r\n\r\n```\r\n分镜场景设定在：{地点} @图片一\r\n{人物}@图片N（VO）：旁白/画外内心独白内容（仅旁白才写此行，没有则跳过）\r\n分镜具体动作描述：\r\n镜头{编号} {时长}s 时间: {时间}。 [{景别}/{运镜}] {画面描述：运镜→动作表情→位置→音频} {人物/物体@图片N}\r\n```\r\n\r\n每个镜头按官方四层顺序组织：\r\n1. **运镜/切换**：如\"全景缓慢推近\"\"固定机位\"\"镜头切至…\"\r\n2. **主体动作与表情**：核心角色/物体的关键动作、神态变化\r\n3. **位置/空间变化**：主体所处场景、位置、空间关系\r\n4. **音频信息**：音效、人声、背景音乐\r\n\r\n> ⚠️ 时长说明：保留 `{时长}s` 用于控制节奏/总时长，但官方提示——**模型对精确秒数（尤其 0–3s）支持不稳定**，时长作节奏参考、不强依赖；总时长以 `--param duration` 为准。\r\n\r\n## 特殊符号规范（官方，重要）\r\n\r\n提示词中用符号区分信息类型，有助模型准确理解：\r\n\r\n| 信息类型 | 符号 | 示例 |\r\n|---------|------|------|\r\n| 台词 | `{}` | `{你好，世界}`；小语种标语种：`用日语说道{こんにちは}` |\r\n| 音效 | `<>` | `<远处传来狗叫声>` |\r\n| 音乐 | `（）` | `（背景中播放着快节奏的摇滚乐）` |\r\n| 字幕 | `【】` | `【第一章：启程】` |\r\n\r\n- 台词 + 音色写法：`人物@图片二用@音频一的音色用湖北宜昌西南官话方言唱：{歌词内容}`\r\n- 画面内对白/唱词写进镜头描述（不另起 VO 行），台词部分用 `{}` 包裹。\r\n\r\n## 示例\r\n\r\n```\r\n分镜场景设定在：诗云塔三层·中庭 @图片一\r\n分镜具体动作描述：\r\n镜头9-1 4s 时间: 夜晚。 [特写/固定] 陈墨@图片二缓慢抬头看齿轮@图片三从底层到顶层依次加速，蒸汽猛烈喷出，铜管@图片四共鸣朗诵{君不见黄河之水天上来}，<蒸汽嘶鸣声>。\r\n```\r\n\r\n## 示例（画面内对白/唱词写进镜头描述，台词用 `{}`）\r\n\r\n```\r\n分镜场景设定在：峡江江面·黄昏 @图片一\r\n分镜具体动作描述：\r\n镜头3-2 12s 时间: 黄昏。 [中景/缓推] 两船缓慢靠近，屈德厚@图片二站船头，借扶船舷的动作顺势挺胸，用@音频一的音色用湖北宜昌西南官话方言唱：{歌词内容}。江风掀衣，对面船工@图片三缓缓抬头望来。（背景江水声与号子声交织）\r\n```\r\n\r\n## 动作描述要求（官方）\r\n\r\n- **肢体细化 + 程度量化**：动作具体到手/腿/头/肩背，补幅度/速度/力度。例：缓慢抬手、快速转头、用力蹬地、微微低头。\r\n- **优先低缓连续小动作**：尽量规避狂奔、大跳、剧烈翻滚等高爆发大动态（易崩坏）。例：缓慢行走、轻轻抬手、顺势坐下。\r\n- **补动作过渡衔接**：写明前后动作惯性承接。例：借转身惯性顺势抬手、从停顿自然过渡到举手。\r\n- **情绪具象外化**：用身体细节表现情绪，不要\"很悲伤\"\"非常愤怒\"这类抽象词。\r\n\r\n| 抽象情绪 | 外化为动作细节 |\r\n|---------|--------------|\r\n| 悲伤 | 低头、肩膀微颤、眼眶泛红、手指攥紧衣角、泪水打转未落 |\r\n| 喜悦 | 嘴角上扬、眉眼舒展、脚步轻快、原地转圈 |\r\n| 紧张/焦虑 | 频繁看表、手指敲桌、呼吸急促、眼神闪躲、啃指甲 |\r\n| 愤怒 | 双拳紧握、下颌紧绷、胸口起伏、眼神如刀、从牙缝挤话 |\r\n| 释然 | 长舒一口气、肩膀放松、淡淡微笑、抬头望远 |\r\n\r\n## 运镜写法\r\n\r\n- 直接用标准运镜术语：中景、特写、全景、缓慢推镜、平稳横移、固定镜头等。\r\n- **一个镜头里只指定 1 种运镜**，不要同时推拉摇移（会增加画面不稳定）。\r\n\r\n## 画质 / 风格 / 约束词（官方，片尾必带）\r\n\r\n- **画质**：高清，细节丰富，电影质感，色彩自然，光影柔和\r\n- **风格**：统一美术调性（如 赛博朋克冷蓝紫色调 / 复古胶片 / 日系清新 / 项目风格串）\r\n- **约束词（必带，规避瑕疵）**：\r\n  - 避免字幕：`保持无字幕` / `避免生成任何文字或字幕`\r\n  - 避免 Logo：`不要生成Logo`\r\n  - 避免水印：`不要生成水印`\r\n  - 防风格漂移：明确写目标风格（如 `2D日漫风格`、`3D国风CG`），尤其参考图偏写实时\r\n  - 人物稳定：`人物面部稳定不变形，动作自然流畅，无卡顿无闪烁`\r\n\r\n## @ 图片引用规则\r\n\r\n| 传入顺序 | 提示词中引用 | 说明 |\r\n|----------|-------------|------|\r\n| 第 1 张 --image | @图片一 | 场景参考图（必须第一张） |\r\n| 第 2 张 --image | @图片二 | 角色/资产图 |\r\n| 第 3 张 --image | @图片三 | 角色/资产图 |\r\n| 第 4 张 --image | @图片四 | 角色/资产图 |\r\n| 第 5 张 --image | @图片五 | 角色/资产图 |\r\n\r\n- 提示词中写 **@图片一 / @图片二 等中文数字**，不要写文件名。\r\n- 每张传入的图都必须在提示词中有对应的 @ 引用，逐张核对。\r\n- **提交 API 的最终提示词**：所有 @ 引用必须是 `@图片N`，绝不能残留文件名 / `@人一` / `@物一` / `@音频一` 作图片占位（API 只认位置编号）。\r\n\r\n## 主体定义（官方，防 ID 漂移/双胞胎）\r\n\r\n- 简单场景未定义主体时：每次用 `主体@图片N` 绑定（如 `张三@图片一`）。\r\n- 多主体/复杂场景：先定义唯一标签并贯穿使用——`将@图片N中的[2-3个稳定静态特征]定义为<主体N>`。例：将视频1中高个子男人定义为警察，矮个子男人定义为小偷，后续持续用\"警察\"\"小偷\"指代。\r\n- 特征用 2–3 个清晰稳定的静态特征（服饰/发型/外观/类别），确保唯一可识别，避免矛盾特征。\r\n\r\n## 音频引用（音频不占图片编号）\r\n\r\n- 音频**不写 @音频 占位**，用文字描述音色：`用@音频一的音色用{方言}唱/说：{内容}`\r\n- `--audio` 第1个 = @音频一，仅在文字里引用，不参与 @图片N 编号。\r\n- ❌ `用女主年轻声音的音色` → ✅ `用@音频一的音色`\r\n- 音色不准时补音色特征描述，如：`用@音频一低厚温润带细碎颗粒感中年男声的音色说`\r\n\r\n## VO 行 vs 画面内声音（易错！）\r\n\r\n- **VO 行**（`人物@图片N（VO）：内容`）**仅用于**旁白、画外内心独白。\r\n- **画面内人物当场说/唱** → 直接写进镜头描述行，台词用 `{}` 包裹，**不另起 VO 行**。\r\n\r\n## 素材配置策略（官方）\r\n\r\n- 四种功能角色：①角色锚定（锁外观）②场景定调（锁环境风格）③运镜参考（锁镜头语言/节奏）④节奏氛围（音频控情绪音色）。\r\n- **推荐 4–5 个素材**：角色图 1–2 张（面部特写/全身）+ 场景图 1 张 + 运镜视频 1 段 + 音频 1 段。\r\n- **不要用满素材上限**（过多致特征优先级混乱、风格冲突、主体识别模糊）。\r\n- **人脸用大头照 + 全身照，不用多视图**（多视图易被识别为多个主体，加剧 ID 漂移/双胞胎）。\r\n- 越需精准参考的素材，放提示词越靠前。\r\n- 参考人物 > 4 人时：分组生图（每组 ≤4 人）再用分组图生视频。\r\n\r\n## 接口选择（关键！）\r\n\r\n| 场景 | 端点 | 说明 |\r\n|------|------|------|\r\n| 有参考图 | `bytedance/seedance-2.0-global/multimodal-video` | 支持多张 --image |\r\n| 无参考图 | `bytedance/seedance-2.0-global/text-to-video` | 纯文本生成 |\r\n| 有真人素材 | multimodal-video + `realPersonMode=true` | **必须加此参数** |\r\n\r\n## 调用模板\r\n\r\n```bash\r\npython3 runninghub.py \\\r\n  --api-key \"<key>\" \\\r\n  --endpoint \"bytedance/seedance-2.0-global/multimodal-video\" \\\r\n  --image \"/path/scene.jpg\" \\\r\n  --image \"/path/character1.jpg\" \\\r\n  --image \"/path/character2.jpg\" \\\r\n  --prompt \"分镜场景设定在：{地点} @图片一\r\n分镜具体动作描述：\r\n镜头{编号} {时长}s 时间: {时间}。 [{景别}/{运镜}] {画面描述} {人物@图片N用@音频一的音色说：台词用花括号}\r\n全程高清电影质感，光影柔和；人物面部稳定不变形；保持无字幕，不要生成Logo和水印。\" \\\r\n  --param \"duration={4~15}\" \\\r\n  --param \"resolution=720p\" \\\r\n  --param \"ratio=16:9\" \\\r\n  --param \"generateAudio=true\" \\\r\n  --param \"realPersonMode=true\" \\\r\n  -o \"./output.mp4\"\r\n```\r\n\r\n## 常用参数\r\n\r\n| 参数 | 值 | 说明 |\r\n|------|-----|------|\r\n| duration | 4-15 | 视频总时长（秒），节奏以此为准 |\r\n| resolution | 720p / 1080p / 2k / 4k | 分辨率 |\r\n| ratio | 16:9 / 9:16 / 1:1 / 4:3 / 21:9 | 画面比例（横屏生字幕概率低于竖屏） |\r\n| generateAudio | true / false | 自动生成配音 |\r\n| realPersonMode | true | 启用真人素材（有人物必加） |\r\n\r\n## 语言规范\r\n\r\n- 台词语言统一，避免中英混用（专有名词除外）。\r\n- 小语种台词需标注语种。\r\n- 多音字/生僻字易读错 → 用同音常用字替换（如\"螭龙山\"→\"吃龙山\"）。\r\n",
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: "aigc-memory/prompt-templates/seedance/single-shot.md" },
  },
  {
    docId: "shot-patterns/README",
    group: "shot-patterns",
    title: "镜头模式路由",
    content: "---\r\ntype: memory-router\r\ncategory: shot-patterns\r\nversion: 1\r\n---\r\n\r\n# 镜头模式路由\r\n\r\n本目录用于给分镜选择镜头结构，不负责引擎提示词格式。\r\n\r\n## 使用方式\r\n\r\n- 建立世界、交代空间、开场定调：读 `establishing.md`\r\n- 对话、视线关系、人物关系：读 `dialogue.md`\r\n- 追逐、冲突、打斗、强运动：读 `action.md`\r\n\r\n## 写入分镜时必须落到字段\r\n\r\n- 景别\r\n- 运镜\r\n- 主体动作\r\n- 情绪外化\r\n- 空间关系\r\n- 时长\r\n- 关联角色/场景/道具\r\n\r\n## 冲突优先级\r\n\r\n镜头模式只决定“怎么拍”，不覆盖角色一致性、导演 DNA 和 Seedance 权威模板。\r\n\r\n",
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: "aigc-memory/shot-patterns/README.md" },
  },
  {
    docId: "shot-patterns/action",
    group: "shot-patterns",
    title: "动作镜头",
    content: "---\r\ntype: shot-pattern\r\nversion: 1\r\ntags: [action, dynamic]\r\n---\r\n\r\n## 动作镜头\r\n目的：传递动感和冲击力\r\n标准配置：\r\n1. 全远景建立（动作空间）\r\n2. 中景跟拍（主体运动）\r\n3. 近景特写（反应/细节）\r\n4. 广角仰拍（强化冲击）\r\n剪辑：快切，15-30帧/镜头\r\n",
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: "aigc-memory/shot-patterns/action.md" },
  },
  {
    docId: "shot-patterns/dialogue",
    group: "shot-patterns",
    title: "对话镜头",
    content: "---\r\ntype: shot-pattern\r\nversion: 1\r\ntags: [dialogue, coverage]\r\n---\r\n\r\n## 对话镜头\r\n目的：捕捉人物交流\r\n标准配置：\r\n1. 双人全景（establishing）\r\n2. 过肩 shot（各方向）\r\n3. 单人近景（各角色）\r\n4. 插入特写（关键道具/反应）\r\n剪辑：遵循 180 度法则\r\n",
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: "aigc-memory/shot-patterns/dialogue.md" },
  },
  {
    docId: "shot-patterns/establishing",
    group: "shot-patterns",
    title: "建立镜头",
    content: "---\r\ntype: shot-pattern\r\nversion: 1\r\ntags: [establishing, wide]\r\n---\r\n\r\n## 建立镜头\r\n目的：交代环境和空间关系\r\n景别：大远景/全景\r\n时长：6-12秒\r\n运动：缓慢横移或固定\r\n作用：让观众理解场景空间\r\n",
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: "aigc-memory/shot-patterns/establishing.md" },
  },
  {
    docId: "checklists/README",
    group: "checklists",
    title: "生成前检查路由",
    content: "---\r\ntype: memory-router\r\ncategory: quality-gates\r\nversion: 1\r\n---\r\n\r\n# 生成前检查路由\r\n\r\n本目录用于提交 API 前的质量门禁。\r\n\r\n## 必读\r\n\r\n- `pre-generation.md`：所有生图、生视频、飞书写入前的总检查清单。\r\n\r\n## 执行原则\r\n\r\n1. 检查失败时先修正，不提交生成。\r\n2. Seedance 视频提示词以 `prompt-templates/seedance/README.md` 为准。\r\n3. 图片引用必须按实际上传顺序核对。\r\n4. 任何文件名引用必须确认文件真实存在。\r\n\r\n",
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: "aigc-memory/checklists/README.md" },
  },
  {
    docId: "checklists/pre-generation",
    group: "checklists",
    title: "生成任务提交前检查清单",
    content: "---\r\ntype: checklist\r\nversion: 3\r\n---\r\n\r\n# 生成任务提交前检查清单\r\n\r\n每次调用 Seedance / 即梦 / 生图 API 前，**必须逐条自检**：\r\n\r\n---\r\n\r\n□ **1. 参考图传了几张？顺序和 @ 编号一一对应了吗？**\r\n   第1张→@图片一（场景），第2张→@图片二，...，第5张→@图片五\r\n\r\n□ **2. 有真人/角色素材吗？**\r\n   如果有 → 必须加 `--param \"realPersonMode=true\"`\r\n\r\n□ **3. 所有上传的资产图在提示词里都有 @ 引用吗？**\r\n   逐张图片比对提示词，确保无遗漏\r\n\r\n□ **4. 接口选对了吗？**\r\n   传图 → `multimodal-video`\r\n   不传图 → `text-to-video`\r\n   （text-to-video 不支持传图！）\r\n\r\n□ **5. 参数完整吗？**\r\n   duration / resolution / ratio / generateAudio 是否已设置？\r\n\r\n□ **6. 飞书表格中的提示词格式正确吗？**\r\n   格式：`分镜场景设定在 + 镜头行`，不是自由发挥？\r\n   飞书表格中 @ 引用用具体文件名（如 @S1_月夜远景_v8.png）\r\n   **注意**：生视频提交时才把文件名换成 @图片一/@图片二！\r\n\r\n□ **7. 用户确认了吗？**\r\n   方案有没有先给用户看过？用户说\"做\"了吗？\r\n\r\n□ **8. 提示词模板类型选对了吗？**\r\n   飞书表格中：`分镜场景设定在：{地点} @文件名.png` + `镜头行`\r\n   不是 GPT-Image-2 的章节格式（角色设定+技术参数+约束）！\r\n   GPT-Image-2 模板 → 仅用于生图，Seedance 模板 → 仅用于生视频\r\n\r\n□ **9. @ 引用中的文件名在文件系统中确实存在吗？**\r\n   每个 @具体文件名 引用前都 `ls` 确认过吗？\r\n   不是凭记忆/命名规则猜的文件名吧？\r\n\r\n□ **10. 场景图是按每个镜头的景别分别匹配的吗？**\r\n   大远景/远景→远景图、中景→中景图、近景/特写→特写图\r\n   不是所有镜头用同一张场景图吧？\r\n\r\n□ **11. 批量操作前做过单条验证吗？**\r\n   先插 1 条 → 验证格式正确 → 再批量执行\r\n   没有直接批量全写吧？\r\n\r\n□ **12. 使用不熟悉的 lark-cli 命令前看过 --help 吗？**\r\n   不确定的参数名/格式先查 --help，不要靠猜\r\n\r\n□ **13. VO 行用对了吗？**\r\n   画面内人物当场说/唱 → 写进镜头描述行\r\n   只有旁白/画外内心独白才用 VO 行\r\n   没把画面内对白错误提成 VO 行吧？\r\n\r\n□ **14. 提交 API 的提示词 @ 引用全是 @图片N 吗？**\r\n   通篇无文件名（.png/.jpg）、无自定义名（@人一/@物一）、无 @音频 当图片占位残留？\r\n   （表格阶段可用文件名，但提交前必须全转成位置编号）\r\n\r\n□ **15. 音频是用文字引用的吗？**\r\n   写成 `用@音频一的音色用{方言}唱/说：内容`，不是 @音频 占位？\r\n\r\n□ **16. select 字段值都是已存在选项吗？**\r\n   没有用选项列表里不存在的值（会上传失败）？\r\n\r\n□ **17. 记录粒度和最终生成维度对齐吗？**\r\n   表格按单镜头还是合并视频建的，和实际生成维度一致？\r\n\r\n---\r\n\r\n全部通过后再执行生成。任何一项未通过 → 修正后再提交。\r\n",
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: "aigc-memory/checklists/pre-generation.md" },
  },
];
