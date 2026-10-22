const { test } = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../node_red/lib/controller');
const BASE = 'nhom26/test-room';
const DAY = Date.parse('2026-10-17T07:00:00Z'); // 14:00 Vietnam.

test('temperature preferences restore independently and invalid saved values use defaults', () => {
  assert.deepEqual(controller.initialState(BASE, {auto:28,manual:16}).acSettings,{auto:28,manual:16});
  assert.deepEqual(controller.initialState(BASE, {auto:32,manual:'22'}).acSettings,{auto:25,manual:25});
  assert.deepEqual(controller.initialState(BASE, null).acSettings,{auto:25,manual:25});
});

function room() {
  let now = DAY;
  const state = controller.initialState(BASE);
  function send(topic, payload, retain = false) {
    return controller.step(state, { topic: topic.startsWith('_') || topic.startsWith('ui/') ? topic : BASE + '/' + topic, payload, retain }, now);
  }
  const commands = result => (result?.mqtt || []).filter(m => /\/actuator\/[^/]+\/cmd$/.test(m.topic));
  function acknowledge(result) {
    for (const msg of commands(result)) {
      const device = msg.topic.split('/').at(-2);
      send('actuator/' + device + '/state', { state: JSON.parse(msg.payload).cmd });
    }
  }
  function heartbeat() {
    const results = [send('sensor/temp_humid', { temp: state.temp ?? 29, hum: state.humidity ?? 60 }),
      send('sensor/light', { lux: state.lux ?? 100 }), send('sensor/motion', { presence: state.motion ?? 0 })];
    results.forEach(acknowledge);
    return results;
  }
  function advance(ms, keepFresh = true) {
    const end = now + ms;
    const sent = [];
    while (now < end) {
      now = Math.min(end, now + 1000);
      if (keepFresh && now % 5000 === 0) heartbeat().forEach(r => sent.push(...commands(r)));
      const r = send('_tick');
      sent.push(...commands(r));
      acknowledge(r);
    }
    return sent;
  }
  send('_broker', true);
  send('status', 'online');
  send('actuator/light/state', { state: 'OFF' });
  send('actuator/ac/state', { state: 'OFF' });
  heartbeat();
  return { state, send, commands, acknowledge, heartbeat, advance, now: () => now,
    setNow: value => { now = value; }, view: () => controller.snapshot(state, now) };
}

test('temperature settings keep the selected mode, power and separate profiles', () => {
  const r=room();
  r.send('ui/autoTemperature',28);
  assert.equal(r.state.mode,'AUTO');
  assert.equal(r.view().acTarget,28);
  r.send('ui/mode','MANUAL');
  r.send('ui/manualTemperature',22);
  assert.equal(r.state.mode,'MANUAL');
  assert.equal(r.state.outputs.ac,'OFF','Changing temperature must not turn on manual AC');
  assert.equal(r.view().acTarget,22);
  assert.equal(r.view().environment.targetTemp,22);
  r.advance(60000);
  assert.equal(r.state.mode,'MANUAL');
  r.send('ui/mode','AUTO');
  assert.equal(r.view().acTarget,28);
  r.send('ui/clock','night');
  assert.equal(r.state.mode,'SLEEP');
  r.send('ui/autoTemperature',27);
  assert.equal(r.state.mode,'SLEEP');
  assert.equal(r.view().acTarget,27);
  assert.deepEqual(r.view().acSettings,{auto:27,manual:22});
  r.send('ui/mode','MANUAL');
  assert.equal(r.view().acTarget,22);
});

test('automatic relay hysteresis follows the chosen setpoint', () => {
  const r=room();
  r.acknowledge(r.send('sensor/motion',{presence:1}));
  r.send('ui/autoTemperature',27);
  r.acknowledge(r.send('sensor/temp_humid',{temp:26.5,hum:60}));
  assert.equal(r.state.outputs.ac,'OFF');
  r.acknowledge(r.send('sensor/temp_humid',{temp:27,hum:60}));
  assert.equal(r.state.outputs.ac,'OFF');
  r.acknowledge(r.send('sensor/temp_humid',{temp:27.5,hum:60}));
  assert.equal(r.state.outputs.ac,'ON');
  r.acknowledge(r.send('sensor/temp_humid',{temp:27,hum:60}));
  assert.equal(r.state.outputs.ac,'ON');
  assert.equal(r.view().thresholds.acOn,27.5);
  assert.equal(r.view().thresholds.acOff,26.5);
});

