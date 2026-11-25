/* ============================================================
   ABISSO · CAMADA DE REDE (PeerJS)
   Conexão direta entre dois navegadores (WebRTC). Um jogador cria a
   sala e recebe um código; o outro digita o código para entrar.

   API:  AbissoNet.host()        cria sala  -> evento 'room' (código)
         AbissoNet.join(codigo)  entra na sala
         AbissoNet.send(obj)     envia objeto JSON ao parceiro
         AbissoNet.on(ev, fn)    'room' | 'open' | 'msg' | 'close' | 'error' | 'ping'
         AbissoNet.close()       encerra tudo

   Config opcional (antes de carregar este arquivo):
     window.ABISSO_PEER = { host:'meu-servidor', port:9000, path:'/', secure:true,
                            config:{ iceServers:[ ...STUN/TURN... ] } };
   ============================================================ */
(function(){
'use strict';
var ALPH='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',PREFIX='abisso-',CHUNK=8000;
var peer=null,conn=null,role=null,h={},pingTimer=null,lastRx=0,rtt=0,code='',joinTimer=null,asm={},cid=1,closing=false;

function emit(n,a){try{if(h[n])h[n](a);}catch(e){try{console.warn('[AbissoNet]',e);}catch(_){}}}
function mk(){var s='';for(var i=0;i<5;i++)s+=ALPH.charAt(Math.floor(Math.random()*ALPH.length));return s;}
function opts(){var o={debug:0},u=window.ABISSO_PEER||{};for(var k in u)o[k]=u[k];return o;}
function rnd2(k,v){return(typeof v==='number'&&v%1!==0)?Math.round(v*100)/100:v;}
function stopTimers(){if(pingTimer){clearInterval(pingTimer);pingTimer=null;}if(joinTimer){clearTimeout(joinTimer);joinTimer=null;}}
function cleanup(){
  closing=true;stopTimers();asm={};
  try{if(conn)conn.close();}catch(e){}
  try{if(peer)peer.destroy();}catch(e){}
  conn=null;peer=null;role=null;code='';closing=false;}

function rawSend(str){
  if(!conn||!conn.open)return false;
  try{
    if(str.length<=CHUNK){conn.send(str);return true;}
    var id=cid++,n=Math.ceil(str.length/CHUNK);
    for(var i=0;i<n;i++)conn.send(JSON.stringify({t:'~c',id:id,i:i,n:n,d:str.substr(i*CHUNK,CHUNK)}));
    return true;
  }catch(e){return false;}}

function onData(d){
  lastRx=Date.now();
  var m;try{m=typeof d==='string'?JSON.parse(d):d;}catch(e){return;}
  if(!m||typeof m!=='object')return;
  if(m.t==='~c'){
    var a=asm[m.id]||(asm[m.id]={n:m.n,got:0,p:[]});
    if(a.p[m.i]===undefined){a.p[m.i]=m.d;a.got++;}
    if(a.got>=a.n){delete asm[m.id];var full;try{full=JSON.parse(a.p.join(''));}catch(e){return;}emit('msg',full);}
    return;}
  if(m.t==='~p'){rawSend(JSON.stringify({t:'~q',ts:m.ts}));return;}
  if(m.t==='~q'){rtt=Date.now()-m.ts;emit('ping',rtt);return;}
  emit('msg',m);}

function startPing(){
  if(pingTimer)clearInterval(pingTimer);
  lastRx=Date.now();
  pingTimer=setInterval(function(){
    if(!conn||!conn.open)return;
    rawSend(JSON.stringify({t:'~p',ts:Date.now()}));
    if(Date.now()-lastRx>9000){var c=conn;conn=null;stopTimers();try{c.close();}catch(e){}emit('close',{reason:'timeout'});}
  },2000);}

function wire(c){
  conn=c;
  c.on('open',function(){if(joinTimer){clearTimeout(joinTimer);joinTimer=null;}startPing();emit('open',{role:role});});
  c.on('data',onData);
  c.on('close',function(){if(conn===c&&!closing){conn=null;stopTimers();emit('close',{reason:'closed'});}});
  c.on('error',function(e){emit('error',e);});}

function host(){
  cleanup();role='host';
  (function open(n){
    code=mk();
    try{peer=new window.Peer(PREFIX+code,opts());}catch(e){emit('error',{type:'lib',message:String(e)});return;}
    var me=peer;
    me.on('open',function(){emit('room',code);});
    me.on('connection',function(c){
      if(conn&&conn.open){c.on('open',function(){try{c.send(JSON.stringify({t:'~full'}));}catch(e){}setTimeout(function(){try{c.close();}catch(e){}},300);});return;}
      wire(c);});
    me.on('error',function(e){
      if(e&&e.type==='unavailable-id'&&n<6){try{me.destroy();}catch(_){}open(n+1);return;}
      emit('error',e);});
    me.on('disconnected',function(){try{if(peer===me&&!me.destroyed)me.reconnect();}catch(e){}});
  })(0);}

function join(c){
  cleanup();role='guest';code=String(c||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(code.length<4){emit('error',{type:'bad-code'});return;}
  try{peer=new window.Peer(opts());}catch(e){emit('error',{type:'lib',message:String(e)});return;}
  var me=peer;
  me.on('open',function(){
    var cn=me.connect(PREFIX+code,{reliable:true,serialization:'raw'});
    wire(cn);
    joinTimer=setTimeout(function(){if(!conn||!conn.open)emit('error',{type:'timeout'});},14000);});
  me.on('error',function(e){emit('error',e);});}

window.addEventListener('pagehide',function(){try{if(conn&&conn.open)rawSend(JSON.stringify({t:'bye'}));}catch(e){}});

window.AbissoNet={
  host:host,join:join,
  send:function(o){return rawSend(JSON.stringify(o,rnd2));},
  on:function(n,f){h[n]=f;},
  close:function(){cleanup();},
  isOpen:function(){return !!(conn&&conn.open);},
  role:function(){return role;},
  code:function(){return code;},
  rtt:function(){return rtt;},
  available:function(){return typeof window.Peer==='function';}
};
})();
