const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const controller = fs.readFileSync(path.join(root, 'lib/controller.js'), 'utf8');
const environment = fs.readFileSync(path.join(root, 'lib/environment.js'), 'utf8');
const template = fs.readFileSync(path.join(root, 'dashboard.vue'), 'utf8');
const nodes = [];
const MAIN = 'n26-main', UI = 'n26-ui', API = 'n26-api', BROKER = 'n26-broker';
const add = node => { nodes.push(node); return node.id; };
const fn = (id, z, name, func, x, y, wires, extra = {}) => add({ id, type:'function', z, name,
  func, outputs:wires.length, timeout:0, noerr:0, initialize:'', finalize:'', libs:[], x, y, wires, ...extra });
const linkOut = (id, z, name, x, y, links) => add({id,type:'link out',z,name,mode:'link',links,x,y,wires:[]});
const linkIn = (id, z, name, x, y, links, wire) => add({id,type:'link in',z,name,links,x,y,wires:[[wire]]});
const comment = (id,z,name,info,x,y) => add({id,type:'comment',z,name,info,x,y,wires:[]});

add({id:MAIN,type:'tab',label:'01 · MQTT & tự động',disabled:false,info:'Nhận cảm biến → kiểm tra độ mới → AUTO/MANUAL/SLEEP → lệnh relay. Rule được nhúng sẵn; khởi chạy bằng node-red-service.cjs để có SQLite và xác thực.'});
add({id:UI,type:'tab',label:'02 · Dashboard',disabled:false,info:'Dashboard 2.0: trạng thái thật từ ESP32, điều khiển, chế độ, công cụ demo và biểu đồ.'});
add({id:API,type:'tab',label:'03 · API & SQLite',disabled:false,info:'API cần đăng nhập. SQLite lưu telemetry và xác thực; khôi phục lịch sử/biểu đồ, xuất CSV từ database.'});
add({id:BROKER,type:'mqtt-broker',name:'MQTT riêng · xác thực và phân quyền',broker:'${IOT_MQTT_HOST}',port:'${IOT_MQTT_PORT}',
  clientid:'',autoConnect:true,usetls:false,verifyservercert:true,protocolVersion:'4',keepalive:'30',cleansession:true,autoUnsubscribe:true,
  birthTopic:'${IOT_TOPIC_CONTROLLER_STATUS}',birthQos:'1',birthRetain:'true',birthPayload:'online',birthMsg:{},
  closeTopic:'${IOT_TOPIC_CONTROLLER_STATUS}',closeQos:'1',closeRetain:'true',closePayload:'offline',closeMsg:{},
  willTopic:'${IOT_TOPIC_CONTROLLER_STATUS}',willQos:'1',willRetain:'true',willPayload:'offline',willMsg:{},queueQoSZero:false});
comment('n26-main-note',MAIN,'Luồng chính: cảm biến → rule → MQTT → ESP32','AUTO/SLEEP: đèn theo người, không dùng ngưỡng lux; vắng người tắt ngay trong AUTO/SLEEP. Máy lạnh đặt 16–31°C, nhớ riêng AUTO/SLEEP và MANUAL. Relay AUTO cho làm lạnh ở mức đặt +0,5°C, tạm ngừng ở mức đặt -0,5°C. Mô hình inverter giảm làm lạnh để giữ mức đã chọn. AC tắt sau 10 phút vắng (demo 15 giây). MANUAL giữ đến khi người dùng đổi chế độ, cho phép bật đèn khi phòng vắng. Mô hình chỉ hiển thị sau phản hồi ESP32.',430,40);
const inputs = [
  ['SENSOR','Cảm biến DHT22 / LDR / PIR'], ['STATUS','ESP32 online / offline'],
  ['RELAY_STATE','Phản hồi relay'], ['REQUEST','Lệnh tay: voice / Home Assistant'],
  ['LEGACY_CMD','Tương thích lệnh MQTT cũ'], ['MODE_CMD','Chọn AUTO / MANUAL / SLEEP'],
  ['ENVIRONMENT_STATE','Xác nhận mô hình nhiệt độ ESP32'], ['TEMPERATURE_CMD','Đặt nhiệt độ máy lạnh 16–31°C']
];
inputs.forEach(([topic,name],i) => add({id:'n26-in-'+i,type:'mqtt in',z:MAIN,name,
  topic:'${IOT_TOPIC_'+topic+'}',qos:'1',datatype:'utf8',broker:BROKER,nl:false,rap:true,rh:0,inputs:0,
  x:200,y:110+i*55,wires:[['n26-engine']]}));
