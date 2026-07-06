// ==================== 底部导航栏（纯图标） ====================
(function() {
    if (document.getElementById('yy-nav')) return;

    const path = location.pathname.replace(/\/$/, '');
    let active = 'game';
    if (path.endsWith('/hotbet.html')) active = 'hotbet';
    else if (path.endsWith('/assetpage.html')) active = 'assets';

    function createLink(id, pageFile, iconFile, isActive) {
        const href = isActive ? 'javascript:void(0)' : `/ycardy/${pageFile}?auth=1`;
        return `<a href="${href}" id="${id}" style="display:flex; align-items:center; justify-content:center; width:48px; height:48px; text-decoration:none;">
            <img src="assets/logo/${iconFile}" style="width:28px; height:28px; opacity:${isActive ? '1' : '0.45'};">
        </a>`;
    }

    const navHTML = `
    <nav id="yy-nav" style="
        position: fixed; bottom: 0; left: 0; right: 0;
        display: flex; justify-content: space-around; align-items: center;
        background: #ffffff;
        box-shadow: 0 -1px 4px rgba(0,0,0,0.08);
        border-top: 1px solid #e0e0e0;
        padding: 6px 0 calc(6px + env(safe-area-inset-bottom, 0px));
        z-index: 9999;
    ">
        ${createLink('nav-game', 'game.html', 'game.png', active === 'game')}
        ${createLink('nav-hotbet', 'hotbet.html', 'hotbet.png', active === 'hotbet')}
        ${createLink('nav-assets', 'assetpage.html', 'asset.png', active === 'assets')}
    </nav>`;

    document.body.insertAdjacentHTML('beforeend', navHTML);
})();
