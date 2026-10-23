'use strict';
const environment = require('./environment');

const FRESH_MS = 25000;
const RETRY_MS = 5000;
const NORMAL = { lightTimeout: 0, acTimeout: 600000 };
const DEMO = { lightTimeout: 0, acTimeout: 15000 };
const MIN_TARGET = 16, MAX_TARGET = 31;
const validTarget = value => Number.isInteger(value) && value >= MIN_TARGET && value <= MAX_TARGET;
const temperatureSettings = (saved = {}) => ({
  auto: validTarget(saved?.auto) ? saved.auto : environment.TARGET,
  manual: validTarget(saved?.manual) ? saved.manual : environment.TARGET
});
const targetTemp = s => s.acSettings[s.mode === 'MANUAL' ? 'manual' : 'auto'];

function initialState(base = 'nhom26/room1', savedSettings) {
  if (!/^[A-Za-z0-9_/-]+$/.test(base) || base.endsWith('/')) throw new Error('Invalid MQTT base topic');
  return {
    base, brokerOnline: false, espStatus: 'unknown', lastSeen: null,
    temp: null, humidity: null, lux: null, motion: null,
    tempAt: null, luxAt: null, motionAt: null, lastMotionAt: null, noMotionSince: null,
    outputs: { light: null, ac: null }, pending: { light: null, ac: null },
    mode: 'AUTO', manualHold: false, manualUntil: 0, forcedSleep: false, demo: false, clock: 'real',
    acSettings: temperatureSettings(savedSettings),
    lastModePublished: null, lastSnapshotAt: null, availability: 'offline',
    lastAction: 'Chờ dữ liệu ESP32', warning: '', ioError: '', environment:environment.initialState()
  };
}

