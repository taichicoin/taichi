window.YYCardLoading = (function () {

  let el;

  function createUI() {
    if (document.getElementById("yy-loading")) return;

    el = document.createElement("div");
    el.id = "yy-loading";

    el.style.cssText = `
      position:fixed;
      inset:0;
      background: radial-gradient(circle at 50% 30%, #141a33, #05060a);
      display:flex;
      flex-direction:column;
      justify-content:center;
      align-items:center;
      color:white;
      z-index:999999;
      font-family:sans-serif;
    `;

    el.innerHTML = `
      <div style="font-size:28px;font-weight:bold;color:#ffd36a;">
        ⚔ YY CARD
      </div>

      <div id="yy-text" style="margin-top:10px;opacity:0.8;font-size:14px;">
        正在连接世界...
      </div>

      <div style="width:70%;max-width:280px;height:8px;
        background:rgba(255,255,255,0.1);
        border-radius:10px;margin-top:20px;overflow:hidden;">
        <div id="yy-bar" style="width:0%;height:100%;
          background:linear-gradient(90deg,#ffcc66,#ff7a18);"></div>
      </div>

      <div id="yy-online" style="margin-top:15px;font-size:13px;color:#ffd36a;">
        在线：--
      </div>
    `;

    document.body.appendChild(el);
  }

  function setProgress(p) {
    const bar = document.getElementById("yy-bar");
    if (bar) bar.style.width = p + "%";
  }

  function setText(t) {
    const e = document.getElementById("yy-text");
    if (e) e.textContent = t;
  }

  function setOnline(n) {
    const e = document.getElementById("yy-online");
    if (e) e.textContent = `在线：${n}`;
  }

  async function start(supabase, onlineCheck) {

    createUI();

    let p = 0;

    const timer = setInterval(() => {
      p += Math.random() * 15;
      if (p > 100) p = 100;
      setProgress(p);

      const texts = [
        "正在连接山海世界...",
        "正在加载英雄数据...",
        "正在同步服务器...",
        "正在开启战斗系统...",
      ];

      setText(texts[Math.floor(Math.random() * texts.length)]);
    }, 500);

    const onlineTimer = setInterval(async () => {
      const n = await onlineCheck.getOnlineCount(supabase);
      setOnline(n);

      if (n >= onlineCheck.MAX_ONLINE) {
        setText("服务器满载，正在排队...");
      }
    }, 1500);

    // 最少显示 5 秒
    await new Promise(r => setTimeout(r, 5000));

    // 等待可进入
    await onlineCheck.waitUntilAvailable(supabase);

    clearInterval(timer);
    clearInterval(onlineTimer);

    setProgress(100);
    setText("进入世界...");

    await new Promise(r => setTimeout(r, 600));

    el.remove();

    window.location.href = "game.html";
  }

  return { start };

})();
