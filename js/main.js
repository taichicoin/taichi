// ======================
// 完整版 main.js 直接覆盖
// 适配 CF悠悠牌 8人对局 / 商店 / 战斗 / UI全部渲染
// ======================

// 全局UI - 更新左侧8名玩家列表 + 血量
window.updatePlayersUI = async function() {
    const { data: players } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", currentRoom.id)
        .order("hp", { ascending: false });

    const wrap = document.getElementById("playersList");
    if(!wrap) return;
    wrap.innerHTML = "";

    for(let p of players){
        const isMe = p.user_id === currentUser?.id;
        const div = document.createElement("div");
        div.className = `p-2 rounded mb-2 ${isMe ? 'bg-cf-gray ring-2 ring-green-500' : 'bg-cf-dark'} ${p.eliminated ? 'opacity-40' : ''}`;
        div.innerHTML = `
            <div class="flex items-center gap-2">
                <img src="${p.avatar_url||'https://api.dicebear.com/7.x/avataaars/svg'}" class="w-7 h-7 rounded-full">
                <div class="text-sm">${p.username}</div>
            </div>
            <div class="w-full bg-gray-700 rounded h-2 mt-2">
                <div class="h-2 rounded bg-red-500" style="width:${p.hp}%"></div>
            </div>
            <div class="text-right text-xs mt-1">${p.hp}/100</div>
        `;
        wrap.appendChild(div);
    }

    // 更新自己右侧信息
    const me = players.find(x=>x.user_id === currentUser.id);
    if(!me) return;

    document.getElementById("goldText").innerText = me.gold;
    document.getElementById("levelText").innerText = me.level;
    document.getElementById("popText").innerText = `${me.level}/${me.level}`;

    const expTable = [0,2,6,10,16,22,30,40,50];
    const need = expTable[me.level] ?? 50;
    const percent = (me.exp / need) * 100;
    document.getElementById("expBar").style.width = percent+"%";
    document.getElementById("expText").innerText = `${me.exp}/${need}`;
};

// 倒计时更新
window.updateTimerUI = function(sec){
    const el = document.getElementById("timerNum");
    if(el) el.innerText = sec;
};

// 准备阶段UI
window.showPrepareUI = function(phase){
    const t = document.getElementById("phaseTitle");
    if(t) t.innerText = `第 ${phase}回合 — 准备阶段`;
};

// 战斗阶段UI
window.showFightingUI = function(){
    const t = document.getElementById("phaseTitle");
    if(t) t.innerText = "战斗进行中";
};

// 游戏结束
window.showGameResultUI = function(winnerId){
    if(winnerId === currentUser.id){
        alert("你获得第一名！");
    }else{
        alert("对局结束");
    }
};


// =====================================
// 1. 对局战斗核心函数 multiplayer 要调用
// =====================================
// 你以后写真正对战逻辑就写在这里
// 输入双方棋盘, 返回 {胜利者ID,剩余棋子,伤害}
window.simulateBattle = function(boardA, boardB) {

    // 简单模拟：暂时随机胜负
    let winA = Math.random() > 0.5;
    let remain = Math.floor(Math.random() * 5);

    return {
        winner: winA ? "PLAYER1" : "PLAYER2",
        damage: 0,
        remaining_units: remain
    };
};

// =====================================
// 2. 商店随机抽卡函数（CF官方概率）
// =====================================
window.getRandomCardByLevel = function(level) {
    const prob = {
        1: [100,0,0,0,0],
        2: [70,30,0,0,0],
        3: [50,35,15,0,0],
        4: [35,35,25,5,0],
        5: [20,30,35,15,0],
        6: [10,20,40,25,5],
        7: [5,10,30,40,15],
        8: [0,5,20,45,30],
        9: [0,0,10,40,50]
    };

    let list = prob[level];
    let r = Math.random() * 100;
    let cost = 1;
    let sum = 0;
    for(let i=0;i<5;i++){
        sum += list[i];
        if(r <= sum){
            cost = i+1;
            break;
        }
    }

    // 测试假卡牌，以后替换你的 card.json
    return {
        id: "card_"+cost+"_"+Math.random().toFixed(3),
        name: cost+"费测试卡",
        cost: cost,
        camp: "随机阵营",
        star: 1,
        atk: cost*3,
        hp: cost*10
    };
};
