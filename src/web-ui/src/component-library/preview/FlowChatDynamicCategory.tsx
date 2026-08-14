import React from 'react';
import type { ComponentCategory, ComponentPreview } from '../types';
import { AlwaysRunningFlowPreview } from './AlwaysRunningFlowPreview';

const dynamicComponents = [
  ['assistant-stream-text', 'Streaming Text - 流式正文', '流式回答、引用来源、复制与追问操作'],
  ['user-message', 'Chat - 对话面板', '对话、活动页签与可发送的输入区'],
  ['conversation-navigation', 'Sidebar Nav - 会话导航', '可折叠的工作区与会话导航'],
  ['composer-actions', 'Prompt Bar - 提示输入栏', 'Rounded / Pill 两种原版模式，含来源、命令、模型与听写入口'],
  ['read-file-card', 'Context Cards - 上下文卡片', '文件、网页与知识片段的选择状态'],
  ['file-operation-card', 'Code Block - 代码输出', '逐行代码、复制与自动换行'],
  ['search-card', 'Search - 命令搜索', '实时过滤、键盘导航与空状态'],
  ['task-card', 'Task Rows - 团队任务', 'Capsules / List 两种原版模式，含运行、失败和完成状态'],
  ['todo-card', 'Selection Actions - 选择操作', '选择正文后交给代理精简、解释或改写'],
  ['web-search-card', 'Recommendation Card - 智能建议', '建议轮播、置信度与采纳操作'],
  ['mcp-tool-card', 'Tool Chips - 工具调用', '多个工具的紧凑状态与详情切换'],
  ['context-compression-card', 'Insight Cards - 运行洞察', '自动更新的指标与可翻页图表'],
  ['skill-card', 'Fine-tune Card - 视觉调参', '布局密度、圆角与实时预览'],
  ['ask-user-card', 'Approval Card - 权限确认', '批准、拒绝与许可范围选择'],
  ['reproduction-steps-card', 'Loading State - 持续运行', 'Drive / Dots / Orbit 三种原版加载模式'],
  ['create-plan-card', 'Records Table - 计划记录', '可选择、可排序的迁移计划表'],
  ['git-tool-card', 'Diff Table - 变更差异', '当前值、提议值与状态摘要'],
  ['init-miniapp-card', 'Filter Table - 状态筛选', '筛选后实时重排的运行记录'],
  ['model-thinking-card', 'Thinking - 思考摘要', 'Steps / Reasoning / Search / Coding 四种原版模式'],
] as const;

const components: ComponentPreview[] = dynamicComponents.map(([id, name, description]) => ({
  id: `dynamic-${id}`,
  name,
  description,
  category: 'flowchat-dynamic-ui',
  component: () => <AlwaysRunningFlowPreview previewId={id} />,
}));

export const flowChatDynamicCategory: ComponentCategory = {
  id: 'flowchat-dynamic-ui',
  name: 'FlowChat 动态 UI',
  description: '19 个 Beautiful UI 原版案例、26 个完整模式，持续运行、可切换、可暂停、可重播',
  layoutType: 'demo',
  components,
};
