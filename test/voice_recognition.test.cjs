const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../voice/voice.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).join('\n');

// Run the real page code with simulated browser events, without a microphone
// or a broker connection. The fake clock makes pause/stop races reproducible.
function app({ supported = true, ready = true } = {}) {
  let now = 0, timerId = 0, recognition;
  const timers = new Map();
  const publications = [], spoken = [], cancellations = [], mqttHandlers = {};
  const setTimeout = (fn, delay) => {
    const id = ++timerId;
    timers.set(id, { fn, at: now + delay });
    return id;
  };
  function advance(ms) {
    const until = now + ms;
    for (let count = 0; count < 1000; count++) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) { now = until; return; }
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    throw new Error('Timer loop did not settle');
  }
  class Element {
    constructor() {
      this.textContent = '';
      this.disabled = false;
      this.hidden = true;
      this.handlers = {};
      this.attributes = {};
      this.children = [];
      const classes = new Set();
      this.classList = {
        add: c => classes.add(c), remove: c => classes.delete(c),
        toggle: (c, enabled) => enabled ? classes.add(c) : classes.delete(c),
      };
    }
    addEventListener(event, handler) { this.handlers[event] = handler; }
    setAttribute(key, value) { this.attributes[key] = value; }
    prepend(child) { this.children.unshift(child); }
    click() { if (!this.disabled) this.handlers.click(); }
  }
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  class Recognition {
    constructor() {
      recognition = this;
      this.running = false;
      this.startCount = this.stopCount = 0;
    }
    start() {
      if (this.startError) throw new Error('Microphone unavailable');
      assert.equal(this.running, false, 'Recognition must not be started twice');
      this.running = true;
      this.startCount++;
      setTimeout(() => this.onstart(), 0);
    }
    stop() {
      this.stopCount++;
      setTimeout(() => {
        if (this.stopResults) this.results(this.stopResults);
        this.running = false;
        this.onend();
      }, 0);
    }
    results(parts) {
      this.onresult({ results: parts.map(([text, final]) =>
        Object.assign([{ transcript: text }], { isFinal: final })) });
    }
    end() { this.running = false; this.onend(); }
    fail(error) { this.onerror({ error }); this.end(); }
  }
  const synthesis = {
    getVoices: () => [{ lang: 'vi-VN' }],
    cancel: () => cancellations.push(now),
    speak: utterance => {
      assert.equal(recognition.running, false, 'Reply must wait for the microphone to close');
      spoken.push(utterance.text);
    },
  };
  vm.runInNewContext(script, {
    document: { getElementById: node, createElement: () => new Element(), querySelectorAll: () => [] },
    window: { SpeechRecognition: supported ? Recognition : undefined, speechSynthesis: synthesis },
    speechSynthesis: synthesis,
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    mqtt: { connect: () => ({
      on: (event, handler) => { mqttHandlers[event] = handler; },
      subscribe: () => {},
      publish: (topic, payload) => publications.push({ topic, ...JSON.parse(payload) }),
    }) },
    setTimeout, clearTimeout: id => timers.delete(id),
  });
  if (ready) {
    mqttHandlers.message('nhom26/room1/controller/status', Buffer.from('online'));
    mqttHandlers.message('nhom26/room1/controller/state', Buffer.from(JSON.stringify({
      timestamp: Date.now(), mode: 'AUTO', status: 'online', manualRemaining: 0, motion:1, motionFresh:true
    })));
  }
  return {
    rec: recognition, node, publications, spoken, cancellations, advance,
    start() { node('mic').click(); advance(0); },
    mqttMessage(topic, payload) { mqttHandlers.message(topic, Buffer.from(payload)); },
  };
}

test('a short pause after "bật" does not interrupt "bật máy lạnh"', () => {
  const a = app();
  a.start();
  assert.equal(a.rec.continuous, true);
  a.rec.onspeechstart();
  a.rec.results([['bật', true]]);
  a.rec.onspeechend();
  a.advance(1800);
  assert.deepEqual(a.spoken, []);
  assert.deepEqual(a.publications, []);
  a.rec.onspeechstart();
  a.rec.results([['bật', true], ['máy', false]]);
  a.advance(3000); // Still speaking: no automatic stop or reply.
  assert.equal(a.rec.stopCount, 0);
  a.rec.results([['bật', true], ['máy lạnh', true]]);
  a.rec.onspeechend();
  a.advance(2499);
  assert.equal(a.publications.length, 0);
  a.advance(1);
  assert.deepEqual(a.publications, [{ topic: 'nhom26/room1/controller/actuator/ac/cmd', cmd: 'ON', source: 'voice' }]);
  assert.deepEqual(a.spoken, ['Đã gửi lệnh bật máy lạnh']);
  assert.equal(a.node('heard').textContent, '“bật máy lạnh”');
  a.advance(30000);
  assert.equal(a.publications.length, 1, 'No duplicate execution from old timers');
});

