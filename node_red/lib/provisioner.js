'use strict';
const net=require('node:net');
function telnetDecoder(socket){
  let state='data',command=0;
  return chunk=>{
    const out=[];
    for(const b of chunk){
      if(state==='data'){if(b===255)state='iac';else out.push(b);}
      else if(state==='iac'){
        if(b===255){out.push(b);state='data';}
        else if(b===250)state='sub';
        else if([251,252,253,254].includes(b)){command=b;state='option';}
        else state='data';
      }else if(state==='option'){
        if(command===253)socket.write(Buffer.from([255,[0,3,44].includes(b)?251:252,b]));
        if(command===251)socket.write(Buffer.from([255,[0,3,44].includes(b)?253:254,b]));
        state='data';
      }else if(state==='sub'){if(b===255)state='subiac';}
      else if(state==='subiac')state=b===240?'data':'sub';
    }
    return Buffer.from(out).toString('utf8');
  };
}
function startProvisioner({config,database}){
  let socket=null,stopped=false,buffer='';
  const device=config.accounts.find(a=>a.role==='device');
  function connect(){
    if(stopped||socket)return;
    socket=net.createConnection({host:'127.0.0.1',port:config.serialPort});
    const current=socket,decode=telnetDecoder(current);
    current.on('connect',()=>current.write(Buffer.from([255,253,0,255,251,0,255,253,44,255,250,44,1,0,1,194,0,255,240])));
    current.on('error',()=>{});
    current.on('close',()=>{if(socket===current)socket=null;buffer='';});
    current.on('data',data=>{
      buffer=(buffer+decode(data)).slice(-4096);
      const lines=buffer.split(/\r?\n/);buffer=lines.pop();
      for(const line of lines){
        const nonce=line.match(/^N26_PROVISION ([0-9a-f]{8,16})$/i)?.[1];
        if(nonce){current.write(`N26_AUTH ${nonce} ${config.mqtt.port} ${device.username} ${device.password}\n`);database.audit('device-provision',device.username,true,'Wokwi serial on localhost');}
      }
    });
  }
  const timer=setInterval(connect,2000);timer.unref();connect();
  return {close(){stopped=true;clearInterval(timer);socket?.destroy();}};
}
module.exports={startProvisioner,telnetDecoder};
