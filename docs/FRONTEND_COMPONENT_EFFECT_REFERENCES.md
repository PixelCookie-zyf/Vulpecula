# Vulpecula 前端组件与动效参考

> 用于记录 Vulpecula 后续可复用的前端组件与视觉动效资源。新增页面或交互时优先从本清单中选择合适方案，再适配现有品牌、主题和交互规范。

- 最近核对：2026-08-24
- 适用范围：创作台、图片生成流程、任务状态、资产管理及通用交互组件

## 使用原则

1. 保持 Vulpecula 自身的视觉语言，不直接照搬示例站点的品牌、颜色或排版。
2. 接入前检查许可证、依赖体积、框架兼容性和维护状态。
3. 所有组件和动效都需要同时适配亮色与暗色主题。
4. 动效需要支持 `prefers-reduced-motion`，并提供简化或静态替代方案。
5. 等待动画应对应真实任务状态，不使用虚假的完成进度。
6. 图片生成相关界面不得在客户端暴露 Gemini API Key 或其他敏感配置。

## 资源优先级

| 资源 | 优先级 | 主要用途 | 使用策略 |
| --- | --- | --- | --- |
| Image Generation Effect | P0 · 必须使用 | 图片生成等待、生成结果揭示与过渡 | 后续正式生成流程的核心动效参考 |
| Dot Matrix | P1 · 推荐 | 排队、上传、分析、生成、导出等等待状态 | 按场景选择轻量 Loader，并统一状态语义 |
| Astryx Components | P2 · 按需 | 输入、弹窗、提示、导航及资产操作组件 | 选择性参考或接入，不整体替换现有设计系统 |

## 1. Astryx Components

