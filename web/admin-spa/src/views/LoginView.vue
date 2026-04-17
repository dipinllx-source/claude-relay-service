<template>
  <div class="apple-login">
    <!-- Top nav (fixed, always visible) -->
    <nav class="apple-nav">
      <div class="apple-nav__inner">
        <router-link class="apple-nav__brand" to="/">
          <svg
            aria-hidden="true"
            class="apple-nav__logo"
            fill="none"
            viewBox="0 0 512 512"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient
                id="loginBg"
                gradientUnits="userSpaceOnUse"
                x1="96"
                x2="416"
                y1="64"
                y2="448"
              >
                <stop stop-color="#1C1C1E" />
                <stop offset="1" stop-color="#0F0F10" />
              </linearGradient>
            </defs>
            <rect fill="url(#loginBg)" height="336" rx="80" width="336" x="88" y="88" />
            <path
              d="M214 170C171.03 170 136 205.03 136 248C136 290.97 171.03 326 214 326H251V296H216C189.49 296 168 274.51 168 248C168 221.49 189.49 200 216 200H251V170H214Z"
              fill="#F5F5F7"
            />
            <rect fill="#FFFFFF" height="224" rx="15" width="30" x="240" y="144" />
            <path
              d="M270 170H298C340.97 170 376 205.03 376 248C376 290.97 340.97 326 298 326H270V296H296C322.51 296 344 274.51 344 248C344 221.49 322.51 200 296 200H270V170Z"
              fill="#D1D5DB"
            />
          </svg>
          <span>Relay</span>
        </router-link>
        <div class="apple-nav__links">
          <router-link to="/">首页</router-link>
          <a
            class="apple-nav__dropdown-trigger"
            href="#"
            @click.prevent="toggleDropdown('start')"
            @mouseenter="openDropdown('start')"
          >
            开始使用
            <svg
              aria-hidden="true"
              class="apple-nav__caret"
              :class="{ 'apple-nav__caret--open': activeDropdown === 'start' }"
              viewBox="0 0 10 6"
            >
              <path
                d="M1 1l4 4 4-4"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.4"
              />
            </svg>
          </a>
          <a
            class="apple-nav__dropdown-trigger"
            href="#"
            @click.prevent="toggleDropdown('tutorial')"
            @mouseenter="openDropdown('tutorial')"
          >
            使用教程
            <svg
              aria-hidden="true"
              class="apple-nav__caret"
              :class="{ 'apple-nav__caret--open': activeDropdown === 'tutorial' }"
              viewBox="0 0 10 6"
            >
              <path
                d="M1 1l4 4 4-4"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.4"
              />
            </svg>
          </a>
        </div>
        <div class="apple-nav__cta-placeholder"></div>
      </div>
    </nav>

    <!-- Start dropdown -->
    <div
      class="dropdown-panel"
      :class="{ 'dropdown-panel--open': activeDropdown === 'start' }"
      @mouseleave="closeDropdown"
    >
      <div class="dropdown-panel__inner">
        <div class="dropdown-panel__section">
          <div class="dropdown-panel__label">开始使用</div>
          <router-link class="dropdown-panel__link" to="/start" @click="closeDropdown">
            <i class="fas fa-rocket" />
            <span>快速开始</span>
          </router-link>
          <router-link class="dropdown-panel__link" to="/api-stats" @click="closeDropdown">
            <i class="fas fa-chart-bar" />
            <span>实时数据</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- Tutorial dropdown -->
    <div
      class="dropdown-panel"
      :class="{ 'dropdown-panel--open': activeDropdown === 'tutorial' }"
      @mouseleave="closeDropdown"
    >
      <div class="dropdown-panel__inner">
        <div class="dropdown-panel__section">
          <div class="dropdown-panel__label">使用教程</div>
          <router-link
            v-for="tool in cliTools"
            :key="tool.key"
            class="dropdown-panel__link"
            :to="{ path: '/tutorial', query: { tool: tool.key } }"
            @click="closeDropdown"
          >
            <i :class="tool.icon" />
            <span>{{ tool.name }}</span>
          </router-link>
        </div>
        <div class="dropdown-panel__section dropdown-panel__section--aside">
          <div class="dropdown-panel__label">快捷入口</div>
          <router-link class="dropdown-panel__link" to="/tutorial" @click="closeDropdown">
            <i class="fas fa-book-open" />
            <span>全部教程</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- Backdrop -->
    <div
      class="dropdown-backdrop"
      :class="{ 'dropdown-backdrop--open': !!activeDropdown }"
      @click="closeDropdown"
    ></div>

    <!-- Main -->
    <main class="al-main">
      <div class="al-card">
        <h1 class="al-card__title">登录</h1>

        <form class="al-form" @submit.prevent="handleLogin">
          <div
            class="al-field"
            :class="{ 'al-field--focus': userFocus, 'al-field--filled': loginForm.username }"
          >
            <label class="al-field__label" for="username">用户名</label>
            <input
              id="username"
              v-model="loginForm.username"
              autocomplete="username"
              class="al-field__input"
              name="username"
              required
              type="text"
              @blur="userFocus = false"
              @focus="userFocus = true"
            />
          </div>

          <div
            class="al-field"
            :class="{ 'al-field--focus': passFocus, 'al-field--filled': loginForm.password }"
          >
            <label class="al-field__label" for="password">密码</label>
            <div class="al-field__row">
              <input
                id="password"
                v-model="loginForm.password"
                autocomplete="current-password"
                class="al-field__input"
                name="password"
                required
                :type="showPassword ? 'text' : 'password'"
                @blur="passFocus = false"
                @focus="passFocus = true"
              />
              <button
                class="al-field__toggle"
                tabindex="-1"
                type="button"
                @click="showPassword = !showPassword"
              >
                <i :class="showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'" />
              </button>
            </div>
          </div>

          <Transition name="al-shake">
            <div v-if="authStore.loginError" class="al-error">
              <i class="fas fa-exclamation-circle" />
              <span>{{ authStore.loginError }}</span>
            </div>
          </Transition>

          <button
            class="al-submit"
            :disabled="authStore.loginLoading || !loginForm.username || !loginForm.password"
            type="submit"
          >
            <svg v-if="authStore.loginLoading" class="al-spinner" viewBox="0 0 24 24">
              <circle cx="12" cy="12" fill="none" r="10" stroke="currentColor" stroke-width="3" />
            </svg>
            <span>{{ authStore.loginLoading ? '登录中...' : '继续' }}</span>
          </button>
        </form>
      </div>

      <p class="al-legal">Relay Service</p>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