test('browser ending early preserves segments and allows the rest of the command', () => {
  const a = app();
  a.start();
  a.rec.results([['bật', true]]);
  a.rec.end();
  a.advance(150);
  assert.equal(a.rec.startCount, 2);
  assert.equal(a.spoken.length, 0);
  a.rec.onspeechstart();
  a.rec.results([['đèn', true]]);
  a.rec.onspeechend();
  a.advance(2500);
  assert.deepEqual(a.publications, [{ topic: 'nhom26/room1/controller/actuator/light/cmd', cmd: 'ON', source: 'voice' }]);
  assert.equal(a.node('heard').textContent, '“bật đèn”');
});

test('voice can request light ON before the user arrives in an empty room', () => {
  const a=app();
  a.mqttMessage('nhom26/room1/controller/state', JSON.stringify({timestamp:Date.now(),mode:'AUTO',status:'online',motion:0,motionFresh:true}));
  a.start();a.rec.results([['bật đèn',true]]);a.rec.onspeechend();a.advance(2500);
  assert.deepEqual(a.publications, [{topic:'nhom26/room1/controller/actuator/light/cmd',cmd:'ON',source:'voice'}]);
  assert.equal(a.node('reply').textContent,'Đã gửi lệnh bật đèn');
});

test('voice manual status explains the hold without displaying an expiry countdown', () => {
  const a=app();
  a.mqttMessage('nhom26/room1/controller/state', JSON.stringify({timestamp:Date.now(),mode:'MANUAL',status:'online',manualHold:true,manualRemaining:null,motion:0,motionFresh:true}));
  assert.match(a.node('manualRemaining').textContent,/chọn Tự động/);
  assert.doesNotMatch(a.node('manualRemaining').textContent,/giây/);
});

test('voice recognizes the same Tự điều khiển name used by the interface', () => {
  const a=app();
  a.start();a.rec.results([['chế độ tự điều khiển',true]]);a.rec.onspeechend();a.advance(2500);
  assert.deepEqual(a.publications,[{topic:'nhom26/room1/controller/mode/cmd',mode:'MANUAL',source:'voice'}]);
});

test('manual finish waits for the corrected final result returned by stop()', () => {
  const a = app();
  a.start();
  a.rec.results([['bật đèn', false]]);
  a.rec.stopResults = [['tắt đèn', true]];
  a.node('mic').click();
  assert.equal(a.spoken.length, 0);
  assert.equal(a.publications.length, 0);
  a.advance(0);
  assert.deepEqual(a.publications, [{ topic: 'nhom26/room1/controller/actuator/light/cmd', cmd: 'OFF', source: 'voice' }]);
  assert.deepEqual(a.spoken, ['Đã gửi lệnh tắt đèn']);
  assert.equal(a.node('mic').attributes['aria-pressed'], 'false');
});

test('unknown and incomplete commands give quiet visual feedback', () => {
  for (const text of ['xin chào', 'bật']) {
    const a = app();
    a.start();
    a.rec.results([[text, true]]);
    a.rec.onspeechend();
    a.advance(2500);
    assert.equal(a.publications.length, 0);
    assert.equal(a.spoken.length, 0);
    assert.ok(a.node('reply').textContent.length > 0);
  }
});

test('interim-only text and an empty recording cannot execute a command', () => {
  for (const parts of [[], [['bật đèn', false]]]) {
    const a = app();
    a.start();
    if (parts.length) a.rec.results(parts);
    a.node('mic').click();
    a.advance(0);
    assert.equal(a.publications.length, 0);
    assert.equal(a.spoken.length, 0);
    assert.equal(a.node('mic').disabled, false);
  }
});

