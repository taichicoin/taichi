(function() {
    if (document.getElementById('yy-nav')) return;

    const path = location.pathname.replace(/\/$/, '');
    let active = 'game';

    if (path.endsWith('/app/hotbet') || path.endsWith('/app/hotbet.html')) {
        active = 'hotbet';
    } else if (path.endsWith('/app/assetpage') || path.endsWith('/app/assetpage.html')) {
        active = 'assets';
    }

    function createLink(id, targetPage, imgSrc, isActive) {
        const href = isActive ? 'javascript:void(0)' : `/app/${targetPage}?auth=1`;
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
                    width: 31px;
                    height: 31px;
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
        ${createLink('nav-game', 'game', '/assets/logo/game.png', active === 'game')}
        ${createLink('nav-hotbet', 'hotbet', '/assets/logo/hotbet.png', active === 'hotbet')}
        ${createLink('nav-assets', 'assetpage', '/assets/logo/asset.png', active === 'assets')}
    </nav>`;

    document.body.insertAdjacentHTML('beforeend', navHTML);
})();