const authStore = useAuthStore()
const themeStore = useThemeStore()

const activeDropdown = ref(null)
const loginForm = ref({ username: '', password: '' })
const userFocus = ref(false)
const passFocus = ref(false)
const showPassword = ref(false)

const cliTools = [
  { key: 'claude-code', name: 'Claude Code', icon: 'fas fa-robot' },
  { key: 'codex', name: 'Codex', icon: 'fas fa-code' },
  { key: 'gemini-cli', name: 'Gemini CLI', icon: 'fab fa-google' },
  { key: 'droid-cli', name: 'Droid CLI', icon: 'fas fa-terminal' }
]

const openDropdown = (name) => {
  activeDropdown.value = name
}
const toggleDropdown = (name) => {
  activeDropdown.value = activeDropdown.value === name ? null : name
}
const closeDropdown = () => {
  activeDropdown.value = null
}

onMounted(() => {
  themeStore.initTheme()
  authStore.loadOemSettings()
})

const handleLogin = async () => {
  await authStore.login(loginForm.value)
}
</script>

<style scoped>
.apple-login {
  min-height: 100vh;
  background: #f5f5f7;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue',
    'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
  display: flex;
  flex-direction: column;
}

/* ---------- Nav (always visible) ---------- */
.apple-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  height: 48px;
  background: rgba(245, 245, 247, 0.8);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.apple-nav__inner {
  max-width: 1024px;
  margin: 0 auto;
  height: 100%;
  padding: 0 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}
