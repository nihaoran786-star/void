# SplitAI 分镜图电影感 Skill 设计

## 目标

保持 `SplitAI` 现有分镜拆解、上下游资产读取、分镜坐标、图片生成和媒体写回逻辑不变；仅要求它在生成分镜图或关键帧前加载内置 `cinematic-style-repair` Skill。

## 方案选择

采用角色固定白名单方案：在现有 Skill policy/resolver 边界为 `SplitAI` 配置只包含 `cinematic-style-repair` 的内置 Skill 白名单，并在 `CustomSubagent` 运行时提示词中明确生成顺序。相比只改提示词，此方案能防止无关全局 Skill 进入上下文；相比改写分镜模块，它不会触碰现有分镜业务逻辑。

## 模块边界

- `SplitAI` 原提示词继续负责分镜拆解、镜头和关键帧设计。
- Skill policy/resolver 只负责让 `SplitAI` 看见内置电影感 Skill，并隔离其他 Skill。
- `CustomSubagent` 只追加“生图前加载电影感 Skill”的执行约束。
- `GenerateImage`、`GetMediaTaskStatus`、`UploadMediaImage` 以及 `ShortDramaProject` 的坐标和写回逻辑保持不变。
- UI、资产模块、视频模块不修改。

## 数据流

```text
剧本片段 + StoryboardReferencePlan + 已有资产
  -> SplitAI 现有分镜逻辑
  -> cinematic-style-repair
  -> GenerateImage（原 storyboards 坐标）
  -> ShortDramaProject 原写回流程
```

## 测试与完成标准

- `SplitAI` 只启用内置 `cinematic-style-repair`，同名用户 Skill 和 `using-superpowers` 均不可用。
- `AssetAI` 原有两个 Skill 白名单保持不变，其他代理不受影响。
- `SplitAI` 提示词明确要求每次生成分镜图或关键帧前加载电影感 Skill。
- `SplitAI` 原有三项图片媒体工具保持不变。
- 相关 Rust 单元测试和 `cargo check -p void-core` 通过。

