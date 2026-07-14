# AssetAI Skill 隔离与图片工作流设计

## 目标

只优化 AI 短剧模块的 `AssetAI`：固定其职责、内部提示词和可用 Skill，降低无关 Skill 元数据带来的上下文消耗，同时保留现有图片生成、任务查询、参考图上传和资产写回能力。

本轮不修改 ScriptAI、SplitAI、VideoAI、EditorAI 的职责或 Skill 策略。

## 输入材料与复制约束

用户提供两份外部材料：

- `C:\Users\17949\xwechat_files\wxid_tdtf7qw63djx22_d72b\msg\file\2026-07\角色板提示词(2).txt`
- `C:\Users\17949\Desktop\skill合集自主开发\AI短剧专用skill集\电影感图片`

实现时只读取并复制这些材料。禁止删除、剪切、移动、重命名或覆盖原文件和原目录。

第一份文本不是完整 Skill，需要复制内容后规范化为 `short-drama-character-board`。第二份目录已经是完整 Skill，需要复制为应用内置的 `cinematic-style-repair`，并保留其 `SKILL.md`、`agents/openai.yaml` 和全部 `references/`。

## 模块边界

依赖方向保持为：

```text
ShortDrama UI
  -> AssetAI persistent session
  -> CustomSubagent runtime policy
  -> role-scoped Skill policy
  -> Skill registry
  -> GenerateImage / GetMediaTaskStatus / UploadMediaImage
  -> ShortDramaProject asset persistence
```

- UI 只负责创建和打开 `AssetAI` 会话，不判断 Skill。
- `CustomSubagent` 负责附加 AssetAI 的内部职责和执行顺序。
- Skill policy 负责返回 AssetAI 的固定白名单。
- Skill registry 负责把发现结果与角色白名单取交集，并同时约束列表展示和实际调用。
- 媒体工具继续负责真实图片生成、异步状态和参考图上传。
- `ShortDramaProject` 继续负责资产锚点和 `mediaReference` 写回。

## AssetAI 职责

AssetAI 的首要职责是从当前剧本提取并维护制作资产，而不是直接跳到生图：

1. 使用 `ShortDramaProject` 读取当前剧本、资产需求和已有资产。
2. 提取角色、场景、道具、服装和可复用视觉锚点。
3. 区分同一角色在不同集数或剧情状态下的年龄、发型、服装、伤势、妆容和情绪变化。
4. 为每个独立资产创建或更新资产锚点。
5. 根据资产类型调用规定的 Skill，再调用现有媒体工具。
6. 将成功结果写回对应资产的 `mediaReference`，不得只留在聊天记录中。

缺少剧本或资产信息时，AssetAI 不得虚构，应通过现有 ChangeRequest 流程请求 ScriptAI 或 MainAI 补充。

## 固定 Skill 白名单

AssetAI 只允许以下两个 Skill：

- `short-drama-character-board`
- `cinematic-style-repair`

`using-superpowers`、开发类、Office 类以及其他全局用户 Skill 不得出现在 AssetAI 的 `<available_skills>` 中，也不得通过显式 Skill 调用绕过白名单。

白名单只限制 Skill，不削减工具。AssetAI 必须继续拥有：

- `ShortDramaProject`
- `Skill`
- `GenerateImage`
- `GetMediaTaskStatus`
- `UploadMediaImage`

## 图片生成规则

### 角色身份板

角色图或角色身份板必须依次加载两个 Skill：

1. 使用 `short-drama-character-board` 固定 16:9 身份板格式、身份一致性、视角组合、留白、轮廓研究、表情研究和角色 ID 块。
2. 使用 `cinematic-style-repair` 固定电影感、可信光线、材质、肤色、镜头质感和参考图路由。

合成提示词时，角色板 Skill 决定版式与身份研究结构；电影感 Skill 决定视觉风格与成像质量。电影感规则不得破坏角色板的无重叠、无遮挡、完整肢体和身份一致性要求。

### 场景、人物镜头与道具图

场景图、人物镜头图、道具图和其他资产图片必须使用 `cinematic-style-repair`。只有输出目标是角色身份板时才额外使用 `short-drama-character-board`。

### 媒体落库

每个资产使用独立媒体任务，并携带短剧坐标：`projectId`、`stage: "assets"`、`artifactId`、`artifactHandle` 和 `outputMediaLabel`。生成成功后使用 `ShortDramaProject.upsert_asset_artifact` 更新 `mediaReference`。

## Skill 内容设计

### short-drama-character-board

把原文本复制并整理为合法 Skill：

- YAML frontmatter 只包含 `name` 和 `description`。
- 正文使用命令式步骤，保留原始角色板要求。
- 增加输入检查：角色身份、参考图、服装状态、集数状态。
- 增加输出检查：16:9、身份一致、视角分离、面部与肢体不裁切、无水印。
- 不加入图片供应商参数，不替代 `GenerateImage`。

### cinematic-style-repair

完整复制现有 Skill，不改变原目录。应用内副本保留渐进式 references 加载方式。若需要适配 AssetAI，只在副本中增加极少量短剧资产上下文说明，不删除现有电影感流程。

## 测试策略

采用小步 TDD：

1. 测试 AssetAI 解析后的 Skill 列表只包含两个白名单 Skill。
2. 测试 `using-superpowers` 即使存在于用户 Skill 根目录也不会进入 AssetAI。
3. 测试其他 agent type 不被 AssetAI 白名单误伤。
4. 测试 AssetAI 仍保留全部现有图片工具。
5. 测试 AssetAI 内部提示词明确规定角色板双 Skill、其他资产电影感 Skill，以及资产写回流程。
6. 使用 Skill 校验脚本验证两个内置 Skill 的 frontmatter、目录名和引用文件。

最小验证包括相关 Rust 单元测试、Skill 校验、`void-core` 构建或类型检查。不会修改或覆盖用户提供的外部原文件。

## 完成标准

- AssetAI 上下文中只有两个规定 Skill。
- 角色身份板强制使用两个 Skill；其他资产图片强制使用电影感 Skill。
- 剧本资产提取和分集角色状态成为 AssetAI 首要流程。
- 图片生成、状态查询、上传和写回能力全部保留。
- 外部原文件和原 Skill 目录内容、路径均保持不变。
- 改动集中在 Skill 资源、角色运行时策略和测试，不把业务判断放入 UI。
