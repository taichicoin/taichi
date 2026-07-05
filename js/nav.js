// ==================== 底部导航栏（公共模块） ====================
// 自动根据当前路径高亮对应按钮，点击跳转或切换 Tab
// 从其他页面跳转到游戏/资产时带上 ?auth=1 参数，避免重新登录
(function() {
    if (document.getElementById('yy-nav')) return;

    const path = location.pathname.replace(/\/$/, '');
    let active = 'game';
    if (path.endsWith('/hotbet.html')) active = 'hotbet';

    const navHTML = `
    <nav id="yy-nav" style="
        position: fixed; bottom: 0; left: 0; right: 0;
        display: flex; justify-content: space-around; align-items: center;
        background: rgba(20,28,48,0.95); backdrop-filter: blur(10px);
        border-top: 1px solid rgba(255,215,0,0.3);
        padding: 8px 0 calc(8px + env(safe-area-inset-bottom, 0px));
        z-index: 9999;
    ">
        <a href="/ycardy/game.html?auth=1" id="nav-game" style="
            text-decoration:none; color:${active === 'game' ? '#f5d76e' : '#888'};
            display:flex; flex-direction:column; align-items:center; font-size:0.8rem;
        ">
            <span style="font-size:1.4rem;">🎮</span> 游戏
        </a>
        <a href="/ycardy/hotbet.html" id="nav-hotbet" style="
            text-decoration:none; color:${active === 'hotbet' ? '#f5d76e' : '#888'};
            display:flex; flex-direction:column; align-items:center; font-size:0.8rem;
        ">
            <span style="font-size:1.4rem;">🔥</span> 热点预测
        </a>
        <a href="/ycardy/game.html?auth=1" id="nav-assets" style="
            text-decoration:none; color:${active === 'game' ? '#f5d76e' : '#888'};
            display:flex; flex-direction:column; align-items:center; font-size:0.8rem;
        ">
            <span style="font-size:1.4rem;">💼</span> 资产
        </a>
    </nav>`;

    document.body.insertAdjacentHTML('beforeend', navHTML);
})();
