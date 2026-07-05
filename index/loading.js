window.YYCardLoading = (function () {

  let overlay;

  const tips = [
    "正在召唤诸神...",
    "正在连接山海世界...",
    "正在加载英雄数据...",
    "正在开启远古战场...",
    "正在同步玩家信息...",
    "正在重塑命运...",
    "正在初始化卡牌系统...",
    "正在进入战斗准备..."
  ];

  function createUI() {
    if (document.getElementById("yy-loading")) return;

    overlay = document.createElement("div");
    overlay.id = "yy-loading";

    overlay.style.cssText = `
      position:fixed;
      inset:0;
      background: radial-gradient(circle at 50% 30%, #1a1f3a, #05060a);
      display:flex;
      align-items:center;
      justify-content:center;
      flex-direction:column;
      color:white;
      z-index:999999;
      font-family:sans-serif;
      overflow:hidden;
    `;

    overlay.innerHTML = `
      <div style="font-size:32px;font-weight:bold;margin-bottom:10px;
        background:linear-gradient(90deg,#f5d76e,#ffb347);
        -webkit-background-clip:text;color:transparent;">
        ⚔ YY CARD
      </div>

      <div id="yy-tip" style="opacity:0.8;font-size:14px;margin-bottom:20px;">
        正在初始化...
      </div>

      <div style="
        width:70%;
        max-width:300px;
        height:8px;
        background:rgba(255,255,255,0.1);
        border-radius:10px;
        overflow:hidden;
      ">
        <div id="yy-bar" style="
          width:0%;
          height:100%;
          background:linear-gradient(90deg,#ffcc66,#ff7a18,#ffd36a);
          transition:width 0.2s;
        "></div>
      </div>

      <div id="yy-online" style="margin-top:15px;font-size:13px;color:#ffd36a;">
        在线召唤师：--
      </div>
    `;

    document.body.appendChild(overlay);
  }

  function setProgress(p) {
    const bar = document.getElementById("yy-bar");
    if (bar) bar.style.width = p + "%";
  }

  function setTip() {
    const el = document.getElementById("yy-tip");
    if (!el) return;
    el.textContent = tips[Math.floor(Math.random() * tips.length)];
  }

  function setOnline(n) {
    const el = document.getElementById("yy-online");
    if (el) el.textContent = `在线召唤师：${n}`;
  }

  async function start(supabase, checkFn) {
    createUI();

    let p = 0;

    const timer = setInterval(() => {
      p += Math.random() * 12;
      if (p > 100) p = 100;
      setProgress(p);
      setTip();
    }, 600);

    // 在线人数实时更新
    const onlineTimer = setInterval(async () => {
      try {
        const n = await checkFn(supabase);
        setOnline(n);
      } catch {}
    }, 2000);

    // 最少显示 5 秒
    await new Promise(r => setTimeout(r, 5000));

    clearInterval(timer);
    clearInterval(onlineTimer);

    setProgress(100);
    setTip();

    await new Promise(r => setTimeout(r, 500));

    overlay.remove();
  }

  return {
    start
  };

})();