test('temperature requests validate 16–31 integers and ignore retained commands', () => {
  const r=room();
  for(const value of [15,32,22.5,'22',null,NaN,Infinity]) {
    assert.match(r.send('ui/autoTemperature',value).error,/16 đến 31/);
    assert.equal(r.state.acSettings.auto,25);
  }
  assert.equal(r.send('controller/temperature/cmd',{profile:'auto',temperature:16},true),null);
  assert.equal(r.state.acSettings.auto,25);
  r.send('controller/temperature/cmd',{profile:'auto',temperature:16});
  const result=r.send('controller/temperature/cmd',{profile:'manual',temperature:31});
  assert.deepEqual(r.view().acSettings,{auto:16,manual:31});
  assert.equal(r.state.mode,'AUTO');
  assert.equal(JSON.parse(result.mqtt.find(m=>m.topic.endsWith('/controller/mode')).payload).targetTemp,16);
  assert.match(r.send('controller/temperature/cmd',{profile:'other',temperature:22}).error,/16 đến 31/);
});

test('presence switches on both loads in a warm room, with real feedback', () => {
  const r = room();
  assert.equal(r.view().status, 'online');
  const result = r.send('sensor/motion', { presence: 1 });
  assert.deepEqual(r.commands(result).map(m => [m.topic.split('/').at(-2), JSON.parse(m.payload).cmd]), [['light', 'ON'], ['ac', 'ON']]);
  assert.equal(r.view().light, 'OFF', 'UI must wait for the ESP32 acknowledgement');
  r.acknowledge(result);
  assert.equal(r.view().light, 'ON');
  assert.equal(r.view().pendingLight, null);
});

test('presence switches the light on regardless of lux or freshness of the LDR', () => {
  const r = room();
  r.send('sensor/light', { lux: 1000 });
  r.state.luxAt = null;
  const result = r.send('sensor/motion', { presence: 1 });
  assert.equal(r.commands(result).some(m => m.topic.includes('/light/') && JSON.parse(m.payload).cmd === 'ON'), true);
});

test('AC permission: on at 25.5, hold at target 25, stop below 24.5, hold off at 25', () => {
  const r = room();
  r.send('sensor/temp_humid', {temp:25.5,hum:60});
  r.acknowledge(r.send('sensor/motion', { presence: 1 }));
  assert.equal(r.state.outputs.ac, 'ON');
  assert.equal(r.commands(r.send('sensor/temp_humid', { temp: 25, hum: 60 })).length, 0);
  let result = r.send('sensor/temp_humid', { temp: 24.5, hum: 60 });
  assert.equal(JSON.parse(r.commands(result)[0].payload).cmd, 'OFF');
  r.acknowledge(result);
  assert.equal(r.commands(r.send('sensor/temp_humid', { temp: 25, hum: 60 })).length, 0);
  result = r.send('sensor/temp_humid', { temp: 25.5, hum: 60 });
  assert.equal(JSON.parse(r.commands(result)[0].payload).cmd, 'ON');
});

test('absence switches light off immediately while AC retains its 10 minute grace period', () => {
  const r = room();
  r.acknowledge(r.send('sensor/motion', { presence: 1 }));
  r.acknowledge(r.send('sensor/motion', { presence: 0 }));
  assert.equal(r.state.outputs.light, 'OFF');
  r.advance(599000);
  assert.equal(r.state.outputs.ac, 'ON');
  r.advance(1000);
  assert.equal(r.state.outputs.ac, 'OFF');
});

test('manual voice/request command holds until the user explicitly resumes automation', () => {
  const r = room();
  r.acknowledge(r.send('sensor/motion', { presence: 1 }));
  const result = r.send('controller/actuator/light/cmd', { cmd: 'OFF', source: 'voice' });
  r.acknowledge(result);
  assert.equal(r.state.mode, 'MANUAL');
  assert.equal(r.view().manualHold, true);
  assert.equal(r.view().manualRemaining, null);
  r.advance(901000);
  assert.equal(r.state.outputs.light, 'OFF');
  assert.equal(r.state.mode, 'MANUAL');
  r.acknowledge(r.send('ui/mode', 'AUTO'));
  assert.equal(r.state.mode, 'AUTO');
  assert.equal(r.state.outputs.light, 'ON');
});

