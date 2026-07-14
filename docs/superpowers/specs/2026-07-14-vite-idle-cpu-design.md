# Vite 闲置 CPU 优化设计

## 目标

将 Windows 本地开发环境中 Vite 闲置 CPU 从约 150%–302% 降到接近 0%，同时保留页面访问、HMR、固定端口和 Tauri 桌面联调能力。

## 根因与选择

实测根因是 `vite.config.ts` 中 `usePolling: true` 与 `interval: 100` 组合。相同项目、相同插件和 HMR 配置下，100ms 轮询平均占用约 302% CPU；只切换为原生监听后为 0%，esbuild 两组均为 0%。

采用最小方案：删除 Vite 的强制轮询配置，让本地 NTFS 使用 Vite/Chokidar 默认的 Windows 原生文件事件。不会调整业务代码、React 渲染、HMR 端口、依赖预构建或 Tauri 配置。

## 边界与验证

- 修改 `src/web-ui/vite.config.ts`，移除 `server.watch` 的轮询覆盖。
- 新增配置契约测试，确保开发服务器不再默认启用 polling。
- 运行定向测试和 TypeScript 类型检查。
- 启动真实 Vite 服务器，验证页面可访问并采样闲置 CPU。
- 验收目标：闲置采样 CPU 接近 0%，esbuild 接近 0%，HTTP 返回成功。

