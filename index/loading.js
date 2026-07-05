window.YYCardLoading=(function(){

let overlay;

const tips=[

"正在连接山海世界...",

"正在同步英雄数据...",

"正在开启远古战场...",

"正在生成命运卡牌...",

"正在校验玩家身份...",

"正在连接服务器..."

];

function create(){

overlay=document.createElement("div");

overlay.id="yy-loading";

overlay.innerHTML=`

<div id="yy-bg"></div>

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

const style=document.createElement("style");

style.innerHTML=`

#yy-loading{

position:fixed;

left:0;

top:0;

width:100%;

height:100%;

background:#09111d;

overflow:hidden;

z-index:999999;

display:flex;

justify-content:center;

align-items:center;

font-family:sans-serif;

}

#yy-bg{

position:absolute;

width:180%;

height:180%;

background:

radial-gradient(circle,#24355c 0%,#0a1020 70%);

animation:bgmove 18s linear infinite;

}

@keyframes bgmove{

0%{transform:translate(-10%,-10%) rotate(0deg);}

100%{transform:translate(-5%,-5%) rotate(360deg);}

}

#yy-logo{

position:relative;

width:320px;

text-align:center;

color:white;

z-index:2;

}

.logo{

font-size:42px;

font-weight:bold;

color:#ffd76a;

text-shadow:

0 0 15px #ffcc55,

0 0 30px #ff9900;

animation:breath 2.5s infinite;

}

@keyframes breath{

50%{

transform:scale(1.05);

}

}

#tip{

margin-top:18px;

font-size:15px;

opacity:.8;

}

.bar{

margin-top:25px;

height:8px;

background:#233;

border-radius:20px;

overflow:hidden;

}

#progress{

height:100%;

width:0%;

background:linear-gradient(90deg,#ffd76a,#ff9f1c,#ffe38a);

transition:.25s;

}

#online{

margin-top:18px;

font-size:14px;

color:#ffd76a;

}

`;

document.head.appendChild(style);

}

function setProgress(v){

document.getElementById("progress").style.width=v+"%";

}

function setTip(t){

document.getElementById("tip").innerHTML=t;

}

function setOnline(now,max){

document.getElementById("online").innerHTML=

`当前在线 ${now} / ${max}`;

}

async function start(supabase,online){

create();

let p=0;

const timer=setInterval(()=>{

p+=Math.random()*9;

if(p>95)p=95;

setProgress(p);

setTip(tips[Math.floor(Math.random()*tips.length)]);

},500);

await online.waitUntilAvailable(

supabase,

(now,max)=>{

setOnline(now,max);

if(now>=max){

setTip("服务器繁忙，正在排队...");

}

}

);

clearInterval(timer);

setProgress(100);

setTip("进入山海世界...");

await new Promise(r=>setTimeout(r,800));

overlay.style.transition=".8s";

overlay.style.opacity="0";

await new Promise(r=>setTimeout(r,800));

window.location.replace("game.html");

}

return{

start

};

})();
