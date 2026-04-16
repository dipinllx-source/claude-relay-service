# Apple 风格页面编写规范

按照 Apple.com 官网交互与视觉标准重构或新建前端页面。适用于本项目 `web/admin-spa/` 下的 Vue 3 SPA 公开页面。

## 参考实现

已完成的 Apple 风格页面，作为编写新页面的参照：

- `src/views/LandingView.vue` — 首页落地页（Hero / Bento 特性卡 / 统计 / CTA）
- `src/views/TutorialLandingView.vue` — 使用教程页（子导航下拉 / macOS 窗口风格演示区）

## 页面结构骨架

```vue
<template>
  <div class="apple-landing">
    <!-- 1. Sticky 半透明导航 -->
    <nav class="apple-nav" :class="{ 'apple-nav--scrolled': scrolled }">...</nav>

    <!-- 2. 全宽下拉面板 + 背景遮罩（如需要） -->
    <div class="dropdown-panel" :class="{ 'dropdown-panel--open': open }">...</div>
    <div class="dropdown-backdrop" :class="{ 'dropdown-backdrop--open': open }" @click="open = false"></div>

    <!-- 3. Hero -->
    <section class="hero">...</section>

    <!-- 4. 内容区（可 N 段） -->
    <section class="section reveal">...</section>

    <!-- 5. Footer -->
    <footer class="foot">...</footer>
  </div>
</template>
```

## 设计 Token

### 字体

```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text',
  'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
-webkit-font-smoothing: antialiased;
letter-spacing: -0.015em;
```

### 颜色

| 用途 | 值 |
|------|-----|
| 正文 | `#1d1d1f` |
| 次要文字 | `#6e6e73` |
| 辅助灰 | `#86868b` |
| 分隔线 | `rgba(0,0,0,0.06)` |
| 主按钮 | `#0071e3`（Apple Blue） |
| 深色卡底 | `linear-gradient(135deg, #1d1d1f, #2d2d33)` |
| 浅色卡底 | `linear-gradient(135deg, #f5f5f7, #e8e8ed)` |
| 页面背景 | `#fbfbfd` |

### 字号梯度

| 元素 | 大小 |
|------|------|
| Hero 主标题 | `clamp(36px, 5.2vw, 68px)` weight 700 |
| 段落标题 | `clamp(36px, 5vw, 56px)` weight 700 |
| Bento 卡标题 | `clamp(28px, 3vw, 40px)` weight 700 |
| 下拉面板链接 | `24px` weight 600 |
| 副标题/描述 | `19-21px` weight 400 |
| 正文 | `17px` weight 400 |
| 导航 | `14px` weight 400-500 |
| 标签/LABEL | `12px` weight 600, uppercase, `letter-spacing: 0.06em` |

### 圆角

| 元素 | 值 |
|------|-----|
| Bento 卡片 | `28px` |
| 窗口面板 | `22-24px` |
| 平台图标 | `16px` |
| Pill 按钮 | `980px`（全圆） |

## 导航栏

### Sticky 半透明导航

```css
.apple-nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 50;
  height: 48px;
  transition: background 0.4s ease, backdrop-filter 0.4s ease;
}
.apple-nav--scrolled {
  background: rgba(251, 251, 253, 0.72);
  backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
```

### 下拉菜单（Apple 全宽面板）

**关键原则：纯 GPU 合成，零布局回流**

```css
/* 面板：scaleY 展开，不用 max-height */
.dropdown-panel {
  position: fixed;
  top: 48px; left: 0; right: 0;
  z-index: 48;
  background: rgba(251, 251, 253, 0.98);
  backdrop-filter: saturate(180%) blur(40px);
  transform: scaleY(0);
  transform-origin: top center;
  opacity: 0;
  visibility: hidden;
  will-change: transform, opacity;
  transition: transform 0.38s cubic-bezier(0.32, 0.72, 0, 1),
              opacity 0.28s ease,
              visibility 0s 0.38s;
}
.dropdown-panel--open {
  transform: scaleY(1);
  opacity: 1;
  visibility: visible;
  transition: transform 0.42s cubic-bezier(0.32, 0.72, 0, 1),
              opacity 0.22s ease,
              visibility 0s 0s;
}

/* 逐项交错出现：用 CSS nth-child，不用 :style 绑定 */
.dropdown-panel__link {
  opacity: 0;
  transform: translateY(8px);
  will-change: transform, opacity;
  transition: opacity 0.35s cubic-bezier(0.32, 0.72, 0, 1),
              transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
  transition-delay: 0s;
}
.dropdown-panel--open .dropdown-panel__link { opacity: 1; transform: translateY(0); }
.dropdown-panel--open .dropdown-panel__link:nth-child(2) { transition-delay: 0.05s; }
.dropdown-panel--open .dropdown-panel__link:nth-child(3) { transition-delay: 0.1s; }
.dropdown-panel--open .dropdown-panel__link:nth-child(4) { transition-delay: 0.15s; }
.dropdown-panel--open .dropdown-panel__link:nth-child(5) { transition-delay: 0.2s; }

/* 背景遮罩：opacity only + visibility 延迟 */
.dropdown-backdrop {
  position: fixed;
  top: 48px; left: 0; right: 0; bottom: 0;
  z-index: 47;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  opacity: 0;
  visibility: hidden;
  will-change: opacity;
  transition: opacity 0.35s ease, visibility 0s 0.35s;
}
.dropdown-backdrop--open {
  opacity: 1;
  visibility: visible;
  transition: opacity 0.3s ease, visibility 0s 0s;
}
```

