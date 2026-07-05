// ==================== 底部导航栏（公共模块） ====================
// 自动根据当前页面 URL 高亮对应按钮，点击跳转到对应页面
(function() {
    if (document.getElementById('yy-nav')) return;

    // 判断当前页面路径，决定高亮哪个按钮
    const path = location.pathname.replace(/\/$/, '');
    let active = 'game'; // 默认高亮游戏
    if (path.startsWith('/hotbet')) active = 'hotbet';
    // 资产和游戏在同一个页面，这里只做跳转，不区分高亮
    // 如果需要资产单独高亮，可以在 game.html 内切换时动态修改

    const navHTML = `
    <nav id="yy-nav" style="
        position: fixed; bottom: 0; left: 0; right: 0;
        display: flex; justify-content: space-around; align-items: center;
        background: rgba(20,28,48,0.95); backdrop-filter: blur(10px);
        border-top: 1px solid rgba(255,215,0,0.3);
        padding: 8px 0 calc(8px + env(safe-area-inset-bottom, 0px));
        z-index: 9999;
    ">
        <a href="/" id="nav-game" style="
            text-decoration:none; color:${active === 'game' ? '#f5d76e' : '#888'};
            display:flex; flex-direction:column; align-items:center; font-size:0.8rem;
        ">
            <span style="font-size:1.4rem;">🎮</span> 游戏
        </a>
        <a href="/hotbet/" id="nav-hotbet" style="
            text-decoration:none; color:${active === 'hotbet' ? '#f5d76e' : '#888'};
            display:flex; flex-direction:column; align-items:center; font-size:0.8rem;
        ">
            <span style="font-size:1.4rem;">🔥</span> 热点预测
        </a>
        <a href="/" id="nav-assets" style="
            text-decoration:none; color:${active === 'game' ? '#f5d76e' : '#888'};
            display:flex; flex-direction:column; align-items:center; font-size:0.8rem;
        ">
            <span style="font-size:1.4rem;">💼</span> 资产
        </a>
    </nav>`;

    document.body.insertAdjacentHTML('beforeend', navHTML);
})();
