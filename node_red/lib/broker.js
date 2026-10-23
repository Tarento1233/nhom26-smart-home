'use strict';
const net=require('node:net');
const http=require('node:http');
const {WebSocketServer,createWebSocketStream}=require('ws');
function permitted(role,action,topic,base){
  if(typeof topic!=='string'||topic.startsWith('$')||topic.includes('\0'))return false;
  const suffix=topic.startsWith(base+'/')?topic.slice(base.length+1):null;
  if(role==='integration'&&(topic.startsWith(base.split('/')[0]+'/ha/')||topic==='homeassistant/status'))return true;
  if(suffix===null)return false;
  if(action==='subscribe'){
    if(role==='controller')return ['sensor/#','status','actuator/+/state','controller/actuator/+/cmd','actuator/+/cmd','controller/mode/cmd','controller/temperature/cmd','environment/state'].includes(suffix);
    if(role==='device')return ['actuator/+/cmd','actuator/light/cmd','actuator/ac/cmd','controller/mode','environment/cmd'].includes(suffix);
    return ['operator','integration'].includes(role);
  }
  if(role==='device')return /^(sensor\/(temp_humid|light|motion)|status|actuator\/(light|ac)\/state|environment\/state)$/.test(suffix);
  if(role==='controller')return /^(actuator\/(light|ac)\/cmd|controller\/(mode|state|status)|environment\/cmd)$/.test(suffix);
  return ['operator','integration'].includes(role)&&/^(controller\/actuator\/(light|ac)\/cmd|controller\/(mode|temperature)\/cmd)$/.test(suffix);
}
async function startBroker({config,database}){
  const {Aedes}=await import('aedes');
  const broker=await Aedes.createBroker({heartbeatInterval:60000});
  broker.authenticate=(client,username,password,done)=>{
    try{
      const person=database.verifyUser(username,password?.toString('utf8'));
      const ok=person&&['device','controller','operator','integration'].includes(person.role);
      database.audit('mqtt-login',username,!!ok);
      if(ok)client.iotRole=person.role;
      done(null,!!ok);
    }catch(error){done(error,false);}
  };
  broker.authorizePublish=(client,packet,done)=>{
    if(!client)return done();
    if(permitted(client.iotRole,'publish',packet.topic,config.baseTopic))return done();
    database.audit('mqtt-denied',client.id,false,'publish '+packet.topic);done(new Error('MQTT topic forbidden'));
  };
  broker.authorizeSubscribe=(client,sub,done)=>{
    const ok=permitted(client.iotRole,'subscribe',sub.topic,config.baseTopic);
    if(!ok)database.audit('mqtt-denied',client.id,false,'subscribe '+sub.topic);
    done(null,ok?sub:null);
  };
  broker.on('clientError',()=>{});broker.on('connectionError',()=>{});
  for(const row of database.retainedMessages())await new Promise((resolve,reject)=>broker.publish({topic:row.topic,payload:Buffer.from(row.payload),qos:row.qos,retain:true},e=>e?reject(e):resolve()));
  broker.on('publish',packet=>{if(packet.retain&&packet.topic.startsWith(config.baseTopic+'/'))database.retained(packet.topic,packet.payload,packet.qos||0);});
  const tcp=net.createServer(broker.handle),web=http.createServer((req,res)=>{res.writeHead(404);res.end();});
  const ws=new WebSocketServer({server:web,path:'/mqtt',maxPayload:1024*1024});
  ws.on('connection',socket=>{const stream=createWebSocketStream(socket);stream.on('error',()=>{});broker.handle(stream);});
  const listen=(server,port)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
  try{await listen(tcp,config.mqtt.port);await listen(web,config.mqtt.wsPort);}catch(error){tcp.close();web.close();await broker.close();throw error;}
  return {broker,close:async()=>{for(const socket of ws.clients)socket.terminate();await broker.close();await Promise.all([new Promise(r=>tcp.close(r)),new Promise(r=>web.close(r))]);ws.close();}};
}
module.exports={startBroker,permitted};