test('auto command echo never enters MANUAL, and retained commands never execute', () => {
  const r = room();
  assert.equal(r.send('actuator/light/cmd', { cmd: 'ON', source: 'node-red' }), null);
  assert.equal(r.state.mode, 'AUTO');
  assert.equal(r.send('controller/actuator/light/cmd', { cmd: 'ON' }, true), null);
  assert.equal(r.state.manualUntil, 0);
});

test('legacy Home Assistant command enters MANUAL without duplicate forwarding', () => {
  const r = room();
  r.acknowledge(r.send('sensor/motion', {presence:1}));
  const result = r.send('actuator/light/cmd', '{"cmd":"ON"}');
  assert.equal(r.state.mode, 'MANUAL');
  assert.equal(r.commands(result).length, 0);
  assert.equal(r.state.pending.light.value, 'ON');
});

test('scheduled SLEEP uses Vietnam time and still applies the presence light rule', () => {
  const r = room();
  r.setNow(Date.parse('2026-10-17T16:00:00Z')); // 23:00 Vietnam.
  r.send('sensor/temp_humid', { temp: 29, hum: 60 });
  r.send('sensor/light', { lux: 20 });
  const result = r.send('sensor/motion', { presence: 1 });
  assert.equal(r.state.mode, 'SLEEP');
  assert.equal(r.commands(result).some(m => m.topic.includes('/light/') && JSON.parse(m.payload).cmd === 'ON'), true);
  assert.equal(r.commands(result).some(m => m.topic.includes('/ac/') && JSON.parse(m.payload).cmd === 'ON'), true);
  r.setNow(Date.parse('2026-10-17T23:00:00Z')); // Next day 06:00 Vietnam.
  r.heartbeat();
  assert.equal(r.state.mode, 'AUTO');
});

test('manual mode survives demo timers and returns to scheduled SLEEP only when selected', () => {
  const r = room();
  r.send('ui/clock', 'night');
  r.send('ui/demo', true);
  r.acknowledge(r.send('sensor/motion', {presence:1}));
  r.acknowledge(r.send('ui/light', 'OFF'));
  assert.equal(r.state.mode, 'MANUAL');
  r.advance(15000);
  assert.equal(r.state.mode, 'MANUAL');
  assert.equal(r.state.outputs.light, 'OFF');
  r.acknowledge(r.send('ui/mode', 'AUTO'));
  assert.equal(r.state.mode, 'SLEEP');
  assert.equal(r.state.outputs.light, 'ON');
});

test('manual light ON works before arriving home and remains on through absence updates', () => {
  for (const topic of ['ui/light','controller/actuator/light/cmd']) {
    const r=room();
    r.state.motionAt=null; // Presence is not required for a deliberate remote command.
    const result=r.send(topic, topic==='ui/light' ? 'ON' : {cmd:'ON',source:'voice'});
    assert.equal(result.error,null);
    assert.equal(r.view().light,'OFF','Still wait for the relay acknowledgement');
    r.acknowledge(result);
    assert.equal(r.view().light,'ON');
    r.acknowledge(r.send('sensor/motion',{presence:0}));
    r.send('ui/demo',true);
    r.advance(16000);
    assert.equal(r.state.mode,'MANUAL');
    assert.equal(r.state.outputs.light,'ON');
    r.acknowledge(r.send('sensor/motion',{presence:1}));
    r.acknowledge(r.send('sensor/motion',{presence:0}));
    assert.equal(r.state.outputs.light,'ON');
    r.acknowledge(r.send('ui/mode','AUTO'));
    assert.equal(r.state.outputs.light,'OFF','Returning to AUTO applies the absence rule');
  }
});

test('legacy direct light ON is accepted in an empty room without an automatic OFF', () => {
  const r=room();const result=r.send('actuator/light/cmd',{cmd:'ON'});
  assert.equal(result.error,null);
  assert.equal(r.state.mode,'MANUAL');
  assert.equal(r.commands(result).length,0,'The original command already went to the device');
  r.send('actuator/light/state',{state:'ON'});
  r.advance(30000);
  assert.equal(r.state.outputs.light,'ON');
});

