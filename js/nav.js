// ==================== 底部导航栏（公共模块 / 白色版 · 图片图标） ====================
// 三个按钮均带 ?auth=1 参数，当前页面按钮点击时不跳转仅高亮
(function() {
    if (document.getElementById('yy-nav')) return;

    const path = location.pathname.replace(/\/$/, '');
    let active = 'game';
    if (path.endsWith('/hotbet.html')) active = 'hotbet';
    else if (path.endsWith('/assetpage.html')) active = 'assets';

    // 生成导航链接（纯图片，无文字）
    function createLink(id, targetPage, imgSrc, isActive) {
        const href = isActive ? 'javascript:void(0)' : `/ycardy/${targetPage}?auth=1`;
        const opacity = isActive ? '1' : '0.45';
        const transform = isActive ? 'scale(1.05)' : 'scale(1)';
        return `
            <a href="${href}" id="${id}" style="
                text-decoration: none;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 6px;
            ">
                <img src="${imgSrc}" alt="" style="
                    width: 28px;
                    height: 28px;
                    object-fit: contain;
                    opacity: ${opacity};
                    transform: ${transform};
                    transition: opacity 0.2s, transform 0.2s;
                ">
            </a>`;
    }

    const navHTML = `
    <nav id="yy-nav" style="
        position: fixed; bottom: 0; left: 0; right: 0;
        display: flex; justify-content: space-around; align-items: center;
        background: #ffffff;
        box-shadow: 0 -1px 4px rgba(0,0,0,0.08);
        border-top: 1px solid #e0e0e0;
        padding: 8px 0 calc(8px + env(safe-area-inset-bottom, 0px));
        z-index: 9999;
    ">
        ${createLink('nav-game', 'game.html', '/assets/logo/game.png', active === 'game')}
        ${createLink('nav-hotbet', 'hotbet.html', '/assets/logo/hotbet.png', active === 'hotbet')}
        ${createLink('nav-assets', 'assetpage.html', '/assets/logo/asset.png', active === 'assets')}
    </nav>`;

    document.body.insertAdjacentHTML('beforeend', navHTML);
})();