const limits = s => s.demo ? DEMO : NORMAL;
const fresh = (at, now) => at !== null && now >= at && now - at <= FRESH_MS;
const live = (s, now) => s.brokerOnline && s.espStatus === 'online' && fresh(s.lastSeen, now);
function hour(s, now) {
  if (s.clock === 'night') return 23;
  if (s.clock === 'day') return 14;
  return new Date(now + 7 * 3600000).getUTCHours();
}
function effectiveMode(s, now) {
  if (s.manualHold) return 'MANUAL';
  const h = hour(s, now);
  return s.forcedSleep || h >= 23 || h < 6 ? 'SLEEP' : 'AUTO';
}
function occupied(s, timeout, now) {
  return fresh(s.motionAt, now) && (s.motion === 1 ||
    (s.lastMotionAt !== null && s.noMotionSince !== null && now - s.noMotionSince < timeout));
}
function status(s, now) {
  if (!s.brokerOnline) return 'broker_offline';
  if (s.espStatus !== 'online') return 'offline';
  return fresh(s.lastSeen, now) ? 'online' : 'stale';
}
function snapshot(s, now) {
  s.environment ||= environment.initialState();
  s.acSettings = temperatureSettings(s.acSettings);
  const target = targetTemp(s);
  const timing = limits(s);
  const alerts = [];
  const deviceStatus = status(s, now);
  if (deviceStatus === 'broker_offline') alerts.push('Mất kết nối broker MQTT');
  else if (deviceStatus === 'offline') alerts.push('ESP32 đang offline');
  else if (deviceStatus === 'stale') alerts.push('Chưa có dữ liệu ESP32 mới. Giữ mô phỏng Wokwi hiển thị và đang chạy.');
  if (deviceStatus === 'online') {
    if (!fresh(s.tempAt, now)) alerts.push('Dữ liệu DHT22 đã cũ; tạm dừng rule máy lạnh');
    if (!fresh(s.motionAt, now)) alerts.push('Dữ liệu PIR đã cũ; tạm dừng rule tự động');
  }
  if (s.temp !== null && s.temp >= 40) alerts.push('Nhiệt độ cao: từ 40°C');
  if (s.warning) alerts.push(s.warning);
  if (s.ioError) alerts.push(s.ioError);
  if (s.environment.error) alerts.push(s.environment.error);
  return {
    timestamp: now, baseTopic: s.base, status: deviceStatus, brokerOnline: s.brokerOnline,
    mode: s.mode, selectedMode: s.manualHold ? 'MANUAL' : s.forcedSleep ? 'SLEEP' : 'AUTO',
    manualHold: !!s.manualHold, manualRemaining: s.manualHold ? null : 0,
    temp: s.temp, humidity: s.humidity, lux: s.lux, motion: s.motion,
    light: s.outputs.light, ac: s.outputs.ac,
    pendingLight: s.pending.light?.value ?? null, pendingAc: s.pending.ac?.value ?? null,
    tempFresh: fresh(s.tempAt, now), luxFresh: fresh(s.luxAt, now), motionFresh: fresh(s.motionAt, now),
    lastSeen: s.lastSeen, lastMotionAt: s.lastMotionAt,
    lightOffIn: s.noMotionSince === null ? null : Math.max(0, Math.ceil((timing.lightTimeout - (now - s.noMotionSince)) / 1000)),
    acOffIn: s.noMotionSince === null ? null : Math.max(0, Math.ceil((timing.acTimeout - (now - s.noMotionSince)) / 1000)),
    demo: s.demo, clock: s.clock, hour: hour(s, now),
    acSettings: { ...s.acSettings }, acTarget: target, acTargetMin:MIN_TARGET, acTargetMax:MAX_TARGET,
    environment:environment.snapshot(s.environment, now, live(s, now), target),
    timing, alerts, lastAction: s.lastAction,
    thresholds: { lightPresenceOnly:false, autoLightPresenceOnly:true, manualAllowsEmptyRoom:true, acTarget:target, acOn:s.acSettings.auto + 0.5, acOff:s.acSettings.auto - 0.5 }
  };
}
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function csvRow(s, now, event, detail) {
  return [new Date(now).toISOString(), event, s.mode, s.temp, s.humidity, s.lux,
    s.motion, s.outputs.light, s.outputs.ac, detail].map(csvCell).join(',') + '\n';
}
function payloadObject(payload) {
  if (typeof payload === 'string') return JSON.parse(payload);
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload;
  throw new Error('Payload phải là JSON object');
}
const finiteRange = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
function command(payload) {
  if (payload === 'ON' || payload === 'OFF') return { cmd: payload };
  const data = payloadObject(payload);
  if (data.cmd !== 'ON' && data.cmd !== 'OFF') throw new Error('Lệnh phải là ON hoặc OFF');
  return data;
}

