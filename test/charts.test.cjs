const {test}=require('node:test');
const assert=require('node:assert/strict');
const {update,WINDOW_MS,GAP_MS}=require('../node_red/lib/charts');
const {openDatabase}=require('../node_red/lib/database');
const NOW=Date.parse('2026-10-23T06:11:00.000Z');

test('recent charts exclude yesterday, use real clock and pad a constant 500 lux line',()=>{
  const result=update({}, {action:'replace',payload:[{x:NOW-86400000,y:100},{x:NOW-5000,y:500},{x:NOW,y:500}]},'lux',NOW);
  assert.equal(result.state.points.length,2);
  const o=result.msg.ui_update.chartOptions;
  assert.equal(o.xAxis.min,NOW-WINDOW_MS);assert.equal(o.xAxis.max,NOW);
  assert.equal(o.xAxis.axisLabel.formatter,'{HH}:{mm}');
  assert.ok(o.yAxis.min<500&&o.yAxis.max>500);
  assert.match(o.title.text,/500 lux/);assert.match(o.title.subtext,/13:11:00/);assert.match(o.title.subtext,/Không đổi/);
});

test('charts break a lost connection, sort restored data and replace late samples',()=>{
  let result=update({}, {action:'replace',payload:[{x:NOW,y:28},{x:NOW-GAP_MS-5000,y:24}]},'temp',NOW);
  assert.deepEqual(result.msg.payload.map(p=>p.y),[24,null,28]);
  assert.equal(result.msg.ui_update.chartOptions.series[0].connectNulls,false);
  result=update(result.state,{timestamp:NOW-1000,payload:27},'temp',NOW);
  assert.equal(result.msg.action,'replace');
  assert.deepEqual(result.state.points.map(p=>p.y),[24,27,28]);
  result=update(result.state,{timestamp:NOW+2000,payload:29},'temp',NOW+2000);
  assert.equal(result.msg.action,'append');assert.deepEqual(result.msg.payload,[{x:NOW+2000,y:29}]);
});

test('clock updates do not invent samples and stale or empty charts explain missing data',()=>{
  const result=update({points:[{x:NOW-GAP_MS-1,y:25}]},{topic:'_chart_tick'},'temp',NOW);
  assert.equal(result.msg.payload,undefined);
  assert.match(result.msg.ui_update.chartOptions.title.subtext,/Dữ liệu cũ/);
  const empty=update(result.state,{topic:'_chart_tick'},'temp',NOW+WINDOW_MS);
  assert.equal(empty.state.points.length,0);
  assert.match(empty.msg.ui_update.chartOptions.title.text,/Chưa có dữ liệu/);
});

test('SQLite chart restoration reads only recent samples and preserves both series',()=>{
  const db=openDatabase(':memory:');
  const now=Date.now();
  db.append([{timestamp:new Date(now-WINDOW_MS-1).toISOString(),event:'sensor:light',lux:100},
    {timestamp:new Date(now-1000).toISOString(),event:'sensor:light',lux:500},
    {timestamp:new Date(now-1000).toISOString(),event:'sensor:temp_humid',temp:28}]);
  assert.deepEqual(db.chart('sensor:light','lux').map(p=>p.value),[500]);
  assert.deepEqual(db.chart('sensor:temp_humid','temp').map(p=>p.value),[28]);
  db.close();
});
