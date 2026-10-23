'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {equal}=require('./database');
const COOKIE='n26_session';
function cookie(req){const raw=(req.headers.cookie||'').match(/(?:^|;\s*)n26_session=([A-Za-z0-9_-]+)/);return raw?.[1]||'';}
function sameOrigin(req){if(!req.headers.origin)return true;try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}}
function createWebAuth({config,database}) {
  const attempts=new Map(),sockets=new Set();
  function user(req){
    const header=req.headers.authorization||'';
    if(header.startsWith('Bearer '))return equal(header.slice(7),config.serviceToken)?{username:'local-service',role:'controller'}:null;
    if(header.startsWith('Basic ')){
      try{const decoded=Buffer.from(header.slice(6),'base64').toString('utf8'),colon=decoded.indexOf(':');const u=database.verifyUser(decoded.slice(0,colon),decoded.slice(colon+1));return u?.role==='owner'?u:null;}catch{return null;}
    }
    return database.sessionUser(cookie(req));
  }
  function middleware(req,res,next){
    res.setHeader('Cache-Control','no-store');
    const person=user(req);
    if(!person){
      res.setHeader('Cache-Control','no-store');
      if(req.path.startsWith('/api/'))return res.status(401).json({error:'Cần đăng nhập để điều khiển căn phòng'});
      return res.redirect('/login');
    }
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!sameOrigin(req))return res.status(403).json({error:'Nguồn yêu cầu không hợp lệ'});
    req.iotUser=person;next();
  }
  function routes(app){
    app.get('/login',(req,res)=>{res.setHeader('Cache-Control','no-store');res.type('html').send(fs.readFileSync(path.join(__dirname,'..','login.html'),'utf8'));});
    app.post('/login',(req,res)=>{
      if(!sameOrigin(req))return res.status(403).json({error:'Nguồn yêu cầu không hợp lệ'});
      const ip=req.ip,now=Date.now(),a=attempts.get(ip);
      if(a&&now-a.since<15*60000&&a.count>=10)return res.status(429).json({error:'Đã thử sai nhiều lần. Thử lại sau 15 phút.'});
      const username=typeof req.body?.username==='string'?req.body.username.trim():'',password=req.body?.password;
      const person=database.verifyUser(username,password);
      const accepted=person?.role==='owner';database.audit('web-login',username,accepted);
      if(!accepted){attempts.set(ip,{since:a&&now-a.since<15*60000?a.since:now,count:a&&now-a.since<15*60000?a.count+1:1});return res.status(401).json({error:'Tên đăng nhập hoặc mật khẩu chưa đúng.'});}
      attempts.delete(ip);const token=database.createSession(username);
      res.setHeader('Cache-Control','no-store');res.setHeader('Set-Cookie',`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${req.secure?'; Secure':''}`);
      res.json({ok:true,redirect:'/dashboard/room'});
    });
    app.post('/logout',middleware,(req,res)=>{
      const token=cookie(req);database.deleteSession(token);
      for(const socket of sockets)if(cookie(socket.request)===token)socket.disconnect(true);
      res.setHeader('Set-Cookie',`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);res.redirect('/login');
    });
    app.get('/api/mqtt-config.js',middleware,(req,res)=>{
      const account=config.accounts.find(a=>a.role==='operator');
      const hostname=new URL('http://'+req.headers.host).hostname;
      if(!['localhost','127.0.0.1','[::1]'].includes(hostname))return res.status(400).end();
      const data={url:`ws://${hostname}:${config.mqtt.wsPort}/mqtt`,base:config.baseTopic,username:account.username,password:account.password};
      res.setHeader('Cache-Control','no-store');res.type('application/javascript').send('window.IOT_MQTT_CONFIG='+JSON.stringify(data).replace(/</g,'\\u003c')+';');
    });
    app.get('/api/database',middleware,(req,res)=>{res.setHeader('Cache-Control','no-store');res.json(database.summary());});
  }
  function ioMiddleware(socket,next){
    if(!user(socket.request)||!sameOrigin(socket.request))return next(new Error('Cần đăng nhập'));
    sockets.add(socket);
    socket.use((packet,done)=>{if(!user(socket.request)){socket.disconnect(true);return done(new Error('Phiên đăng nhập đã hết hạn'));}done();});
    const timer=setInterval(()=>{if(!user(socket.request))socket.disconnect(true);},30000);timer.unref();
    socket.on('disconnect',()=>{clearInterval(timer);sockets.delete(socket);});next();
  }
  return {middleware,routes,ioMiddleware,user};
}
module.exports={createWebAuth,cookie,sameOrigin};
