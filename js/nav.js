// ==================== 底部导航栏（公共模块） ====================
// 三个按钮均带 ?auth=1 参数，当前页面按钮点击时不跳转仅高亮
(function() {
    if (document.getElementById('yy-nav')) return;

    const path = location.pathname.replace(/\/$/, '');
    let active = 'game';
    if (path.endsWith('/hotbet.html')) active = 'hotbet';
    else if (path.endsWith('/assetpage.html')) active = 'assets';

    function createLink(id, label, icon, targetPage, isActive) {
        const href = isActive ? 'javascript:void(0)' : `/ycardy/${targetPage}?auth=1`;
        return `<a href="${href}" id="${id}" style="
            text-decoration:none; color:${isActive ? '#f5d76e' : '#888'};
            display:flex; flex-direction:column; align-items:center; font-size:0.8rem;
        ">
            <span style="font-size:1.4rem;">${icon}</span> ${label}
        </a>`;
    }

    const navHTML = `
    <nav id="yy-nav" style="
        position: fixed; bottom: 0; left: 0; right: 0;
        display: flex; justify-content: space-around; align-items: center;
        background: rgba(20,28,48,0.95); backdrop-filter: blur(10px);
        border-top: 1px solid rgba(255,215,0,0.3);
        padding: 8px 0 calc(8px + env(safe-area-inset-bottom, 0px));
        z-index: 9999;
    ">
        ${createLink('nav-game', '游戏', '🎮', 'game.html', active === 'game')}
        ${createLink('nav-hotbet', '热点预测', '🔥', 'hotbet.html', active === 'hotbet')}
        ${createLink('nav-assets', '资产', '💼', 'assetpage.html', active === 'assets')}
    </nav>`;

    document.body.insertAdjacentHTML('beforeend', navHTML);
})();