test('explicit MANUAL selection survives long waits, demo changes and day/night changes', () => {
  const r=room();
  r.send('ui/mode','MANUAL');
  r.send('ui/demo',true);
  r.send('ui/clock','night');
  r.advance(901000);
  assert.equal(r.state.mode,'MANUAL');
  assert.equal(r.view().selectedMode,'MANUAL');
  assert.equal(r.view().manualRemaining,null);
  r.send('ui/demo',false);
  assert.equal(r.state.mode,'MANUAL');
  r.send('ui/mode','SLEEP');
  assert.equal(r.state.mode,'SLEEP');
  assert.equal(r.state.manualHold,false);
});

test('updating a running flow preserves an existing manual selection', () => {
  const r=room();
  delete r.state.manualHold;
  r.state.mode='MANUAL';
  r.state.manualUntil=r.now()+15000;
  r.send('_tick');
  r.advance(16000);
  assert.equal(r.state.mode,'MANUAL');
  assert.equal(r.state.manualUntil,0);
});

test('demo mode shortens only timers; clock override changes only the schedule', () => {
  const r = room();
  r.send('ui/demo', true);
  r.acknowledge(r.send('sensor/motion', { presence: 1 }));
  r.send('sensor/motion', { presence: 0 });
  r.advance(10000);
  assert.equal(r.state.outputs.light, 'OFF');
  assert.equal(r.state.outputs.ac, 'ON');
  r.advance(5000);
  assert.equal(r.state.outputs.ac, 'OFF');
  r.send('ui/clock', 'night');
  assert.equal(r.state.mode, 'SLEEP');
  r.send('ui/clock', 'day');
  assert.equal(r.state.mode, 'AUTO');
});

test('offline and stale sensors cannot cause actuator commands', () => {
  const r = room();
  r.advance(26000, false);
  assert.equal(r.view().status, 'stale');
  assert.equal(r.commands(r.send('ui/light', 'ON')).length, 0);
  assert.equal(r.state.mode, 'AUTO');
  r.send('status', 'offline');
  assert.equal(r.view().status, 'offline');
  assert.equal(r.commands(r.send('_tick')).length, 0);
});

test('retained telemetry is displayed but is not accepted as live data after restart', () => {
  const state = controller.initialState(BASE);
  for (const [suffix, payload] of [['_broker', true], ['status', 'online'],
    ['sensor/temp_humid', { temp: 35, hum: 60 }], ['sensor/light', { lux: 10 }], ['sensor/motion', { presence: 1 }]]) {
    const result = controller.step(state, { topic: suffix.startsWith('_') ? suffix : BASE + '/' + suffix, payload, retain: true }, DAY);
    assert.equal((result?.mqtt || []).filter(m => m.topic.endsWith('/cmd')).length, 0);
  }
  assert.equal(controller.snapshot(state, DAY).status, 'stale');
  assert.equal(state.temp, 35);
});

test('invalid inputs are logged and do not overwrite valid sensor readings', () => {
  const r = room();
  const before = r.state.temp;
  const result = r.send('sensor/temp_humid', { temp: 'NaN', hum: 120 });
  assert.equal(r.state.temp, before);
  assert.match(result.logs[0].payload, /invalid_input/);
  assert.match(r.view().alerts.join(' '), /không hợp lệ/);
  r.send('controller/mode/cmd', { mode: 'INVALID' });
  assert.equal(r.state.mode, 'AUTO');
});

test('lost acknowledgement retries at most three times and stops after feedback', () => {
  const r = room();
  const sent = [];
  sent.push(...r.commands(r.send('ui/ac', 'ON')));
  for (let i = 1; i <= 20; i++) {
    r.setNow(DAY + i * 1000);
    sent.push(...r.commands(r.send('_tick')));
  }
  assert.equal(sent.length, 3);
  assert.match(r.view().alerts.join(' '), /chưa xác nhận/);
  r.send('actuator/ac/state', { state: 'ON' });
  assert.equal(r.state.pending.ac, null);
  assert.equal(r.commands(r.send('_tick')).length, 0);
});

test('CSV escapes commas, quotes and spreadsheet formulas', () => {
  assert.equal(controller.csvCell('a,"b"'), '"a,""b"""');
  assert.equal(controller.csvCell('=1+1'), "'=1+1");
  assert.equal(controller.csvCell(-5), '-5');
});