add({id:'n26-tick',type:'inject',z:MAIN,name:'Lịch & timeout mỗi giây',props:[{p:'topic',vt:'str'}],
  repeat:'1',crontab:'',once:true,onceDelay:1,topic:'_tick',x:200,y:565,wires:[['n26-engine']]});
add({id:'n26-broker-status',type:'status',z:MAIN,name:'Theo dõi kết nối broker',scope:['n26-in-0'],x:190,y:625,wires:[['n26-map-broker']]});
fn('n26-map-broker',MAIN,'Trạng thái broker',"return {topic:'_broker',payload:msg.status.fill === 'green'};",420,625,[['n26-engine']]);
linkIn('n26-controls-in',MAIN,'Từ dashboard / API',510,470,['n26-controls-out','n26-api-out'],'n26-engine');
const engine = `const roomEnvironment = (() => { const module = {exports:{}};\n${environment}\nreturn module.exports; })();
const controller = (() => { const module = {exports:{}}; const require = (id) => { if(id==='./environment') return roomEnvironment; throw new Error('Unknown module'); };\n${controller}\nreturn module.exports; })();
const savedSettings = context.get('acSettings', 'preferences');
const state = context.get('room') || controller.initialState(env.get('IOT_MQTT_BASE') || 'nhom26/room1', savedSettings);
const result = controller.step(state, msg, Date.now());
if (!result) return null;
const database = global.get('iotDatabase');
if (!database) throw new Error('SQLite chưa sẵn sàng');
database.append(result.records);
result.view.payload.storage = database.summary();
result.view.payload.security = {broker:'local',authenticated:true};
for (const publication of result.mqtt) if (publication.topic.endsWith('/controller/state')) publication.payload=JSON.stringify(result.view.payload);
context.set('room', result.state);
if (JSON.stringify(savedSettings) !== JSON.stringify(result.state.acSettings)) context.set('acSettings', result.state.acSettings, 'preferences');
const view = result.view.payload;
node.status({fill:view.status==='online'?'green':'yellow',shape:'dot',text:view.mode+' · '+view.status});
const response = msg.req ? {...msg, statusCode:result.error?400:200, headers:{'Content-Type':'application/json; charset=utf-8'}, payload:result.error?{...view,error:result.error}:view} : null;
return [result.mqtt.length?result.mqtt:null, result.view, result.logs.length?result.logs:null,
 result.tempChart.length?result.tempChart:null, result.luxChart.length?result.luxChart:null, response];`;
fn('n26-engine',MAIN,'Điều khiển AUTO / MANUAL / SLEEP',engine,710,270,
  [['n26-mqtt-out'],['n26-view-out'],['n26-log-out'],['n26-temp-out'],['n26-lux-out'],['n26-response-out']]);
add({id:'n26-mqtt-out',type:'mqtt out',z:MAIN,name:'Lệnh relay + chế độ + trạng thái',topic:'',qos:'',retain:'',respTopic:'',contentType:'',userProps:'',correl:'',expiry:'',broker:BROKER,x:1110,y:170,wires:[]});
linkOut('n26-view-out',MAIN,'Trạng thái → dashboard',1005,245,['n26-view-in']);
linkOut('n26-log-out',MAIN,'Sự kiện → CSV',1005,300,['n26-log-in']);
linkOut('n26-temp-out',MAIN,'Nhiệt độ → biểu đồ',1005,355,['n26-temp-in']);
linkOut('n26-lux-out',MAIN,'Lux → biểu đồ',1005,410,['n26-lux-in']);
linkOut('n26-response-out',MAIN,'Trả kết quả API',1005,465,['n26-response-in']);

add({id:'n26-ui-base',type:'ui-base',name:'Nhóm 26 · Smart Home',path:'/dashboard',appIcon:'',includeClientData:true,
  acceptsClientConfig:['ui-control','ui-notification'],showPathInSidebar:false,headerContent:'page',navigationStyle:'none',
  titleBarStyle:'hidden',showReconnectNotification:true,notificationDisplayTime:5,showDisconnectNotification:true,allowInstall:false});