test('recognition error cancels pending commands and the next attempt still works', () => {
  const a = app();
  a.start();
  a.rec.results([['bật đèn', true]]);
  a.rec.fail('network');
  a.advance(30000);
  assert.equal(a.publications.length, 0);
  assert.equal(a.rec.startCount, 1);
  assert.match(a.node('heard').textContent, /network/);
  a.start();
  a.rec.results([['bật đèn', true]]);
  a.node('mic').click();
  a.advance(0);
  assert.equal(a.publications.length, 1);
});

test('sensor questions still read the received values after capture closes', () => {
  const a = app();
  a.mqttMessage('nhom26/room1/sensor/temp_humid', '{"temp":35,"hum":70}');
  a.start();
  a.rec.results([['nhiệt độ bao nhiêu', true]]);
  a.rec.onspeechend();
  a.advance(2500);
  assert.equal(a.publications.length, 0);
  assert.deepEqual(a.spoken, ['Nhiệt độ phòng là 35 độ C, độ ẩm 70 phần trăm']);
  assert.ok(a.cancellations.length > 0);
});

test('recording has a deadline and unsupported browsers keep the mic disabled', () => {
  const a = app();
  a.start();
  a.advance(20000);
  assert.equal(a.rec.stopCount, 1);
  assert.equal(a.node('mic').disabled, false);
  assert.equal(a.spoken.length, 0);
  const unsupported = app({ supported: false });
  assert.equal(unsupported.node('mic').disabled, true);
  assert.equal(unsupported.node('unsupported').hidden, false);
});

test('temperature from the automatic model is identified as simulated in speech and on screen', () => {
  const a=app();
  a.mqttMessage('nhom26/room1/sensor/temp_humid','{"temp":27,"hum":55,"source":"model"}');
  a.start();a.rec.results([['nhiệt độ bao nhiêu',true]]);a.node('mic').click();a.advance(0);
  assert.match(a.spoken[0],/Nhiệt độ mô phỏng là 27/);
  assert.match(a.node('temperatureSource').textContent,/mô hình phòng/);
});

test('voice never publishes a device command while Node-RED is unavailable', () => {
  const a = app({ ready: false });
  a.start();
  a.rec.results([['bật đèn', true]]);
  a.node('mic').click();
  a.advance(0);
  assert.equal(a.publications.length, 0);
  assert.equal(a.spoken.length, 0);
  assert.match(a.node('reply').textContent, /Node-RED chưa sẵn sàng/);
});

test('voice mode command goes through the Node-RED mode request topic', () => {
  const a = app();
  a.start();
  a.rec.results([['chuyển chế độ tự động', true]]);
  a.node('mic').click();
  a.advance(0);
  assert.deepEqual(a.publications, [{ topic: 'nhom26/room1/controller/mode/cmd', mode: 'AUTO', source: 'voice' }]);
});

test('spoken temperature settings use the selected profile and explicit AUTO does not switch modes', () => {
  for (const [phrase,mode,profile] of [['máy lạnh 22 độ','MANUAL','manual'],['đặt nhiệt độ tự động 28 độ','MANUAL','auto'],['máy lạnh 16 độ','AUTO','auto']]) {
    const a=app();
    a.mqttMessage('nhom26/room1/controller/state',JSON.stringify({timestamp:Date.now(),mode,status:'online',acTarget:25}));
    a.start();a.rec.results([[phrase,true]]);a.node('mic').click();a.advance(0);
    assert.equal(a.publications.length,1);
    assert.equal(a.publications[0].topic,'nhom26/room1/controller/temperature/cmd');
    assert.equal(a.publications[0].profile,profile);
    assert.match(a.spoken[0],/mức đặt/);
  }
});

test('invalid spoken temperatures do not publish and buttons follow confirmed limits', () => {
  const a=app();
  for(const phrase of ['máy lạnh 15 độ','máy lạnh 32 độ','nhiệt độ 22,5 độ']) {
    a.start();a.rec.results([[phrase,true]]);a.node('mic').click();a.advance(0);
    assert.equal(a.publications.length,0);
    assert.match(a.node('reply').textContent,/16 đến 31/);
  }
  a.mqttMessage('nhom26/room1/controller/state',JSON.stringify({timestamp:Date.now(),mode:'MANUAL',status:'online',acTarget:16}));
  assert.equal(a.node('targetDown').disabled,true);
  a.node('targetUp').click();
  assert.equal(a.publications[0].temperature,17);
  assert.equal(a.publications[0].profile,'manual');
});
