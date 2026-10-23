'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {csvCell}=require('./controller');
const FIELDS=['timestamp','event','mode','temp','humidity','lux','motion','light','ac','detail'];
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const passwordHash=(password,salt)=>crypto.scryptSync(password,salt,32).toString('hex');
function equal(a,b) { const aa=Buffer.from(a||''),bb=Buffer.from(b||'');return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb); }

function parseCsv(text) {
  const rows=[];let row=[],field='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted) throw new Error('CSV cũ có dấu ngoặc kép chưa đóng');
  if(field||row.length){row.push(field);rows.push(row);}
  return rows;
}

function openDatabase(filename) {
  if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS telemetry(id INTEGER PRIMARY KEY,timestamp TEXT NOT NULL,event TEXT NOT NULL,mode TEXT,temp REAL,humidity REAL,lux REAL,motion INTEGER,light TEXT,ac TEXT,detail TEXT);
    CREATE INDEX IF NOT EXISTS telemetry_time ON telemetry(timestamp,id);
    CREATE INDEX IF NOT EXISTS telemetry_event_time ON telemetry(event,timestamp,id);
    CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY,role TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,username TEXT NOT NULL REFERENCES users(username),expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_events(id INTEGER PRIMARY KEY,timestamp TEXT NOT NULL,kind TEXT NOT NULL,username TEXT,success INTEGER NOT NULL,detail TEXT);
    CREATE TABLE IF NOT EXISTS mqtt_retained(topic TEXT PRIMARY KEY,payload BLOB NOT NULL,qos INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    PRAGMA user_version=1;`);
  const insert=db.prepare(`INSERT INTO telemetry(${FIELDS.join(',')}) VALUES(${FIELDS.map(()=>'?').join(',')})`);
  function append(records) {
    if(!records.length)return;
    db.exec('BEGIN');
    try {for(const r of records)insert.run(...FIELDS.map(k=>r[k]??null));db.exec('COMMIT');}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  function migrateCsv(file) {
    if(!file || !fs.existsSync(file))return 0;
    const key='legacy-csv:'+path.resolve(file);
    if(db.prepare('SELECT value FROM metadata WHERE key=?').get(key))return 0;
    const [header,...values]=parseCsv(fs.readFileSync(file,'utf8'));
    if(!header?.includes('timestamp')||!header.includes('event'))return 0;
    const records=values.map(row=>Object.fromEntries(header.map((name,i)=>[name,row[i]??'']))).filter(r=>Number.isFinite(Date.parse(r.timestamp))&&r.event);
    db.exec('BEGIN');
    try {
      for(const r of records)insert.run(...FIELDS.map(k=>['temp','humidity','lux','motion'].includes(k)?r[k]===''?null:Number.isFinite(Number(r[k]))?Number(r[k]):null:r[k]??null));
      db.prepare('INSERT INTO metadata(key,value) VALUES(?,?)').run(key,new Date().toISOString());db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return records.length;
  }
  function ensureUser(username,password,role) {
    const existing=db.prepare('SELECT * FROM users WHERE username=?').get(username);
    if(!existing || existing.role!==role || !equal(existing.password_hash,passwordHash(password,existing.salt))) {
      const salt=crypto.randomBytes(16).toString('hex');
      db.prepare('INSERT INTO users VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET role=excluded.role,salt=excluded.salt,password_hash=excluded.password_hash').run(username,role,salt,passwordHash(password,salt));
      db.prepare('DELETE FROM sessions WHERE username=?').run(username);
    }
  }
  function verifyUser(username,password) {
    if(typeof username!=='string'||typeof password!=='string'||password.length>256)return null;
    const user=db.prepare('SELECT * FROM users WHERE username=?').get(username);
    const actual=passwordHash(password,user?.salt || 'invalid-user-constant-work');
    return user&&equal(actual,user.password_hash)?{username:user.username,role:user.role}:null;
  }
  function audit(kind,username,success,detail='') {db.prepare('INSERT INTO auth_events(timestamp,kind,username,success,detail) VALUES(?,?,?,?,?)').run(new Date().toISOString(),kind,String(username||'').slice(0,80),success?1:0,detail.slice(0,200));}
  function createSession(username,now=Date.now()) {
    const token=crypto.randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),username,now+8*3600000);
    return token;
  }
  function sessionUser(token,now=Date.now()) {
    if(typeof token!=='string'||token.length>128)return null;
    return db.prepare('SELECT users.username,users.role FROM sessions JOIN users USING(username) WHERE token_hash=? AND expires_at>?').get(digest(token),now)||null;
  }
  function deleteSession(token){if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));}
  function history(query={}) {
    const n=query.limit===undefined?200:Number(query.limit);
    if(!Number.isInteger(n)||n<1||n>500)throw new Error('limit phải từ 1 đến 500');
    const where=[],params=[];
    for(const [key,op] of [['from','>='],['to','<=']])if(query[key]!==undefined){const ms=Date.parse(query[key]);if(!Number.isFinite(ms))throw new Error('Thời gian lọc không hợp lệ');where.push('timestamp '+op+' ?');params.push(new Date(ms).toISOString());}
    if(query.event!==undefined){if(typeof query.event!=='string'||query.event.length>100)throw new Error('Loại sự kiện không hợp lệ');where.push('event=?');params.push(query.event);}
    if(query.beforeId!==undefined){const id=Number(query.beforeId);if(!Number.isInteger(id)||id<1)throw new Error('beforeId không hợp lệ');where.push('id<?');params.push(id);}
    return db.prepare('SELECT * FROM telemetry'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY id DESC LIMIT ?').all(...params,n).reverse();
  }
  function chart(event,key) {return db.prepare(`SELECT timestamp,${key} AS value FROM telemetry WHERE event=? AND timestamp>=? AND ${key} IS NOT NULL ORDER BY id DESC LIMIT 500`).all(event,new Date(Date.now()-86400000).toISOString()).reverse();}
  function exportCsv() {const rows=['\uFEFFtimestamp,event,mode,temp,humidity,lux,motion,light,ac,detail\n'];for(const r of db.prepare('SELECT * FROM telemetry ORDER BY id').iterate())rows.push(FIELDS.map(k=>csvCell(r[k])).join(',')+'\n');return rows.join('');}
  function summary() {
    const counts=db.prepare('SELECT count(*) AS records,min(timestamp) AS firstSaved,max(timestamp) AS lastSaved FROM telemetry').get();
    return {driver:'SQLite',file:path.basename(filename),...counts,authEvents:db.prepare('SELECT count(*) AS n FROM auth_events').get().n,users:db.prepare('SELECT count(*) AS n FROM users').get().n};
  }
  function retained(topic,payload,qos){if(!payload.length)db.prepare('DELETE FROM mqtt_retained WHERE topic=?').run(topic);else db.prepare('INSERT INTO mqtt_retained VALUES(?,?,?) ON CONFLICT(topic) DO UPDATE SET payload=excluded.payload,qos=excluded.qos').run(topic,payload,qos);}
  return {append,migrateCsv,ensureUser,verifyUser,audit,createSession,sessionUser,deleteSession,history,chart,exportCsv,summary,retained,
    retainedMessages:()=>db.prepare('SELECT * FROM mqtt_retained').all(),close:()=>db.close()};
}
module.exports={openDatabase,parseCsv,equal};
