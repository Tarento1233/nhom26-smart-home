const fs = require('node:fs');
const path = require('node:path');

process.env.IOT_MQTT_BASE ||= 'nhom26/room1';
process.env.IOT_MQTT_HOST ||= 'wss://broker.hivemq.com:8884/mqtt';
process.env.IOT_MQTT_PORT ||= '8884';
// MQTT node fields only substitute a variable when it occupies the whole field.
// Resolve complete topic strings here, including the LWT topic.
for (const [key, suffix] of Object.entries({
  SENSOR: 'sensor/#', STATUS: 'status', RELAY_STATE: 'actuator/+/state',
  REQUEST: 'controller/actuator/+/cmd', LEGACY_CMD: 'actuator/+/cmd',
  MODE_CMD: 'controller/mode/cmd', CONTROLLER_STATUS: 'controller/status', ENVIRONMENT_STATE:'environment/state'
})) process.env['IOT_TOPIC_' + key] = process.env.IOT_MQTT_BASE + '/' + suffix;
process.env.IOT_LOG_FILE ||= path.join(__dirname, 'data', 'telemetry.csv');
const logFile = process.env.IOT_LOG_FILE;
fs.mkdirSync(path.dirname(logFile), { recursive: true });
if (!fs.existsSync(logFile) || fs.statSync(logFile).size === 0) {
  fs.writeFileSync(logFile, '\uFEFFtimestamp,event,mode,temp,humidity,lux,motion,light,ac,detail\n');
}

module.exports = {
  uiHost: '127.0.0.1',
  uiPort: Number(process.env.PORT || 1880),
  flowFile: 'flows.json',
  httpAdminRoot: '/',
  httpNodeRoot: '/',
  httpStatic: [{ path: path.join(__dirname, '..', 'voice'), root: '/voice/' }],
  functionTimeout: 5,
  functionExternalModules: false,
  runtimeState: { enabled: true, ui: true },
  contextStorage: { default: { module: 'memory' } },
  logging: { console: { level: 'info', metrics: false, audit: false } },
  editorTheme: { projects: { enabled: false } }
};