add({id:'n26-theme',type:'ui-theme',name:'Nhà tự chăm · Nhóm 26',colors:{surface:'#fafbf6',primary:'#28634e',bgPage:'#fafbf6',groupBg:'#fafbf6',groupOutline:'#e3e7df'},
  sizes:{density:'default',pagePadding:'16px',groupGap:'18px',groupBorderRadius:'18px',widgetGap:'12px'}});
add({id:'n26-page',type:'ui-page',name:'Nhà thông minh',ui:'n26-ui-base',path:'/room',icon:'home',layout:'grid',theme:'n26-theme',
  breakpoints:[{name:'Mobile',px:0,cols:4},{name:'Tablet',px:600,cols:8},{name:'Desktop',px:1000,cols:12}],order:1,className:'iot-dashboard-page',visible:true,disabled:false});
for (const [id,name,width,order,showTitle] of [['n26-room-group','Phòng 1',12,1,false],['n26-temp-group','Nhiệt độ đã thay đổi thế nào? · °C',6,2,true],['n26-lux-group','Phòng sáng hay tối theo thời gian? · lux',6,3,true]]) {
  add({id,type:'ui-group',name,page:'n26-page',width,height:1,order,showTitle,className:id==='n26-room-group'?'iot-main-group':'iot-history-group',visible:true,disabled:false,groupType:'default'});
}
comment('n26-ui-note',UI,'Dashboard: dữ liệu mới + phản hồi thật','Bấm nút gửi lệnh vào controller trước khi tới ESP32. Trạng thái hiển thị theo /state của ESP32, không đổi giả khi vừa bấm. Demo nhanh rút gọn timeout; mặc định tắt.',510,50);
linkIn('n26-view-in',UI,'Nhận trạng thái phòng',135,150,['n26-view-out'],'n26-dashboard');
add({id:'n26-dashboard',type:'ui-template',z:UI,group:'n26-room-group',page:'',ui:'',name:'Tổng quan · điều khiển · chế độ',order:1,width:12,height:0,
  head:'',format:template,storeOutMessages:false,passthru:false,resendOnRefresh:false,templateScope:'local',className:'',
  x:400,y:150,wires:[['n26-controls-out']]});
linkOut('n26-controls-out',UI,'Lệnh người dùng → rule',690,150,['n26-controls-in']);
linkIn('n26-temp-in',UI,'Dữ liệu nhiệt độ',135,270,['n26-temp-out','n26-history-temp'],'n26-temp-chart');
linkIn('n26-lux-in',UI,'Dữ liệu ánh sáng',135,350,['n26-lux-out','n26-history-lux'],'n26-lux-chart');
for (const [id,group,label,y,color] of [['n26-temp-chart','n26-temp-group','Nhiệt độ',270,'#b68b3c'],['n26-lux-chart','n26-lux-group','Ánh sáng',350,'#2e7663']]) {
  add({id,type:'ui-chart',z:UI,group,name:label,label,order:1,chartType:'line',category:'topic',categoryType:'msg',
    xAxisLabel:'',xAxisProperty:'timestamp',xAxisPropertyType:'msg',xAxisType:'time',xAxisFormat:'HH:mm',xAxisFormatType:'custom',
    yAxisLabel:label==='Nhiệt độ'?'°C':'lux',yAxisProperty:'payload',yAxisPropertyType:'msg',ymin:'',ymax:'',
    action:'append',stackSeries:false,pointShape:'circle',pointRadius:1,showLegend:false,removeOlder:24,removeOlderUnit:'3600',removeOlderPoints:'600',
    colors:[color],textColorDefault:true,gridColorDefault:true,width:6,height:5,className:'',interpolation:'linear',x:410,y,wires:[[]]});
}

