window.YYCardLoading = (function () {

    let overlay;
    const lang = window.YYCardLoginLang; // 引用语言包

    // tips 从语言包获取
    function getTips() {
        return lang?.t?.('loading_tips') || [
            "Connecting to the Mythic World...",
            "Syncing hero data...",
            "Opening ancient battlefield...",
            "Generating destiny cards...",
            "Verifying player identity...",
            "Connecting to server..."
        ];
    }

    function create() {
        overlay = document.createElement("div");
        overlay.id = "yy-loading";
        overlay.innerHTML = `
            <div id="yy-bg"></div>
            <div id="yy-cloud1"></div>
            <div id="yy-cloud2"></div>
            <div id="yy-logo">
                <div class="logo">⚔ YY CARD</div>
                <div id="tip"></div>
                <div class="bar">
                    <div id="progress"></div>
                </div>
                <div id="online"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        const style = document.createElement("style");
        style.innerHTML = `
            #yy-loading {
                position: fixed;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background: #09111d;
                overflow: hidden;
                z-index: 999999;
                display: flex;
                justify-content: center;
                align-items: center;
                font-family: sans-serif;
            }
            #yy-loading #yy-bg {
                position: absolute;
                width: 180%;
                height: 180%;
                background: radial-gradient(circle, #24355c 0%, #0a1020 70%);
                animation: bgmove 18s linear infinite;
                z-index: 0;
            }
            @keyframes bgmove {
                0% { transform: translate(-10%, -10%) rotate(0deg); }
                100% { transform: translate(-5%, -5%) rotate(360deg); }
            }
            #yy-loading #yy-cloud1,
            #yy-loading #yy-cloud2 {
                position: absolute;
                width: 300px;
                height: 120px;
                background:
                    radial-gradient(ellipse 80% 50% at 30% 50%, rgba(255,255,240,0.25) 0%, transparent 70%),
                    radial-gradient(ellipse 60% 40% at 70% 50%, rgba(255,255,240,0.18) 0%, transparent 70%);
                border-radius: 50%;
                filter: blur(12px);
                z-index: 1;
                animation: cloudDrift linear infinite;
            }
            #yy-loading #yy-cloud1 {
                top: 12%;
                left: -350px;
                animation-duration: 28s;
            }
            #yy-loading #yy-cloud2 {
                top: 58%;
                left: -450px;
                animation-duration: 35s;
                animation-delay: 6s;
            }
            @keyframes cloudDrift {
                0% { transform: translateX(0); }
                100% { transform: translateX(calc(100vw + 500px)); }
            }
            #yy-loading #yy-logo {
                position: relative;
                width: 320px;
                text-align: center;
                color: white;
                z-index: 2;
            }
            #yy-loading .logo {
                font-size: 42px;
                font-weight: bold;
                color: #ffd76a;
                text-shadow: 0 0 15px #ffcc55, 0 0 30px #ff9900;
                animation: breath 2.5s infinite;
            }
            @keyframes breath {
                50% { transform: scale(1.05); }
            }
            #yy-loading #tip {
                margin-top: 18px;
                font-size: 15px;
                opacity: 0.8;
            }
            #yy-loading .bar {
                margin-top: 25px;
                height: 8px;
                background: #233;
                border-radius: 20px;
                overflow: hidden;
            }
            #yy-loading #progress {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #ffd76a, #ff9f1c, #ffe38a);
                transition: 0.1s;
            }
            #yy-loading #online {
                margin-top: 18px;
                font-size: 14px;
                color: #ffd76a;
            }
        `;
        document.head.appendChild(style);
    }

    function setProgress(v) {
        document.getElementById("progress").style.width = v + "%";
    }

    function setTip(t) {
        document.getElementById("tip").innerHTML = t;
    }

    function setOnline(now, max) {
        document.getElementById("online").innerHTML = (lang?.t?.('online_format', { now, max }) || `Online ${now} / ${max}`);
    }

    async function start(supabase, online) {
        create();

        const startTime = Date.now();
        const MIN_DURATION = 5000;
        let onlineCheckDone = false;
        let queueTipActive = false;
        let tipIndex = 0;

        const tips = getTips();

        const progressInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            let progress = (elapsed / MIN_DURATION) * 100;
            if (progress > 100) progress = 100;
            setProgress(progress);
        }, 100);

        let tipInterval = setInterval(() => {
            setTip(tips[tipIndex % tips.length]);
            tipIndex++;
        }, 1500);

        setTip(tips[0]);

        online.waitUntilAvailable(
            supabase,
            (now, max) => {
                setOnline(now, max);
                if (now >= max && !queueTipActive) {
                    clearInterval(tipInterval);
                    setTip(lang?.t?.('queue_tip') || "Server busy, queuing...");
                    queueTipActive = true;
                }
            }
        ).then(() => {
            onlineCheckDone = true;
        });

        while (true) {
            const elapsed = Date.now() - startTime;
            if (elapsed >= MIN_DURATION && onlineCheckDone) break;
            await new Promise(r => setTimeout(r, 200));
        }

        clearInterval(progressInterval);
        clearInterval(tipInterval);

        setProgress(100);
        setTip(lang?.t?.('entering_world') || "Entering the world...");

        await new Promise(r => setTimeout(r, 800));

        overlay.style.transition = "0.8s";
        overlay.style.opacity = "0";

        sessionStorage.setItem('yy_loaded', '1');

        await new Promise(r => setTimeout(r, 800));
        window.location.replace("game.html");
    }

    return {
        start
    };

})();