**Vue 侧：纯 class 切换，不用 `<Transition>` + `v-show`**

```vue
<div class="dropdown-panel" :class="{ 'dropdown-panel--open': open }" @mouseleave="open = false">
  ...
</div>
<div class="dropdown-backdrop" :class="{ 'dropdown-backdrop--open': open }" @click="open = false"></div>
```

## 动画规范

### 禁用

- `max-height` 过渡（触发布局回流）
- `<Transition>` + `v-show`（Vue transition 增加 JS 开销）
- `:style="{ transitionDelay }"` 动态绑定（每帧 style recalc）

### 推荐

| 属性 | 用法 |
|------|------|
| `transform` | `scaleY(0→1)` 面板展开、`translateY(8px→0)` 内容入场 |
| `opacity` | 配合 `visibility` 延迟切换 |
| `will-change` | 必加在动画元素上 |

### 曲线

| 场景 | cubic-bezier |
|------|-------------|
| 展开 (ease-out) | `0.32, 0.72, 0, 1` — Apple 惯用 |
| 收起 (ease-in) | `0.55, 0.055, 0.675, 0.19` |
| 弹性入场 | `0.16, 1, 0.3, 1` |

### 滚动触发 (Reveal)

```js
// IntersectionObserver，threshold 0.12，只触发一次
observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('reveal--in')
      observer.unobserve(entry.target)
    }
  })
}, { threshold: 0.12 })
```

```css
.reveal {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
}
.reveal--in { opacity: 1; transform: translateY(0); }
```

## 按钮

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 22px;
  border-radius: 980px;       /* Pill 形状 */
  font-size: 17px;
  font-weight: 400;
  text-decoration: none;
  transition: all 0.2s ease;
  cursor: pointer;
  border: none;
}
.btn--primary { background: #0071e3; color: #fff; }
.btn--primary:hover { background: #0077ed; transform: scale(1.02); }
.btn--ghost { background: transparent; color: #0071e3; }
.btn--ghost:hover { text-decoration: underline; }
.btn--lg { padding: 14px 28px; font-size: 19px; }
```

## Bento 特性卡网格

```css
.features__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
.feat { border-radius: 28px; padding: 40px; min-height: 380px; }
.feat--lg { grid-column: span 2; }       /* 全宽卡 */
.feat--dark { background: linear-gradient(135deg, #1d1d1f, #2d2d33); color: #f5f5f7; }
.feat--light { background: linear-gradient(135deg, #f5f5f7, #e8e8ed); color: #1d1d1f; }
.feat--accent { background: linear-gradient(135deg, #0071e3, #0a84ff); color: #fff; }

/* 移动端单列 */
@media (max-width: 720px) {
  .features__grid { grid-template-columns: 1fr; }
  .feat--lg { grid-column: span 1; }
}
```

## macOS 窗口面板

用于演示区/代码展示：

```css
.demo__frame {
  background: #1d1d1f;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 40px 80px -30px rgba(0, 0, 0, 0.25);
}
.demo__bar {
  height: 44px;
  background: linear-gradient(180deg, #3a3a3c, #2c2c2e);
  border-bottom: 1px solid rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
}
/* 红黄绿三圆点 */
.demo__dot { width: 12px; height: 12px; border-radius: 50%; }
.demo__dot--r { background: #ff5f56; }
.demo__dot--y { background: #ffbd2e; }
.demo__dot--g { background: #27c93f; }
.demo__body {
  background: #fbfbfd;
  padding: 32px;
}
```

## 品牌资产

- Logo SVG：`web/admin-spa/public/favicon.svg`（同时用作 nav brand 和浏览器 favicon）
- SVG 内 gradient ID 加前缀避免页面冲突（如 `relayBg`, `relayBg2`）

## Checklist

新建 Apple 风格页面时逐项检查：

- [ ] 根容器 `.apple-landing`，设置字体栈 + `overflow-x: hidden`
- [ ] 导航 48px 固定，滚动后半透明毛玻璃
- [ ] 下拉用 `scaleY` + `visibility` + `will-change`，不用 `max-height` / `<Transition>`
- [ ] Hero 标题 `clamp()` 响应式，`background-clip: text` 渐变
- [ ] 内容区加 `.reveal` class + IntersectionObserver
- [ ] 按钮用 Pill `border-radius: 980px`
- [ ] 响应式断点 `720px` 和 `900px`
- [ ] `scoped` CSS，不污染全局
- [ ] 格式化 `npx prettier --write`
- [ ] Lint `npx eslint --fix`（注意 `vue/attributes-order`）

## 使用方式

对话中输入 `/apple-style` 即可激活此规范，然后指定要重构的页面或新建的页面路径。