.apple-nav__brand {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #1d1d1f;
  text-decoration: none;
  font-weight: 600;
}
.apple-nav__logo {
  width: 26px;
  height: 26px;
  display: block;
}
.apple-nav__links {
  display: flex;
  gap: 28px;
}
.apple-nav__links a {
  color: #1d1d1f;
  text-decoration: none;
  opacity: 0.85;
  transition: opacity 0.2s;
}
.apple-nav__links a:hover {
  opacity: 1;
}
.apple-nav__cta-placeholder {
  width: 80px;
}
.apple-nav__dropdown-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.apple-nav__caret {
  width: 10px;
  height: 6px;
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  opacity: 0.5;
}
.apple-nav__caret--open {
  transform: rotate(180deg);
}
@media (max-width: 720px) {
  .apple-nav__links {
    display: none;
  }
  .apple-nav__cta-placeholder {
    display: none;
  }
}

/* ---------- Dropdown panel (GPU-only) ---------- */
.dropdown-panel {
  position: fixed;
  top: 48px;
  left: 0;
  right: 0;
  z-index: 48;
  background: rgba(251, 251, 253, 0.98);
  backdrop-filter: saturate(180%) blur(40px);
  -webkit-backdrop-filter: saturate(180%) blur(40px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  transform: scaleY(0);
  transform-origin: top center;
  opacity: 0;
  visibility: hidden;
  will-change: transform, opacity;
  transition:
    transform 0.38s cubic-bezier(0.32, 0.72, 0, 1),
    opacity 0.28s ease,
    visibility 0s 0.38s;
}
.dropdown-panel--open {
  transform: scaleY(1);
  opacity: 1;
  visibility: visible;
  transition:
    transform 0.42s cubic-bezier(0.32, 0.72, 0, 1),
    opacity 0.22s ease,
    visibility 0s 0s;
}
.dropdown-panel__inner {
  max-width: 980px;
  margin: 0 auto;
  padding: 36px 22px 44px;
  display: flex;
  gap: 60px;
}
.dropdown-panel__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 220px;
}
.dropdown-panel__section--aside {
  padding-left: 60px;
  border-left: 1px solid rgba(0, 0, 0, 0.06);
}
.dropdown-panel__label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #86868b;
  padding: 0 0 12px;
  opacity: 0;
  transform: translateY(6px);
  will-change: transform, opacity;
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
  transition-delay: 0s;
}
.dropdown-panel--open .dropdown-panel__label {
  opacity: 1;
  transform: translateY(0);
  transition-delay: 0.06s;
}
.dropdown-panel__link {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
  text-decoration: none;
  color: #424245;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.015em;
  opacity: 0;
  transform: translateY(8px);
  will-change: transform, opacity;
  transition:
    color 0.15s ease,
    opacity 0.35s cubic-bezier(0.32, 0.72, 0, 1),
    transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
  transition-delay: 0s;
}
.dropdown-panel--open .dropdown-panel__link:nth-child(2) {
  transition-delay: 0.05s;
}
.dropdown-panel--open .dropdown-panel__link:nth-child(3) {
  transition-delay: 0.1s;
}
.dropdown-panel--open .dropdown-panel__link:nth-child(4) {
  transition-delay: 0.15s;
}
.dropdown-panel--open .dropdown-panel__link:nth-child(5) {
  transition-delay: 0.2s;
}
.dropdown-panel--open .dropdown-panel__link {
  opacity: 1;
  transform: translateY(0);
}
.dropdown-panel__link:hover {
  color: #0071e3;
}
.dropdown-panel__link i {
  width: 28px;
  font-size: 20px;
  color: #86868b;
  transition: color 0.15s ease;
}
.dropdown-panel__link:hover i {
  color: #0071e3;
}
.dropdown-panel__section--aside .dropdown-panel__link {
  font-size: 17px;
  font-weight: 500;
  color: #6e6e73;
}
.dropdown-panel__section--aside .dropdown-panel__link:hover {
  color: #0071e3;
}
.dropdown-panel__section--aside .dropdown-panel__link i {
  font-size: 16px;
  width: 22px;
}

