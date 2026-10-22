const {test} = require('node:test');
const assert = require('node:assert/strict');
const env = require('../node_red/lib/environment');
const controller = require('../node_red/lib/controller');
const BASE = 'nhom26/test-thermal';
const DAY = Date.parse('2026-10-19T07:00:00Z');

function loopback() {
  const state = controller.initialState(BASE);
  let now = DAY, enabled = false, seq = 0, data = {temp:29,hum:60,presence:0};
  const relayChanges = [], frames = [];
  function send(topic, payload, retain=false) {
    return controller.step(state, {topic:topic.startsWith('_') || topic.startsWith('ui/') ? topic : BASE+'/'+topic,payload,retain}, now);
  }
  function deliver(result, depth=0) {
    assert.ok(depth < 15, 'No MQTT feedback loop');
    for (const msg of result?.mqtt || []) {
      if (/\/actuator\/\w+\/cmd$/.test(msg.topic)) {
        const device = msg.topic.split('/').at(-2), value = JSON.parse(msg.payload).cmd;
        relayChanges.push({device,value,temp:state.temp,at:now});
        deliver(send(`actuator/${device}/state`, {state:value}), depth+1);
      } else if (msg.topic.endsWith('/environment/cmd')) {
        frames.push(msg.payload);
        if (msg.payload === 'SENSOR') { enabled=false;seq=0;data={temp:29,hum:60,presence:0}; }
        else { const p=msg.payload.split(' ');enabled=true;seq=+p[1];data={temp:+p[2],hum:+p[3],presence:+p[4]}; }
        deliver(send('environment/state',{protocol:1,enabled,seq}), depth+1);
        deliver(send('sensor/temp_humid',{temp:data.temp,hum:data.hum,source:enabled?'model':'wokwi'}), depth+1);
        deliver(send('sensor/motion',{presence:data.presence}), depth+1);
      }
    }
  }
  function heartbeat() {
    for (const [topic,payload] of [['status','online'],['environment/state',{protocol:1,enabled,seq}],
      ['sensor/temp_humid',{temp:data.temp,hum:data.hum}],['sensor/light',{lux:100}],['sensor/motion',{presence:data.presence}]]) deliver(send(topic,payload));
  }
  function advance(seconds) {
    for(let i=0;i<seconds;i++) { now+=1000; if(i%5===0) heartbeat(); deliver(send('_tick')); }
  }
  send('_broker',true);send('actuator/light/state',{state:'OFF'});send('actuator/ac/state',{state:'OFF'});heartbeat();
  return {state,send,deliver,advance,relayChanges,frames,setNow:value=>{now=value;},now:()=>now};
}

test('physics changes gradually and stays bounded during long manual operation', () => {
  assert.ok(env.physics(29,60,'ON',1,true).temp < 29);
  assert.ok(env.physics(25,50,'OFF',1,true).temp > 25);
  assert.equal(env.physics(29,60,'ON',-1,true).temp,29);
  let a={temp:30,humidity:60}, b={temp:25,humidity:40};
  for(let i=0;i<10000;i++) { a=env.physics(a.temp,a.humidity,'ON',1,true);b=env.physics(b.temp,b.humidity,'OFF',1,true); }
  assert.ok(a.temp>=18 && b.temp<=40 && a.humidity>=30 && b.humidity<=80);
});

test('inverter room cools gradually and holds 25 without relay cycling, using actual feedback', () => {
  const r=loopback();r.deliver(r.send('ui/environment',true));r.advance(180);
  assert.ok(Math.abs(r.state.temp-25)<=0.1);
  assert.equal(r.state.environment.direction,'holding');
  assert.ok(r.state.environment.coolingPercent>0 && r.state.environment.coolingPercent<50);
  r.advance(900);
  const transitions=r.relayChanges.filter(m=>m.device==='ac');
  assert.deepEqual(transitions.map(m=>m.value),['ON']);
  assert.ok(Math.abs(r.state.temp-25)<=0.1,'Stable after another 15 simulated minutes');
  assert.equal(r.state.mode,'AUTO');
  assert.equal(r.state.environment.active,true);
});

test('inverter reduces output near setpoint, rejects heat when disabled and recovers from a cool start', () => {
  assert.equal(env.coolingLevel(30,'ON',true),1);
  assert.ok(env.coolingLevel(26,'ON',true)>env.coolingLevel(25,'ON',true));
  assert.equal(env.coolingLevel(30,'OFF',true),0);
  assert.ok(env.physics(24,55,'ON',1,true).temp>24);
  let t=24;
  for(let i=0;i<180;i++) t=env.physics(t,55,'ON',1,true).temp;
  assert.ok(Math.abs(t-25)<0.01);
});

test('an unacknowledged AC ON request cannot cool the simulated room', () => {
  const r=loopback();const result=r.send('ui/environment',true);
  const frame=result.mqtt.find(m=>m.topic.endsWith('/environment/cmd'));
  const seq=+frame.payload.split(' ')[1];
  r.send('environment/state',{protocol:1,enabled:true,seq});
  r.advance(0);r.setNow(r.now()+1000);r.send('_tick');
  assert.equal(r.state.outputs.ac,'OFF');
  assert.ok(r.state.environment.temp>=30);
  assert.equal(r.state.environment.coolingPercent,0);
});