function step(s, msg, now = Date.now()) {
  s.environment ||= environment.initialState();
  s.acSettings = temperatureSettings(s.acSettings);
  // Preserve an active manual selection when updating the running flow in place.
  s.manualHold ??= s.manualUntil > now;
  s.manualUntil = 0; // Retained for older consumers; manual control no longer expires.
  const topic = msg.topic || '';
  const suffix = topic.startsWith(s.base + '/') ? topic.slice(s.base.length + 1) : topic;
  const known = /^sensor\/(temp_humid|light|motion)$/.test(suffix) || suffix === 'status' ||
    /^(controller\/)?actuator\/(light|ac)\/cmd$/.test(suffix) || /^actuator\/(light|ac)\/state$/.test(suffix) ||
    suffix === 'controller/mode/cmd' || suffix === 'controller/temperature/cmd' || suffix === 'environment/state' || /^ui\/(light|ac|mode|demo|clock|environment|occupancy|autoTemperature|manualTemperature)$/.test(suffix) ||
    ['_tick', '_broker', '_error'].includes(topic);
  if (!known) return null;

  const events = [], commands = [], tempChart = [], luxChart = [];
  const beforeMode = s.mode;
  let changed = false;
  let inputError = null;
  const record = (event, detail) => events.push({ event, detail });
  const mqttCommand = (device, value, reason) => {
    commands.push({ topic: `${s.base}/actuator/${device}/cmd`,
      payload: JSON.stringify({ cmd: value, source: 'node-red' }), qos: '1', retain: false });
    const previous = s.pending[device];
    s.pending[device] = { value, sentAt: now, attempts: previous?.value === value ? previous.attempts + 1 : 1 };
    s.lastAction = reason;
    changed = true;
    record('command:' + device, JSON.stringify({ cmd: value, reason }));
  };
  function request(device, value, reason) {
    const pending = s.pending[device];
    if (s.outputs[device] === value && (!pending || pending.value === value)) return;
    if (pending?.value === value) {
      if (now - pending.sentAt < RETRY_MS) return;
      if (pending.attempts >= 3) {
        s.warning = 'ESP32 chưa xác nhận lệnh ' + (device === 'light' ? 'đèn' : 'máy lạnh');
        return;
      }
    }
    mqttCommand(device, value, reason);
  }
  function manual() {
    s.manualHold = true;
    s.forcedSleep = false;
    s.mode = 'MANUAL';
    changed = true;
  }
  function setMode(value) {
    if (!['AUTO', 'MANUAL', 'SLEEP'].includes(value)) throw new Error('Chế độ không hợp lệ');
    s.forcedSleep = value === 'SLEEP';
    s.manualHold = value === 'MANUAL';
    s.lastAction = 'Chọn chế độ ' + value;
    changed = true;
  }

  try {
    if (topic === '_broker') {
      s.brokerOnline = msg.payload === true;
      if (!s.brokerOnline) s.lastModePublished = null;
    } else if (topic === '_error') {
      s.ioError = 'Lỗi hệ thống: ' + String(msg.payload).slice(0, 200);
    } else if (suffix === 'status') {
      if (!['online', 'offline'].includes(msg.payload)) throw new Error('Trạng thái ESP32 không hợp lệ');
      if (s.espStatus !== msg.payload) record('availability', msg.payload);
      s.espStatus = msg.payload;
      if (msg.payload === 'offline') {
        s.lastSeen = s.tempAt = s.luxAt = s.motionAt = null;
        s.pending = { light: null, ac: null };
      }
    } else if (suffix === 'environment/state') {
      const before = s.environment.active;
      environment.acknowledge(s.environment, payloadObject(msg.payload), now, !!msg.retain);
      if (before !== s.environment.active) record('environment:state', s.environment.active ? 'model' : 'wokwi');
      changed = true;
    } else if (suffix === 'ui/environment') {
      if (typeof msg.payload !== 'boolean') throw new Error('Cờ mô phỏng phải là boolean');
      if (msg.payload) {
        if (!live(s, now)) throw new Error('Cần ESP32 online để chạy mô phỏng');
        if (!s.environment.supported || !fresh(s.environment.reportedAt, now)) throw new Error('Chạy lại Wokwi với firmware mới để bật mô phỏng');
        if (s.environment.wanted) {
          environment.retry(s.environment, now);
          s.lastAction = 'Gửi lại yêu cầu mô phỏng; giữ nguyên nhiệt độ, người và chế độ';
        } else {
          environment.start(s.environment, now);
          s.demo = true; s.clock = 'day'; setMode('AUTO');
          s.lastAction = 'Bắt đầu phòng tự động: 30°C, có người, giờ 14:00';
        }
      } else {
        environment.stop(s.environment);
        s.lastAction = 'Trở về cảm biến Wokwi chỉnh tay';
      }
      record('environment:request', msg.payload ? 'start' : 'stop');
      changed = true;
    } else if (suffix === 'ui/occupancy') {
      if (!s.environment.wanted || ![0,1].includes(msg.payload)) throw new Error('Cần bật phòng tự động và chọn Có người hoặc Vắng người');
      s.environment.presence = msg.payload;
      s.environment.lastSentAt = null;
      record('environment:occupancy', String(msg.payload));
      changed = true;
    } else if (suffix.startsWith('sensor/')) {
      const data = payloadObject(msg.payload);
      if (suffix === 'sensor/temp_humid') {
        if (!finiteRange(data.temp, -40, 80) || !finiteRange(data.hum, 0, 100)) throw new Error('DHT22 trả dữ liệu không hợp lệ');
        s.temp = data.temp; s.humidity = data.hum;
        if (!msg.retain) {
          s.tempAt = now;
          tempChart.push({ topic: 'Nhiệt độ', payload: s.temp, timestamp: now });
        }
      } else if (suffix === 'sensor/light') {
        if (!finiteRange(data.lux, 0, 200000)) throw new Error('LDR trả dữ liệu không hợp lệ');
        s.lux = data.lux;
        if (!msg.retain) {
          s.luxAt = now;
          luxChart.push({ topic: 'Ánh sáng', payload: s.lux, timestamp: now });
        }
      } else {
        if (data.presence !== 0 && data.presence !== 1) throw new Error('PIR trả dữ liệu không hợp lệ');
        s.motion = data.presence;
        if (!msg.retain) {
          s.motionAt = now;
          if (data.presence === 1) { s.lastMotionAt = now; s.noMotionSince = null; }
          else if (s.noMotionSince === null) s.noMotionSince = now;
        }
      }
      if (!msg.retain) { s.lastSeen = now; s.warning = ''; record(suffix.replace('/', ':'), JSON.stringify(data)); }
    } else if (/^actuator\/(light|ac)\/state$/.test(suffix)) {
      const device = suffix.split('/')[1];
      const value = payloadObject(msg.payload).state;
      if (!['ON', 'OFF'].includes(value)) throw new Error('Phản hồi relay không hợp lệ');
      if (s.outputs[device] !== value) record('state:' + device, value);
      s.outputs[device] = value;
      if (s.pending[device]?.value === value) { s.pending[device] = null; s.warning = ''; }
    } else if (suffix === 'controller/mode/cmd' || suffix === 'ui/mode') {
      if (msg.retain) return null;
      const value = suffix === 'ui/mode' ? msg.payload : payloadObject(msg.payload).mode;
      setMode(value);
    } else if (suffix === 'controller/temperature/cmd' || suffix === 'ui/autoTemperature' || suffix === 'ui/manualTemperature') {
      if (msg.retain) return null;
      const data = suffix.startsWith('ui/') ? {profile:suffix === 'ui/manualTemperature' ? 'manual' : 'auto', temperature:msg.payload} : payloadObject(msg.payload);
      if (!['auto','manual'].includes(data.profile) || !validTarget(data.temperature)) throw new Error('Chọn nhiệt độ nguyên từ 16 đến 31°C cho Tự động hoặc Tự điều khiển');
      s.acSettings[data.profile] = data.temperature;
      s.lastAction = (data.profile === 'manual' ? 'Tự điều khiển' : 'Tự động / Giờ ngủ') + ': đặt máy lạnh ' + data.temperature + '°C';
      s.warning = '';
      record('temperature:set', JSON.stringify({profile:data.profile,temperature:data.temperature}));
      changed = true;
    } else if (suffix === 'ui/demo') {
      if (typeof msg.payload !== 'boolean') throw new Error('Cờ demo phải là boolean');
      s.demo = msg.payload;
      changed = true;
      record('demo', String(s.demo));
    } else if (suffix === 'ui/clock') {
      if (!['real', 'day', 'night'].includes(msg.payload)) throw new Error('Giờ mô phỏng không hợp lệ');
      s.clock = msg.payload;
      changed = true;
      record('clock', s.clock);
    } else if (suffix !== '_tick') {
      if (msg.retain) return null;
      const data = command(msg.payload);
      if (data.source === 'node-red') return null; // Ignore our own MQTT echo.
      const device = suffix.startsWith('ui/') ? suffix.split('/')[1] : suffix.split('/').at(-2);
      const directLegacy = suffix.startsWith('actuator/');
      if (!directLegacy && !live(s, now)) throw new Error('ESP32 chưa có dữ liệu mới; chưa gửi lệnh');
      manual();
      record('manual:' + device, JSON.stringify({ cmd: data.cmd, source: data.source || 'external' }));
      if (directLegacy) {
        s.pending[device] = { value: data.cmd, sentAt: now, attempts: 1 };
        s.lastAction = 'Lệnh tay qua MQTT: ' + device + ' ' + data.cmd;
      } else mqttCommand(device, data.cmd, 'Lệnh tay: ' + device + ' ' + data.cmd);
    }
  } catch (error) {
    inputError = error.message;
    s.warning = error.message;
    record('invalid_input', JSON.stringify({ topic, error: error.message }));
    changed = true;
  }

  s.mode = effectiveMode(s, now);
  if (s.mode !== beforeMode) {
    changed = true;
    record('mode', beforeMode + ' -> ' + s.mode);
  }
  const available = status(s, now);
  if (available !== s.availability) {
    changed = true;
    record('connection', s.availability + ' -> ' + available);
    s.availability = available;
  }

  if (live(s, now)) {
    if (s.mode === 'MANUAL') {
      for (const device of ['light', 'ac']) {
        const pending = s.pending[device];
        if (pending) request(device, pending.value, 'Gửi lại lệnh tay chờ xác nhận');
      }
    } else {
      const timing = limits(s);
      if (fresh(s.motionAt, now) && s.motion === 0) request('light', 'OFF', 'Vắng người: tắt đèn ngay');
      if (fresh(s.motionAt, now) && s.motion === 1) request('light', 'ON', 'Có người: bật đèn');
      if (fresh(s.tempAt, now) && fresh(s.motionAt, now)) {
        const acOn = s.acSettings.auto + 0.5, acOff = s.acSettings.auto - 0.5;
        if (s.temp <= acOff || (s.noMotionSince !== null && now - s.noMotionSince >= timing.acTimeout)) {
          request('ac', 'OFF', s.temp <= acOff ? 'Đã đủ mát theo mức đặt ' + s.acSettings.auto + '°C: tạm ngừng làm lạnh' : 'Hết thời gian chờ chuyển động của máy lạnh');
        } else if (s.temp >= acOn && occupied(s, timing.acTimeout, now)) {
          request('ac', 'ON', 'Có người: duy trì mức đặt ' + s.acSettings.auto + '°C');
        }
      }
    }
  }

  const frame = environment.tick(s.environment, now, live(s, now), s.outputs.ac, targetTemp(s));
  if (frame) commands.push({topic:`${s.base}/environment/cmd`,payload:frame,qos:'1',retain:false});
  const view = snapshot(s, now);
  if (s.brokerOnline) {
    if (s.lastModePublished !== s.mode || changed) {
      commands.push({ topic: `${s.base}/controller/mode`,
        payload: JSON.stringify({ mode: s.mode, manualHold: !!s.manualHold, manualUntil: 0, targetTemp:targetTemp(s) }), qos: '1', retain: true });
      s.lastModePublished = s.mode;
    }
    if (s.lastSnapshotAt === null || now - s.lastSnapshotAt >= 5000 || changed) {
      commands.push({ topic: `${s.base}/controller/state`, payload: JSON.stringify(view), qos: '0', retain: true });
      s.lastSnapshotAt = now;
    }
  }
  return {
    state: s, mqtt: commands, view: { payload: view }, error: inputError,
    records: events.map(({event,detail})=>({timestamp:new Date(now).toISOString(),event,mode:s.mode,temp:s.temp,humidity:s.humidity,lux:s.lux,motion:s.motion,light:s.outputs.light,ac:s.outputs.ac,detail})),
    logs: events.map(({ event, detail }) => ({ payload: csvRow(s, now, event, detail) })),
    tempChart, luxChart
  };
}

module.exports = { initialState, step, snapshot, csvCell, temperatureSettings, FRESH_MS, NORMAL, DEMO };