/* Backdrop */
.dropdown-backdrop {
  position: fixed;
  top: 48px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 47;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  opacity: 0;
  visibility: hidden;
  will-change: opacity;
  transition:
    opacity 0.35s ease,
    visibility 0s 0.35s;
}
.dropdown-backdrop--open {
  opacity: 1;
  visibility: visible;
  transition:
    opacity 0.3s ease,
    visibility 0s 0s;
}

@media (max-width: 720px) {
  .dropdown-panel__inner {
    flex-direction: column;
    gap: 24px;
    padding: 24px 22px 32px;
  }
  .dropdown-panel__section--aside {
    padding-left: 0;
    border-left: none;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    padding-top: 16px;
  }
  .dropdown-panel__link {
    font-size: 20px;
  }
}

/* ---------- Main ---------- */
.al-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px 40px;
}

/* ---------- Card ---------- */
.al-card {
  width: 100%;
  max-width: 370px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  padding: 36px 32px 28px;
}
.al-card__title {
  font-size: 28px;
  font-weight: 700;
  color: #1d1d1f;
  letter-spacing: -0.025em;
  margin: 0 0 24px;
  text-align: center;
  line-height: 1.15;
}

/* ---------- Form ---------- */
.al-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.al-field {
  position: relative;
  border: 1px solid #d2d2d7;
  border-radius: 12px;
  background: #fff;
  transition:
    border-color 0.25s ease,
    box-shadow 0.25s ease;
}
.al-field--focus {
  border-color: #0071e3;
  box-shadow:
    0 0 0 4px rgba(0, 113, 227, 0.15),
    0 0 0 1px #0071e3;
}
.al-field__label {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 17px;
  color: #86868b;
  pointer-events: none;
  transition:
    top 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    font-size 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: left center;
}
.al-field--focus .al-field__label,
.al-field--filled .al-field__label {
  top: 13px;
  transform: translateY(0);
  font-size: 12px;
  color: #86868b;
}
.al-field__input {
  width: 100%;
  padding: 28px 14px 10px;
  border: none;
  background: transparent;
  font-size: 17px;
  font-family: inherit;
  color: #1d1d1f;
  outline: none;
  line-height: 1.25;
  border-radius: 12px;
}
.al-field__row {
  display: flex;
  align-items: center;
}
.al-field__row .al-field__input {
  flex: 1;
}
.al-field__toggle {
  padding: 0 14px 0 6px;
  border: none;
  background: transparent;
  color: #86868b;
  cursor: pointer;
  font-size: 15px;
  transition: color 0.15s;
  margin-top: 8px;
}
.al-field__toggle:hover {
  color: #1d1d1f;
}

/* ---------- Error ---------- */
.al-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  background: #fef2f2;
  border-radius: 12px;
  color: #dc2626;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.4;
}
.al-error i {
  flex-shrink: 0;
  font-size: 14px;
  margin-top: 2px;
}
.al-shake-enter-active {
  animation: shake 0.45s ease-in-out;
}
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-6px);
  }
  40% {
    transform: translateX(6px);
  }
  60% {
    transform: translateX(-3px);
  }
  80% {
    transform: translateX(3px);
  }
}

/* ---------- Submit ---------- */
.al-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 4px;
  padding: 15px;
  border: none;
  border-radius: 12px;
  background: #0071e3;
  color: #fff;
  font-size: 17px;
  font-weight: 400;
  font-family: inherit;
  cursor: pointer;
  letter-spacing: -0.01em;
  transition:
    background 0.2s ease,
    opacity 0.2s ease,
    transform 0.1s ease;
}
.al-submit:hover:not(:disabled) {
  background: #0077ed;
}
.al-submit:active:not(:disabled) {
  transform: scale(0.985);
}
.al-submit:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.al-spinner {
  width: 20px;
  height: 20px;
  animation: spin 0.8s linear infinite;
}
.al-spinner circle {
  stroke-dasharray: 50;
  stroke-dashoffset: 35;
  stroke-linecap: round;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- Legal ---------- */
.al-legal {
  margin-top: 28px;
  font-size: 12px;
  color: #86868b;
  text-align: center;
}
</style>
