// ==================== 底部导航栏（纯图标白色版） ====================
// 只显示 assets/logo/ 下的图片，无文字，激活时加金色下划线
(function() {
    if (document.getElementById('yy-nav')) return;

    const path = location.pathname.replace(/\/$/, '');
    let active = 'game';
    if (path.endsWith('/hotbet.html')) active = 'hotbet';
    else if (path.endsWith('/assetpage.html')) active = 'assets';

    // 根据页面名称生成对应图标路径
    function getIconSrc(pageName) {
        const nameMap = {
            'game': 'game.png',
            'hotbet': 'hotbet.png',
            'assets': 'asset.png'
        };
        return 'assets/logo/' + (nameMap[pageName] || 'game.png');
    }

    // 生成纯图标链接
    function createIconLink(id, pageName, isActive) {
        const href = isActive ? 'javascript:void(0)' : `/ycardy/${pageName}.html?auth=1`;
        const imgSrc = getIconSrc(pageName);
        return `
        <a href="${href}" id="${id}" style="
            text-decoration: none;
            display: flex; align-items: center; justify-content: center;
            width: 48px; height: 48px;  /* 扩大点击区域 */
            border-radius: 12px;
            transition: background 0.2s;
            ${isActive ? 'background: rgba(184,134,11,0.1);' : ''}
        ">
            <img src="${imgSrc}" alt="" style="
                width: 28px; height: 28px;
                opacity: ${isActive ? '1' : '0.45'};
                transition: opacity 0.2s;
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
        padding: 6px 0 calc(6px + env(safe-area-inset-bottom, 0px));
        z-index: 9999;
    ">
        ${createIconLink('nav-game', 'game', active === 'game')}
        ${createIconLink('nav-hotbet', 'hotbet', active === 'hotbet')}
        ${createIconLink('nav-assets', 'assets', active === 'assets')}
    </nav>`;

    document.body.insertAdjacentHTML('beforeend', navHTML);
})();
