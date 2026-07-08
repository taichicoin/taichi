// /index/lang.js - 登录页专用语言包
window.YYCardLoginLang = (function () {
  const STORAGE_KEY = 'login_lang';
  const DEFAULT_LANG = 'en';

  // 语言包
  const translations = {
    loading_tips: {
      en: [
        "Connecting to the Mythic World...",
        "Syncing hero data...",
        "Opening ancient battlefield...",
        "Generating destiny cards...",
        "Verifying player identity...",
        "Connecting to server..."
      ],
      zh: [
        "正在连接山海世界...",
        "正在同步英雄数据...",
        "正在开启远古战场...",
        "正在生成命运卡牌...",
        "正在校验玩家身份...",
        "正在连接服务器..."
      ]
    },
    queue_tip: {
      en: "Server busy, queuing...",
      zh: "服务器繁忙，正在排队..."
    },
    entering_world: {
      en: "Entering the world...",
      zh: "进入山海世界..."
    },
    online_format: {
      en: "Online {now} / {max}",
      zh: "当前在线 {now} / {max}"
    },
    login_google: {
      en: "Sign in with Google",
      zh: "使用Google登录"
    },
    login_telegram: {
      en: "Sign in with Telegram",
      zh: "使用Telegram登录"
    },
    footer_text: {
      en: "Classics of Mountains and Seas · Journey to the West · Three Kingdoms",
      zh: "山海经 · 西游 · 三国"
    },
    redirecting: {
      en: "Redirecting...",
      zh: "跳转中..."
    },
    signing_in: {
      en: "Signing in...",
      zh: "登录中..."
    },
    login_failed: {
      en: "Login failed: ",
      zh: "登录失败: "
    },
    // 语言切换按钮
    switch_to_en: { en: "EN", zh: "EN" },
    switch_to_zh: { en: "中文", zh: "中文" }
  };

  let currentLang = DEFAULT_LANG;

  // 初始化语言：优先读取 localStorage，未登录时默认为英语
  function init() {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached === 'zh' || cached === 'en') {
      currentLang = cached;
    } else {
      currentLang = DEFAULT_LANG;
      localStorage.setItem(STORAGE_KEY, currentLang);
    }
    applyLanguage();
  }

  function t(key, params = {}) {
    const entry = translations[key];
    if (!entry) return key;
    let text = entry[currentLang] || entry['en'] || key;
    // 支持简单占位符 {now}, {max}
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v);
    }
    return text;
  }

  function getLang() {
    return currentLang;
  }

  function setLang(lang) {
    if (lang === currentLang) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, currentLang);
    applyLanguage();
  }

  // 更新所有带 data-lang-key 的元素
  function applyLanguage() {
    // 更新按钮文字（通过 data-lang-key）
    document.querySelectorAll('[data-lang-key]').forEach(el => {
      const key = el.getAttribute('data-lang-key');
      if (key && translations[key]) {
        // 如果元素是按钮且内部有图片，保留子元素，只改文字节点
        // 简单处理：如果 el 内只有文本，直接替换
        if (el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE) {
          el.textContent = t(key);
        } else {
          // 有子元素（如 img），查找专门的文字容器
          const textSpan = el.querySelector('.btn-text');
          if (textSpan) {
            textSpan.textContent = t(key);
          } else {
            // 没有专用 span，则创建或修改最后一个文本节点
            const textNodes = Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
            if (textNodes.length > 0) {
              textNodes[textNodes.length - 1].textContent = t(key);
            }
          }
        }
      }
    });
    // 更新页脚
    const footer = document.querySelector('.footer');
    if (footer) footer.textContent = t('footer_text');
    // 更新语言切换按钮文字
    updateSwitchButton();
  }

  // 语言切换按钮
  function createSwitchButton() {
    const btn = document.createElement('button');
    btn.id = 'login-lang-switch';
    btn.className = 'lang-switch-btn';
    btn.addEventListener('click', () => {
      const newLang = currentLang === 'zh' ? 'en' : 'zh';
      setLang(newLang);
    });
    document.body.appendChild(btn);
    updateSwitchButton();
  }

  function updateSwitchButton() {
    const btn = document.getElementById('login-lang-switch');
    if (!btn) return;
    // 显示相反的语言选项（点击可切换到另一种语言）
    if (currentLang === 'zh') {
      btn.textContent = t('switch_to_en'); // 显示 "EN"
      btn.title = 'Switch to English';
    } else {
      btn.textContent = t('switch_to_zh'); // 显示 "中文"
      btn.title = '切换中文';
    }
  }

  // 添加按钮样式
  function injectStyles() {
    if (document.getElementById('login-lang-style')) return;
    const style = document.createElement('style');
    style.id = 'login-lang-style';
    style.textContent = `
      .lang-switch-btn {
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 9999;
        background: rgba(255,255,255,0.15);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.25);
        color: white;
        border-radius: 20px;
        padding: 6px 16px;
        font-size: 14px;
        cursor: pointer;
        transition: 0.3s;
        font-weight: 500;
      }
      .lang-switch-btn:hover {
        background: rgba(255,255,255,0.25);
      }
    `;
    document.head.appendChild(style);
  }

  // 页面加载时自动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectStyles();
      init();
      createSwitchButton();
    });
  } else {
    injectStyles();
    init();
    createSwitchButton();
  }

  return { t, getLang, setLang, applyLanguage };
})();