test('starting waits for the ESP32 frame echo instead of fabricating live sensor values', () => {
  const r=loopback();const result=r.send('ui/environment',true);
  assert.equal(r.state.temp,29);
  assert.equal(r.state.environment.active,false);
  assert.equal(r.state.environment.wanted,true);
  assert.ok(result.mqtt.some(m=>m.topic.endsWith('/environment/cmd') && m.payload.startsWith('SIM ')));
  assert.equal(result.mqtt.some(m=>m.topic.includes('/sensor/')),false);
  r.deliver(result);assert.equal(r.state.temp,30);assert.equal(r.state.environment.active,true);
});

test('absence controls still switch both loads off while the thermal model continues', () => {
  const r=loopback();r.deliver(r.send('ui/environment',true));
  assert.equal(r.state.outputs.ac,'ON');
  r.deliver(r.send('ui/occupancy',0));
  assert.equal(r.state.outputs.light,'OFF','Light turns off in the same acknowledged occupancy frame');
  r.advance(20);
  assert.equal(r.state.motion,0);assert.equal(r.state.outputs.ac,'OFF');assert.equal(r.state.outputs.light,'OFF');
  assert.equal(r.state.environment.wanted,true);
});

test('manual commands in the automatic room survive absence until AUTO is selected again', () => {
  const r=loopback();r.deliver(r.send('ui/environment',true));
  r.deliver(r.send('ui/mode','MANUAL'));
  r.deliver(r.send('ui/occupancy',0));
  r.advance(20);
  assert.equal(r.state.mode,'MANUAL');
  assert.equal(r.state.motion,0);
  assert.equal(r.state.outputs.light,'ON');
  assert.equal(r.state.outputs.ac,'ON');
  r.deliver(r.send('ui/mode','AUTO'));
  assert.equal(r.state.outputs.light,'OFF');
  assert.equal(r.state.outputs.ac,'OFF');
});

test('stop returns to the Wokwi sensor only after acknowledgement', () => {
  const r=loopback();r.deliver(r.send('ui/environment',true));r.advance(5);
  const result=r.send('ui/environment',false);
  assert.equal(r.state.environment.active,true);
  r.deliver(result);
  assert.equal(r.state.environment.active,false);assert.equal(r.state.temp,29);
  assert.equal(r.state.environment.wanted,false);
});

test('offline pauses model time, sends no frame and does not catch up after a long pause', () => {
  const r=loopback();r.deliver(r.send('ui/environment',true));r.advance(4);
  r.send('status','offline');const previous=r.state.environment.temp;
  r.setNow(r.now()+600000);
  const result=r.send('_tick');
  assert.equal(r.state.environment.temp,previous);
  assert.equal(result.mqtt.some(m=>m.topic.endsWith('/environment/cmd')),false);
  r.send('status','online');r.send('sensor/temp_humid',{temp:r.state.temp,hum:60});
  r.send('environment/state',{protocol:1,enabled:true,seq:r.state.environment.seq});
  assert.equal(r.state.environment.temp,previous);
});

test('retained metadata cannot acknowledge a pending command; each retry burst has three sends', () => {
  const e=env.initialState();env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY,false);env.start(e,DAY);
  const first=env.tick(e,DAY,true,'OFF'), seq=e.seq;
  env.acknowledge(e,{protocol:1,enabled:true,seq},DAY,true);
  assert.ok(e.pending);
  assert.equal(e.active,false,'Retained metadata cannot make the model look active');
  assert.equal(env.tick(e,DAY+env.RETRY_MS,true,'OFF'),first);
  env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY+env.RETRY_MS*2,false);
  assert.equal(env.tick(e,DAY+env.RETRY_MS*2,true,'OFF'),first);
  env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY+env.RETRY_MS*3,false);
  assert.equal(env.tick(e,DAY+env.RETRY_MS*3,true,'OFF'),null);
  assert.match(e.error,/xác nhận/);
  env.acknowledge(e,{protocol:1,enabled:true,seq},DAY+env.RETRY_MS*3+1000,false);
  assert.equal(e.pending,null);assert.equal(e.error,'');
});

test('a slow simulator acknowledgement after twelve seconds does not latch an error', () => {
  const e=env.initialState();env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY,false);env.start(e,DAY);
  env.tick(e,DAY,true,'OFF');
  const seq=e.seq;
  env.tick(e,DAY+10000,true,'OFF');
  assert.equal(e.error,'');
  env.acknowledge(e,{protocol:1,enabled:true,seq},DAY+12000,false);
  assert.equal(e.pending,null);assert.equal(e.error,'');assert.equal(e.active,true);
});

