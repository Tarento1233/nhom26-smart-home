const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {openDatabase,parseCsv}=require('../node_red/lib/database');
const {permitted}=require('../node_red/lib/broker');
const {telnetDecoder,startProvisioner}=require('../node_red/lib/provisioner');

test('SQLite preserves telemetry, salted passwords and sessions through a restart',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'n26-db-')),file=path.join(folder,'room.sqlite');
  let db=openDatabase(file);
  db.ensureUser('owner','a-long-test-password','owner');
  assert.equal(db.verifyUser('owner','wrong'),null);
  assert.equal(db.verifyUser('missing','a-long-test-password'),null);
  assert.equal(db.verifyUser('owner','a-long-test-password').role,'owner');
  db.append([{timestamp:'2026-10-23T00:00:00.000Z',event:'sensor:temp_humid',temp:27.5,humidity:60,detail:'comma, quote " and\nnewline'}]);
  const token=db.createSession('owner',1000);db.close();
  assert.equal(fs.readFileSync(file).includes(Buffer.from('a-long-test-password')),false);
  db=openDatabase(file);
  assert.equal(db.history()[0].temp,27.5);
  assert.equal(db.sessionUser(token,2000).username,'owner');
  assert.equal(db.sessionUser(token,1000+8*3600000),null);
  db.deleteSession(token);assert.equal(db.sessionUser(token,2000),null);
  assert.equal(parseCsv(db.exportCsv())[1][9],'comma, quote " and\nnewline');
  db.close();
});

test('legacy CSV imports once, retains quoted values and filtered queries reject injection',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'n26-import-')),file=path.join(folder,'old.csv');
  fs.writeFileSync(file,'\uFEFFtimestamp,event,mode,temp,humidity,lux,motion,light,ac,detail\n2026-10-22T00:00:00Z,sensor:temp_humid,AUTO,29,60,100,1,ON,ON,"old, value"\n2026-10-23T00:00:00Z,manual:ac,MANUAL,25,55,100,1,ON,OFF,hello\n');
  const db=openDatabase(':memory:');
  assert.equal(db.migrateCsv(file),2);assert.equal(db.migrateCsv(file),0);
  assert.equal(db.summary().records,2);
  assert.equal(db.history({event:'manual:ac'})[0].ac,'OFF');
  assert.equal(db.history({event:"' OR 1=1 --"}).length,0);
  assert.equal(db.history({from:'2026-10-23',limit:1}).length,1);
  assert.equal(db.history({beforeId:2})[0].detail,'old, value');
  assert.throws(()=>db.history({limit:'500 OR 1=1'}));
  assert.throws(()=>db.history({from:'invalid'}));
  db.close();
});

test('MQTT permissions separate telemetry, controller commands and user requests',()=>{
  const b='nhom26/room1';
  assert.ok(permitted('device','publish',b+'/sensor/temp_humid',b));
  assert.ok(permitted('device','subscribe',b+'/actuator/+/cmd',b));
  assert.equal(permitted('device','publish',b+'/actuator/ac/cmd',b),false);
  assert.equal(permitted('operator','publish',b+'/sensor/motion',b),false);
  assert.ok(permitted('operator','publish',b+'/controller/temperature/cmd',b));
  assert.equal(permitted('controller','publish',b+'/sensor/temp_humid',b),false);
  assert.ok(permitted('controller','publish',b+'/actuator/ac/cmd',b));
  assert.equal(permitted('operator','subscribe','nhom27/room1/#',b),false);
  assert.equal(permitted('controller','subscribe','#',b),false);
  assert.equal(permitted('device','publish','$SYS/other',b),false);
});

test('RFC2217 decoder handles split negotiations without corrupting a device challenge',()=>{
  const sent=[],decode=telnetDecoder({write:data=>sent.push([...data])});
  assert.equal(decode(Buffer.from([255,253])),'');
  assert.equal(decode(Buffer.from([44,78,50,54])),'N26');
  assert.deepEqual(sent,[[255,251,44]]);
  assert.equal(decode(Buffer.from([255,250,44,101,0,255,240,95,80])),'_P');
});

test('Wokwi provisioning answers a valid challenge without embedding an account in firmware',async()=>{
  const net=require('node:net');let remote,provisioner;
  const server=net.createServer(socket=>{remote=socket;socket.write('N26_PROVISION invalid\nN26_PROVI');setTimeout(()=>socket.write('SION deadbeef\n'),10);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const received=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Provisioning timeout')),3000);
      server.on('connection',socket=>{let buffer='';socket.on('data',data=>{buffer+=data.toString();if(buffer.includes('N26_AUTH deadbeef')){clearTimeout(timeout);resolve(buffer);}});});
    });
    provisioner=startProvisioner({config:{serialPort:server.address().port,mqtt:{port:1883},accounts:[{role:'device',username:'test-device',password:'test-password'}]},database:{audit(){}}});
    assert.ok((await received).includes('N26_AUTH deadbeef 1883 test-device test-password\n'));
  } finally {provisioner?.close();remote?.destroy();await new Promise(resolve=>server.close(resolve));}
});
