// ==================== 底部导航栏（公共模块 / 白色版） ====================
// 三个按钮均带 ?auth=1 参数，当前页面按钮点击时不跳转仅高亮
(function() {
    if (document.getElementById('yy-nav')) return;

    const path = location.pathname.replace(/\/$/, '');
    let active = 'game';
    if (path.endsWith('/hotbet.html')) active = 'hotbet';
    else if (path.endsWith('/assetpage.html')) active = 'assets';

    function createLink(id, label, icon, targetPage, isActive) {
        const href = isActive ? 'javascript:void(0)' : `/ycardy/${targetPage}?auth=1`;
        // 未激活文字改为深灰 #555，激活文字使用深金色
        return `<a href="${href}" id="${id}" style="
            text-decoration:none; color:${isActive ? '#b8860b' : '#555'};
            display:flex; flex-direction:column; align-items:center; font-size:0.8rem;
        ">
            <span style="font-size:1.4rem;">${icon}</span> ${label}
        </a>`;
    }

    const navHTML = `
    <nav id="yy-nav" style="
        position: fixed; bottom: 0; left: 0; right: 0;
        display: flex; justify-content: space-around; align-items: center;
        background: #ffffff; /* 改为纯白背景 */
        box-shadow: 0 -1px 4px rgba(0,0,0,0.08); /* 用浅阴影代替原来的模糊边框 */
        border-top: 1px solid #e0e0e0; /* 浅灰色顶部分割线 */
        padding: 8px 0 calc(8px + env(safe-area-inset-bottom, 0px));
        z-index: 9999;
    ">
        ${createLink('nav-game', '游戏', '🎮', 'game.html', active === 'game')}
        ${createLink('nav-hotbet', '热点预测', '🔥', 'hotbet.html', active === 'hotbet')}
        ${createLink('nav-assets', '资产', '💼', 'assetpage.html', active === 'assets')}
    </nav>`;

    document.body.insertAdjacentHTML('beforeend', navHTML);
})();
