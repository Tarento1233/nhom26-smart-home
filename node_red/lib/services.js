'use strict';
const {loadConfig}=require('./config');
const {openDatabase}=require('./database');
let current;
function getServices(){
  if(current)return current;
  const config=loadConfig(),database=openDatabase(config.dbFile);
  database.ensureUser(config.web.username,config.web.password,'owner');
  for(const account of config.accounts)database.ensureUser(account.username,account.password,account.role);
  return current={config,database};
}
module.exports={getServices};
