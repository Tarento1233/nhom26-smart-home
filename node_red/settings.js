const fs = require('node:fs');
const path = require('node:path');
const services = require('./lib/services').getServices();

process.env.IOT_MQTT_BASE = services.config.baseTopic;
process.env.IOT_MQTT_HOST = '127.0.0.1';
process.env.IOT_MQTT_PORT = String(services.config.mqtt.port);
const controllerAccount=services.config.accounts.find(a=>a.role==='controller');
process.env.IOT_MQTT_USERNAME=controllerAccount.username;
process.env.IOT_MQTT_PASSWORD=controllerAccount.password;
// MQTT node fields only substitute a variable when it occupies the whole field.
// Resolve complete topic strings here, including the LWT topic.
for (const [key, suffix] of Object.entries({
  SENSOR: 'sensor/#', STATUS: 'status', RELAY_STATE: 'actuator/+/state',
  REQUEST: 'controller/actuator/+/cmd', LEGACY_CMD: 'actuator/+/cmd',
  MODE_CMD: 'controller/mode/cmd', TEMPERATURE_CMD:'controller/temperature/cmd', CONTROLLER_STATUS: 'controller/status', ENVIRONMENT_STATE:'environment/state'
})) process.env['IOT_TOPIC_' + key] = process.env.IOT_MQTT_BASE + '/' + suffix;
process.env.IOT_LOG_FILE ||= path.join(__dirname, 'data', 'telemetry.csv');
const logFile = process.env.IOT_LOG_FILE;
fs.mkdirSync(path.dirname(logFile), { recursive: true });
if (!fs.existsSync(logFile) || fs.statSync(logFile).size === 0) {
  fs.writeFileSync(logFile, '\uFEFFtimestamp,event,mode,temp,humidity,lux,motion,light,ac,detail\n');
}
services.database.migrateCsv(logFile);

module.exports = {
  uiHost: '127.0.0.1',
  uiPort: Number(process.env.PORT || 1880),
  flowFile: 'flows.json',
  httpAdminRoot: '/',
  httpNodeRoot: '/',
  httpStatic: [{ path: path.join(__dirname, '..', 'voice'), root: '/voice/' }],
  functionTimeout: 5,
  functionExternalModules: false,
  functionGlobalContext: { iotDatabase:services.database },
  dashboard: { middleware:(req,res,next)=>services.auth.middleware(req,res,next), ioMiddleware:(socket,next)=>services.auth.ioMiddleware(socket,next) },
  runtimeState: { enabled: true, ui: true },
  contextStorage: {
    default: { module: 'memory' },
    preferences: { module: 'localfilesystem', config: {
      dir: process.env.IOT_PREFERENCES_DIR || path.join(__dirname, 'data', 'preferences'),
      flushInterval: 1
    } }
  },
  logging: { console: { level: 'info', metrics: false, audit: false } },
  editorTheme: { projects: { enabled: false } }
};
