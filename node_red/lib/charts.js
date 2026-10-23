'use strict';

const WINDOW_MS=15*60*1000;
const GAP_MS=25*1000;
const clock=timestamp=>new Date(timestamp).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false});

function update(state,msg,metric,now=Date.now()) {
  const label=metric==='lux'?'Ánh sáng':'Nhiệt độ';
  const unit=metric==='lux'?'lux':'°C';
  const replace=msg.action==='replace';
  const incoming=Array.isArray(msg.payload)?msg.payload:
    typeof msg.payload==='number'?[{x:msg.timestamp,y:msg.payload}]:[];
  const previous=state.points||[];
  const byTime=new Map();
  for(const point of [...(replace?[]:previous),...incoming]) {
    if(Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=now-WINDOW_MS&&point.x<=now)
      byTime.set(point.x,{x:point.x,y:point.y});
  }
  const points=[...byTime.values()].sort((a,b)=>a.x-b.x);
  const last=points.at(-1);
  const values=points.map(point=>point.y);
  const low=values.length?Math.min(...values):metric==='lux'?0:16;
  const high=values.length?Math.max(...values):metric==='lux'?1000:32;
  const pad=metric==='lux'?Math.max(50,(high-low)*.15,high*.1):Math.max(.5,(high-low)*.15);
  const minimum=metric==='lux'?Math.max(0,Math.floor((low-pad)/50)*50):Math.floor((low-pad)*2)/2;
  const maximum=metric==='lux'?Math.ceil((high+pad)/50)*50:Math.ceil((high+pad)*2)/2;
  const text=last?last.y.toLocaleString('vi-VN',{maximumFractionDigits:1})+' '+unit:'Chưa có dữ liệu';
  const stale=!last||now-last.x>GAP_MS;
  const subtitle=last?(stale?'Dữ liệu cũ · ':'')+'Cập nhật '+clock(last.x)+(low===high?' · Không đổi':''):'Chưa có số liệu trong 15 phút gần đây';
  const options={
    animation:false,
    title:{text:label+' · '+text,subtext:subtitle,left:4,textStyle:{fontSize:15,fontWeight:600},subtextStyle:{fontSize:11,color:stale?'#9b7539':'#65756e'}},
    grid:{left:52,right:24,top:66,bottom:37,containLabel:false},
    xAxis:{min:now-WINDOW_MS,max:now,splitNumber:5,minInterval:60000,axisLabel:{formatter:'{HH}:{mm}',hideOverlap:true},name:''},
    yAxis:{min:minimum,max:maximum,splitNumber:4,name:unit},
    series:[{name:label,type:'line',connectNulls:false,showSymbol:true,symbolSize:4,lineStyle:{width:3}}]
  };
  const result={topic:label,ui_update:{chartOptions:options}};
  if(incoming.length||replace) {
    const ordered=replace||incoming.some(p=>p.x<=(previous.at(-1)?.x??-Infinity));
    const selected=ordered?points:points.filter(p=>p.x>(previous.at(-1)?.x??-Infinity));
    const output=[];
    let before=ordered?null:previous.at(-1);
    for(const point of selected) {
      if(before&&point.x-before.x>GAP_MS)output.push({x:before.x+1,y:null});
      output.push(point);before=point;
    }
    if(output.length||replace){result.action=ordered?'replace':'append';result.payload=output;}
  }
  return {state:{points},msg:result};
}
module.exports={update,WINDOW_MS,GAP_MS};
