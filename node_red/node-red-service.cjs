'use strict';
const http=require('node:http');
const express=require('express');
const RED=require('node-red');
const path=require('node:path');
const {getServices}=require('./lib/services');
const {createWebAuth}=require('./lib/web-auth');
const {startBroker}=require('./lib/broker');
const {startProvisioner}=require('./lib/provisioner');

async function main(){
  const services=getServices(),auth=createWebAuth(services);services.auth=auth;
  const settings={...require('./settings'),userDir:__dirname};
  const broker=await startBroker(services);
  const app=express(),server=http.createServer(app);
  app.disable('x-powered-by');
  app.use(express.json({limit:'2mb'}));app.use(express.urlencoded({extended:false,limit:'8kb'}));
  let ready=false;
  app.get('/healthz',(req,res)=>res.status(ready?200:503).json({service:'nhom26-smart-home',baseTopic:services.config.baseTopic,ready}));
  auth.routes(app);app.use(auth.middleware);
  RED.init(server,settings);
  RED.events.on('runtime-event',event=>{if(event.id==='runtime-state'&&['start','stop'].includes(event.payload?.state))ready=true;});
  RED.events.on('flows:starting',()=>RED.nodes.addCredentials('n26-broker',{user:'${IOT_MQTT_USERNAME}',password:'${IOT_MQTT_PASSWORD}'}));
  app.use(settings.httpAdminRoot,RED.httpAdmin);app.use(settings.httpNodeRoot,RED.httpNode);
  app.use('/voice',express.static(path.join(__dirname,'..','voice')));
  app.use((error,req,res,next)=>{if(!res.headersSent)res.status(400).json({error:'Yêu cầu không hợp lệ'});});
  server.prependListener('upgrade',(req,socket)=>{if(!auth.user(req)){socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');socket.destroy();}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(settings.uiPort,'127.0.0.1',resolve);});
  await RED.start();
  const provisioner=process.env.IOT_DISABLE_PROVISIONER==='1'?null:startProvisioner(services);
  console.log(`Nhà thông minh: http://localhost:${settings.uiPort}/dashboard/room`);
  console.log(`MQTT có xác thực: 127.0.0.1:${services.config.mqtt.port}. Lịch sử: SQLite.`);
  let closing=false;
  async function close(){if(closing)return;closing=true;provisioner?.close();await RED.stop();await broker.close();server.close();services.database.close();process.exit(0);}
  process.on('SIGINT',close);process.on('SIGTERM',close);
}
main().catch(error=>{console.error('Không khởi động được:',error.message);process.exit(1);});
