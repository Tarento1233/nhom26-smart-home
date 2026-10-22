'use strict';

// Accelerated room model for demonstrations, not a calibrated physical room.
// Only an ESP32 acknowledgement makes a frame visible as sensor telemetry.
const FRAME_MS = 2000, RETRY_MS = 10000, RECOVERY_MS = 15000, FRESH_MS = 25000;
const TARGET = 25, MAX_COOLING = 0.24;
function initialState() {
  return { supported:false, reportedAt:null, active:false, wanted:false,
    temp:30, humidity:60, presence:1, seq:0, lastAt:null, lastSentAt:null,
    pending:null, error:'', errorAt:null, retryAt:null, wasReady:false,
    direction:'paused', coolingPercent:0 };
}
const fresh = (at, now) => at !== null && now >= at && now - at <= FRESH_MS;
function start(e, now) {
  Object.assign(e, {wanted:true,temp:30,humidity:60,presence:1,lastAt:now,
    lastSentAt:null,pending:null,error:'',errorAt:null,retryAt:null,direction:'waiting',coolingPercent:0});
}
function stop(e) {
  Object.assign(e, {wanted:false,lastSentAt:null,pending:null,error:'',errorAt:null,retryAt:null,direction:'paused'});
}
function retry(e, now) {
  Object.assign(e, {lastAt:now,lastSentAt:null,pending:null,error:'',errorAt:null,retryAt:null,direction:'waiting'});
}
function acknowledge(e, data, now, retained) {
  if (data.protocol !== 1 || typeof data.enabled !== 'boolean' || !Number.isInteger(data.seq) || data.seq < 0 || data.seq > 0xffffffff) {
    throw new Error('Trạng thái mô phỏng ESP32 không hợp lệ');
  }
  e.supported = true;
  if (!retained) {
    const restarted = e.active && !data.enabled && e.wanted;
    e.active = data.enabled;
    e.reportedAt = now;
    const p = e.pending;
    if (p && p.enabled === data.enabled && (!p.enabled || p.seq === data.seq)) {
      e.pending = null;
      e.error = '';
      e.errorAt = e.retryAt = null;
    }
    // The simulator can restart or fall back to its sensors while the web page
    // stays open. Its fresh disabled report requires a new frame, not a latched error.
    if (restarted) retry(e, now);
  }
}
function coolingLevel(temp, ac, occupied, target = TARGET) {
  if (ac !== 'ON') return 0;
  const heat = (32 - temp) / 100 + (occupied ? 0.005 : 0);
  // Feed forward the room's heat gain, then reduce output near the setpoint.
  return Math.min(1, Math.max(0, (heat + 0.08 * (temp - target)) / MAX_COOLING));
}
function physics(temp, humidity, ac, seconds, occupied, target = TARGET) {
  const dt = Math.min(5, Math.max(0, seconds));
  const heat = (32 - temp) / 100 + (occupied ? 0.005 : 0);
  const level = coolingLevel(temp, ac, occupied, target);
  return {
    temp:Math.min(40, Math.max(16, temp + dt * (heat - MAX_COOLING * level))),
    humidity:Math.min(80, Math.max(30, humidity + dt * (60 - 15 * level - humidity) / 120)),
    coolingPercent:Math.round(level * 100)
  };
}
function tick(e, now, connected, ac, target = TARGET) {
  let dt = e.lastAt === null ? 0 : Math.max(0, (now - e.lastAt) / 1000);
  e.lastAt = now;
  const ready = connected && e.supported && fresh(e.reportedAt, now);
  if (!ready) { e.wasReady = false; e.direction = 'paused'; e.coolingPercent = null; return null; }
  if (e.wasReady !== true) {
    retry(e, now);
    dt = 0;
  }
  e.wasReady = true;
  if (e.error) {
    e.errorAt ??= now;
    e.retryAt ??= now + RECOVERY_MS;
    // Do not keep sending to a paused simulator or treat retained state as a
    // recovery signal. One bounded burst resumes only after fresh device progress.
    if (now < e.retryAt || e.reportedAt <= e.errorAt) {
      e.direction = 'paused'; e.coolingPercent = null;
      return null;
    }
    retry(e, now);
    dt = 0;
  }
  if (e.wanted && e.active && !e.error && (ac === 'ON' || ac === 'OFF')) {
    const previousTemp = e.temp;
    const next = physics(e.temp, e.humidity, ac, dt, e.presence === 1, target);
    e.temp = next.temp; e.humidity = next.humidity;
    e.coolingPercent = next.coolingPercent;
    e.direction = ac === 'ON' && Math.abs(e.temp - target) <= 0.2 ? 'holding' : e.temp < previousTemp ? 'cooling' : 'warming';
  } else { e.direction = e.wanted ? 'waiting' : 'paused'; e.coolingPercent = null; }
  if (e.pending) {
    if (now - e.pending.sentAt < RETRY_MS) return null;
    if (e.pending.attempts >= 3) {
      e.error = 'Chưa nhận được xác nhận mô phỏng. Hệ thống sẽ tự thử lại; giữ tab Wokwi hiển thị và đang chạy.';
      e.errorAt = now; e.retryAt = now + RECOVERY_MS;
      e.direction = 'paused'; e.coolingPercent = null;
      return null;
    }
    e.pending.attempts++; e.pending.sentAt = now;
    return e.pending.payload;
  }
  if (!e.wanted && !e.active) return null;
  if (e.lastSentAt !== null && now - e.lastSentAt < FRAME_MS) return null;
  const seq = e.seq = (e.seq + 1) >>> 0 || 1;
  const payload = e.wanted ? `SIM ${seq} ${e.temp.toFixed(1)} ${e.humidity.toFixed(0)} ${e.presence}` : 'SENSOR';
  e.pending = {seq,enabled:e.wanted,payload,sentAt:now,attempts:1};
  e.lastSentAt = now;
  return payload;
}
function snapshot(e, now, connected, target = TARGET) {
  const ready = e.supported && fresh(e.reportedAt, now) && connected;
  return { supported:e.supported, available:ready,
    active:e.active, requested:e.wanted, presence:e.presence, direction:e.direction,
    pending:!!e.pending, error:e.error,
    retryIn:e.error && e.retryAt != null ? Math.max(0,Math.ceil((e.retryAt-now)/1000)) : null,
    phase:!ready && (e.wanted || e.active)?'paused':e.error?'error':e.wanted?(e.active?'running':'starting'):e.active?'stopping':'off',
    targetTemp:target, coolingPercent:e.direction === 'paused' || e.error ? null : e.coolingPercent,
    initialTemp:30, outsideTemp:32, model:'accelerated-inverter-v2' };
}
module.exports = {initialState,start,stop,retry,acknowledge,physics,coolingLevel,tick,snapshot,TARGET,RETRY_MS,RECOVERY_MS};