- 地址：[astryx.atmeta.com/components](https://astryx.atmeta.com/components/)
- 类型：React 通用组件库
- 优先级：P2 · 按需使用
- 规模：组件目录覆盖应用外壳、按钮、卡片、输入、弹窗、导航、表格、Toast、Skeleton、Spinner、聊天布局等常见产品场景。

### 适合 Vulpecula 的场景

- Prompt Composer 与附件输入
- 模型、画幅和生成参数选择器
- 图片预览 Lightbox
- 任务详情 Drawer / Dialog
- Toast、Tooltip、Dropdown Menu
- 空状态、Skeleton 和加载占位
- 资产库筛选、分页与批量操作
- 快捷命令面板

### 接入参考

```bash
npm install @astryxdesign/core
```

```tsx
import { ComponentName } from "@astryxdesign/core/ComponentName";
```

### 注意事项

- 优先挑选单个组件，不为少量需求整体迁移现有 UI。
- 接入后使用 Vulpecula 的颜色、圆角、阴影、字体和间距变量重新适配。
- 合并前验证键盘操作、焦点状态、ARIA 属性及移动端表现。
- 依赖进入正式项目之前再次确认许可证与打包体积。

## 2. Dot Matrix Loaders

- 地址：[dotmatrix.zzzzshawn.cloud](https://dotmatrix.zzzzshawn.cloud)
- 类型：React / TypeScript / Tailwind CSS / shadcn 风格等待动效
- 优先级：P1 · 推荐
- 特点：提供多种点阵 Loader，适合替代常见的通用圆形 Spinner。

### 适合 Vulpecula 的场景

- Gemini 请求连接与任务入队
- 参考图片上传
- 风格分析与提示词处理
- 图片生成中
- 高清化、变体生成和导出
- 资产库数据加载

### 选择建议

- 行内或按钮状态：使用节奏简洁、占用空间较小的点阵动效。
- 生成面板：使用结构清晰、有视觉中心的循环动效。
- 全屏等待：可使用更具氛围感的点阵图案，但避免遮盖任务状态和取消操作。

### 安装示例

```bash
npx shadcn@latest add @dotmatrix/dotm-square-3
```

### 注意事项

- 动画颜色应继承当前主题，不叠加不必要的霓虹渐变。
- 页面中同时出现的动态 Loader 不宜超过一个视觉焦点。
- 为耗时任务显示真实阶段文案，例如 `Queuing`、`Generating`、`Finalizing`。
- 请求失败或取消时立即停止循环动画，并给出明确的重试入口。

## 3. Image Generation Effect

- 地址：[image.jakubantalik.com](https://image.jakubantalik.com)
- 类型：图片生成与结果出现过程的交互动效参考
- 优先级：P0 · 必须使用
- 决策：Vulpecula 后续正式图片生成流程必须参考并使用这一方向的生成特效。

### 计划使用位置

1. 用户提交 Prompt 后，生成画布从初始占位进入生成状态。
2. Gemini 返回结果时，图片由生成状态自然过渡为清晰成品。
3. 重新生成、生成变体和高清化时，复用同一套状态语言。

### 状态映射

| 任务状态 | 界面表现 |
| --- | --- |
| `queued` | 轻量等待提示，保留取消入口 |
| `generating` | 使用核心图片生成动效，并显示当前阶段 |
| `completed` | 动效自然收束，完整展示原图，不附加灰色蒙层 |
| `failed` | 停止动效，保留 Prompt 与参数，提供重试操作 |

### 接入检查

- 在实现前确认示例的技术方式、使用许可及浏览器兼容性。
- 优先在项目内实现同类效果，不直接使用第三方页面 iframe。
- 动效只作用于生成过程，不改变结果图片的色彩、清晰度或构图。
- 适配亮色、暗色以及低动态偏好。
- 生成超时、失败、取消和重试都需要有完整状态。
- 图片完成后应立即恢复原始画质，避免残留模糊、灰层或高光遮罩。

## 4. AI Prompt Composer

### Vercel AI Elements · Prompt Input

- 地址：[elements.ai-sdk.dev/components/prompt-input](https://elements.ai-sdk.dev/components/prompt-input)
- 类型：React / shadcn 风格的多模态 Prompt 输入组件
- 适合能力：自适应文本区、参考图附件、模型选择、状态化提交按钮、键盘提交和移动端适配
- 使用策略：优先参考组件结构与状态设计，按 Vulpecula 的图片生成参数重新排版，不直接套用默认主题。

### assistant-ui · Composer

- 地址：[assistant-ui.com/docs/primitives/composer](https://www.assistant-ui.com/docs/primitives/composer)
- 类型：Headless React Composer primitives
- 适合能力：浮动输入框、附件、提交控制、输入焦点与键盘行为
- 使用策略：需要完整对话线程和流式消息状态时再接入运行时；主页概念阶段只参考其简洁的浮动 Composer 形态。

### 当前采用方向

- 使用单一完整容器承载文本输入和工具栏。
- 参考图作为明确的一级操作，风格、比例和模型组成紧凑参数组。
- 输入框使用系统默认字体与 Regular 字重，聚焦时仅显示光标。
- 保留项目现有 React 状态与轻量 CSS，不为主页概念稿引入完整聊天运行时依赖。

### 模型品牌图标

- 来源：[Lobe Icons](https://github.com/lobehub/lobe-icons)
- 采用：Gemini、FLUX、MiniMax 与 ByteDance SVG；Seedance 使用其所属 ByteDance 的品牌标识。
- 使用策略：SVG 保存为本地静态资源，通过遮罩适配亮暗主题；品牌图形不变形、不加阴影。

## 推荐组合

后续创作台可以按以下方式组合：

- 输入与参数组件：参考 Astryx Components。
- 主页 Prompt Composer：结合 Vercel AI Elements 的功能结构与 assistant-ui 的克制浮动形态。
- 排队、上传和短暂处理中：使用 Dot Matrix Loader。
- 正式图片生成与结果揭示：必须使用 Image Generation Effect 的视觉方向。

## 新资源记录模板

后续新增组件或动效资源时，按以下字段补充：

```md
### 资源名称

- 地址：
- 类型：
- 优先级：P0 / P1 / P2
- 适用页面：
- 主要用途：
- 技术栈与依赖：
- 许可证：
- 采用状态：待评估 / 计划使用 / 已接入 / 停用
- 注意事项：
```