test('a fresh device report after a failed burst automatically retries without resetting the room', () => {
  const e=env.initialState();env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY,false);env.start(e,DAY);
  e.temp=27;e.presence=0;
  env.tick(e,DAY,true,'OFF');
  const seq=e.seq;
  for(let i=1;i<=3;i++) {
    env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY+i*env.RETRY_MS,false);
    env.tick(e,DAY+i*env.RETRY_MS,true,'OFF');
  }
  const resume=DAY+env.RETRY_MS*3+env.RECOVERY_MS;
  assert.ok(e.error);
  env.acknowledge(e,{protocol:1,enabled:false,seq:0},resume,false);
  const frame=env.tick(e,resume,true,'OFF');
  assert.ok(frame.startsWith('SIM '));assert.notEqual(e.seq,seq);
  assert.equal(e.error,'');assert.equal(e.temp,27);assert.equal(e.presence,0);
});

test('retained reports and stale devices cannot restart an exhausted retry burst', () => {
  const e=env.initialState();env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY,false);env.start(e,DAY);
  env.tick(e,DAY,true,'OFF');
  for(let i=1;i<=3;i++) {
    env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY+i*env.RETRY_MS,false);
    env.tick(e,DAY+i*env.RETRY_MS,true,'OFF');
  }
  const later=DAY+env.RETRY_MS*3+env.RECOVERY_MS+1;
  env.acknowledge(e,{protocol:1,enabled:true,seq:e.seq},later,true);
  assert.equal(env.tick(e,later,true,'OFF'),null);
  assert.ok(e.error);assert.ok(e.pending);assert.equal(e.active,false);
  assert.equal(env.tick(e,later+30000,true,'OFF'),null);
  assert.equal(env.snapshot(e,later+30000,true).phase,'paused');
});

test('reconnection automatically replaces a stale failed frame with a new live request', () => {
  const e=env.initialState();env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY,false);env.start(e,DAY);
  env.tick(e,DAY,true,'OFF');const oldSeq=e.seq;
  for(let i=1;i<=3;i++) {
    env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY+i*env.RETRY_MS,false);
    env.tick(e,DAY+i*env.RETRY_MS,true,'OFF');
  }
  assert.ok(e.error);
  assert.equal(env.tick(e,DAY+100000,false,'OFF'),null);
  env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY+100001,false);
  const frame=env.tick(e,DAY+100001,true,'OFF');
  assert.ok(frame.startsWith('SIM '));assert.notEqual(e.seq,oldSeq);assert.equal(e.error,'');
  env.acknowledge(e,{protocol:1,enabled:true,seq:e.seq},DAY+100002,false);
  assert.equal(env.snapshot(e,DAY+100002,true).phase,'running');
});

test('a fresh simulator reset resumes the requested model instead of staying on manual sensors', () => {
  const e=env.initialState();env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY,false);env.start(e,DAY);
  env.tick(e,DAY,true,'OFF');env.acknowledge(e,{protocol:1,enabled:true,seq:e.seq},DAY+1,false);
  e.temp=26;e.presence=0;
  env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY+2,false);
  const frame=env.tick(e,DAY+2,true,'OFF');
  assert.ok(frame.endsWith('26.0 60 0'));assert.equal(e.error,'');assert.equal(e.wanted,true);
});

test('retry keeps the selected temperature, occupancy and manual mode', () => {
  const r=loopback();r.deliver(r.send('ui/environment',true));r.advance(8);
  r.deliver(r.send('ui/occupancy',0));r.deliver(r.send('ui/mode','MANUAL'));
  r.send('ui/clock','night');r.send('ui/demo',false);
  const temp=r.state.environment.temp;
  r.send('ui/environment',true);
  assert.equal(r.state.environment.temp,temp);assert.equal(r.state.environment.presence,0);
  assert.equal(r.state.mode,'MANUAL');assert.equal(r.state.demo,false);assert.equal(r.state.clock,'night');
});

test('stop cancels a failed start and a late ACK cannot restart the experience', () => {
  const e=env.initialState();env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY,false);env.start(e,DAY);
  env.tick(e,DAY,true,'OFF');const seq=e.seq;
  for(let i=1;i<=3;i++) {
    env.acknowledge(e,{protocol:1,enabled:false,seq:0},DAY+i*env.RETRY_MS,false);
    env.tick(e,DAY+i*env.RETRY_MS,true,'OFF');
  }
  env.stop(e);
  assert.equal(e.error,'');assert.equal(e.wanted,false);
  assert.equal(env.tick(e,DAY+31000,false,'OFF'),null);
  env.acknowledge(e,{protocol:1,enabled:true,seq},DAY+32000,false);
  assert.equal(env.tick(e,DAY+32000,true,'OFF'),'SENSOR');
  assert.equal(e.wanted,false);
});

test('old firmware and retained capability data cannot start the model', () => {
  const s=controller.initialState(BASE);
  const send=(topic,payload,retain=false)=>controller.step(s,{topic:topic.startsWith('_')||topic.startsWith('ui/')?topic:BASE+'/'+topic,payload,retain},DAY);
  send('_broker',true);send('status','online');send('sensor/temp_humid',{temp:29,hum:60});
  assert.match(send('ui/environment',true).error,/firmware mới/);
  send('environment/state',{protocol:1,enabled:false,seq:0},true);
  assert.match(send('ui/environment',true).error,/firmware mới/);
  assert.equal(s.environment.wanted,false);
});