comment('n26-api-note',API,'API đăng nhập · truy vấn SQLite · xuất CSV','GET /api/status; POST /api/control; GET /api/log.csv; GET /api/history. SQLite lưu cảm biến, lệnh, xác thực và phiên đăng nhập. CSV cũ được nhập một lần; xuất CSV đọc từ database. Node-RED chỉ lắng nghe 127.0.0.1.',530,40);
add({id:'n26-http-status',type:'http in',z:API,name:'GET /api/status',url:'/api/status',method:'get',upload:false,swaggerDoc:'',x:150,y:110,wires:[['n26-status-request']]});
fn('n26-status-request',API,'Lấy snapshot mới',"msg.topic='_tick'; return msg;",390,110,[['n26-api-out']]);
add({id:'n26-http-control',type:'http in',z:API,name:'POST /api/control',url:'/api/control',method:'post',upload:false,swaggerDoc:'',x:150,y:175,wires:[['n26-validate-request']]});
fn('n26-validate-request',API,'Kiểm tra yêu cầu',`const p=msg.payload;
if (!p || !['light','ac','mode','demo','clock','environment','occupancy','autoTemperature','manualTemperature'].includes(p.kind)) {
 msg.statusCode=400;msg.payload={error:'kind phải là light/ac/mode/demo/clock/environment/occupancy/autoTemperature/manualTemperature'}; return [null,msg];
}
msg.topic='ui/'+p.kind; msg.payload=p.value; return [msg,null];`,390,175,[['n26-api-out'],['n26-http-response']]);
linkOut('n26-api-out',API,'Yêu cầu → controller',620,140,['n26-controls-in']);
linkIn('n26-response-in',API,'Kết quả từ controller',720,110,['n26-response-out'],'n26-http-response');
add({id:'n26-http-response',type:'http response',z:API,name:'JSON response',statusCode:'',headers:{},x:950,y:150,wires:[]});

linkIn('n26-log-in',API,'Sự kiện CSV',115,300,['n26-log-out'],'n26-log-file-name');
fn('n26-log-file-name',API,'Đường dẫn log',"msg.filename=env.get('IOT_LOG_FILE'); return msg;",330,300,[['n26-write-log']]);
add({id:'n26-write-log',type:'file',z:API,name:'Append telemetry.csv',filename:'filename',filenameType:'msg',appendNewline:false,createDir:true,overwriteFile:'false',encoding:'utf8',x:600,y:300,wires:[[]]});
add({id:'n26-download',type:'http in',z:API,name:'GET /api/log.csv',url:'/api/log.csv',method:'get',upload:false,swaggerDoc:'',x:150,y:380,wires:[['n26-download-path']]});
fn('n26-download-path',API,'Xuất CSV từ SQLite',`msg.payload=global.get('iotDatabase').exportCsv();
msg.headers={'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename=nhom26-telemetry.csv','Cache-Control':'no-store'};
return msg;`,480,380,[['n26-http-response']]);

add({id:'n26-history-start',type:'inject',z:API,name:'Khôi phục biểu đồ từ database',props:[],repeat:'',crontab:'',once:true,onceDelay:3,x:170,y:490,wires:[['n26-history-path']]});
add({id:'n26-history-api',type:'http in',z:API,name:'GET /api/history',url:'/api/history',method:'get',upload:false,swaggerDoc:'',x:150,y:550,wires:[['n26-history-path']]});
fn('n26-history-path',API,'Truy vấn SQLite',`const database=global.get('iotDatabase');
if(msg.req){
 try{msg.payload=database.history(msg.req.query||{});msg.statusCode=200;}
 catch(error){msg.payload={error:error.message};msg.statusCode=400;}
 msg.headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};return [null,null,msg];
}
const points=(event,key,name)=>database.chart(event,key).map(r=>({topic:name,payload:r.value,timestamp:Date.parse(r.timestamp)}));
return [points('sensor:temp_humid','temp','Nhiệt độ'),points('sensor:light','lux','Ánh sáng'),null];`,610,510,[['n26-history-temp'],['n26-history-lux'],['n26-http-response']]);
linkOut('n26-history-temp',API,'Lịch sử nhiệt độ',1065,590,['n26-temp-in']);
linkOut('n26-history-lux',API,'Lịch sử ánh sáng',1065,645,['n26-lux-in']);
add({id:'n26-catch',type:'catch',z:API,name:'Lỗi file / flow',scope:null,uncaught:false,x:170,y:700,wires:[['n26-system-error']]});
fn('n26-system-error',API,'Thông báo lỗi',"if(msg.req){msg.statusCode=500;msg.payload={error:msg.error?.message||'Lỗi hệ thống'};return [null,msg];}return [{topic:'_error',payload:msg.error?.message||'Lỗi hệ thống'},null];",440,700,[['n26-api-out'],['n26-http-response']]);

// Keep the exported flow entirely self-contained; generated code is the same
// controller that the deterministic tests execute.
fs.writeFileSync(path.join(root, 'flows.json'), JSON.stringify(nodes, null, 2) + '\n');
console.log('Generated flows.json:', nodes.length, 'nodes across 3 tabs.');
