'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const DATA=path.join(__dirname,'..','data');
const secret=()=>crypto.randomBytes(24).toString('base64url');

function loadConfig() {
  const filename=path.resolve(process.env.IOT_SECURITY_FILE || path.join(DATA,'security.json'));
  fs.mkdirSync(path.dirname(filename),{recursive:true});
  if(!fs.existsSync(filename)) {
    const config={version:1,baseTopic:process.env.IOT_MQTT_BASE || 'nhom26/room1',
      mqtt:{port:Number(process.env.IOT_MQTT_TCP_PORT || 1883),wsPort:Number(process.env.IOT_MQTT_WS_PORT || 1884)},
      serialPort:4000,serviceToken:secret(),web:{username:'nhom26',password:secret()},
      accounts:[['n26-controller','controller'],['n26-esp32','device'],['n26-voice','operator'],['n26-home-assistant','integration']].map(([username,role])=>({username,role,password:secret()}))};
    fs.writeFileSync(filename,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
    const help=['TÀI KHOẢN NHÀ THÔNG MINH - CHỈ DÙNG TRÊN MÁY NÀY',
      `Dashboard: http://localhost:${process.env.PORT || 1880}/dashboard/room`,
      `Tên đăng nhập: ${config.web.username}`,`Mật khẩu: ${config.web.password}`,'',
      'Home Assistant MQTT (phần mở rộng):',`Broker trên máy Windows: 127.0.0.1:${config.mqtt.port}`,
      `Username: ${config.accounts[3].username}`,`Password: ${config.accounts[3].password}`,'',
      'Không gửi file này lên GitHub hay group. Mỗi máy tự sinh tài khoản riêng.',
      'ESP32 được cấp tài khoản tự động qua cổng serial Wokwi, không cần sửa mã nguồn.'].join('\n');
    if(!process.env.IOT_SECURITY_FILE) fs.writeFileSync(path.join(DATA,'TAI_KHOAN_DEMO.txt'),'\uFEFF'+help+'\n',{mode:0o600});
  }
  const config=JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,''));
  config.baseTopic=process.env.IOT_MQTT_BASE || config.baseTopic;
  config.mqtt.port=Number(process.env.IOT_MQTT_TCP_PORT || config.mqtt.port);
  config.mqtt.wsPort=Number(process.env.IOT_MQTT_WS_PORT || config.mqtt.wsPort);
  const validSecret=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{24,64}$/.test(value);
  const validName=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(value);
  if(config.version!==1 || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(config.baseTopic) || !validName(config.web?.username) || !validSecret(config.web?.password) || !validSecret(config.serviceToken) || !Array.isArray(config.accounts) || config.accounts.length!==4) throw new Error('Cấu hình xác thực không hợp lệ. Kiểm tra security.json.');
  if(new Set(config.accounts.map(a=>a.username)).size!==4 || new Set(config.accounts.map(a=>a.role)).size!==4 || config.accounts.some(a=>!validName(a.username)||!validSecret(a.password)||!['controller','device','operator','integration'].includes(a.role)))throw new Error('Tài khoản MQTT không hợp lệ');
  for(const port of [config.mqtt.port,config.mqtt.wsPort,config.serialPort]) if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Cổng MQTT/serial không hợp lệ');
  if(config.mqtt.port===config.mqtt.wsPort)throw new Error('Hai cổng MQTT phải khác nhau');
  return {...config,filename,dbFile:path.resolve(process.env.IOT_DB_FILE || path.join(DATA,'smart_home.sqlite'))};
}
module.exports={loadConfig};
