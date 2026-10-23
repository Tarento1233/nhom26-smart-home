"""Real HTTP/MQTT rejection tests against the isolated E2E service."""
import json
import threading
import uuid
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
import paho.mqtt.client as mqtt

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def http(url, path, body=None, headers=None):
    data = None if body is None else json.dumps(body).encode()
    req = Request(url+path, data=data, headers={"Content-Type":"application/json", **(headers or {})})
    try:
        response = build_opener(NoRedirect).open(req, timeout=5)
    except HTTPError as error:
        response = error
    return response.code, response.headers, response.read().decode('utf-8')

def verify_security(url, config, check):
    status, headers, _ = http(url, '/dashboard/room')
    check('Dashboard requires login', status==302 and headers['Location']=='/login')
    for path in ['/api/status','/api/history','/api/log.csv','/api/database','/api/mqtt-config.js']:
        check('Unauthenticated access is denied: '+path, http(url,path)[0]==401)
    check('Wrong web password is rejected',http(url,'/login',{'username':config['web']['username'],'password':'wrong'})[0]==401)
    status, headers, _ = http(url,'/login',config['web'])
    cookie=headers.get('Set-Cookie','').split(';')[0]
    check('Login creates a protected session cookie',status==200 and 'HttpOnly' in headers['Set-Cookie'] and 'SameSite=Strict' in headers['Set-Cookie'])
    check('Session can read SQLite summary',http(url,'/api/database',headers={'Cookie':cookie})[0]==200)
    check('Foreign-origin control is rejected',http(url,'/api/control',{'kind':'mode','value':'AUTO'},{'Cookie':cookie,'Origin':'https://outside.invalid'})[0]==403)
    http(url,'/logout',{}, {'Cookie':cookie})
    check('Logout invalidates the saved session',http(url,'/api/status',headers={'Cookie':cookie})[0]==401)
    # Keep a second session to prove it survives the server restart.
    _, headers, _=http(url,'/login',config['web'])
    saved_cookie=headers['Set-Cookie'].split(';')[0]

    def probe(account=None, subscribe=None, publish=None, websocket=False):
        connected=threading.Event();finished=threading.Event();result={}
        client=mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,client_id='security-'+uuid.uuid4().hex[:10],transport='websockets' if websocket else 'tcp',reconnect_on_failure=False)
        if account: client.username_pw_set(account['username'],account['password'])
        if websocket: client.ws_set_options(path='/mqtt')
        def on_connect(c,u,f,reason,p):
            result['connect']=reason.value;connected.set()
            if reason.is_failure: finished.set()
            elif subscribe: c.subscribe(subscribe,qos=1)
            elif publish: c.publish(publish,'{"presence":1}',qos=1)
            else: finished.set()
        def on_subscribe(c,u,mid,reasons,p):
            result['subscribe']=[r.value for r in reasons];finished.set()
        def on_disconnect(c,u,f,reason,p):
            result['disconnect']=True;finished.set()
        client.on_connect=on_connect;client.on_subscribe=on_subscribe;client.on_disconnect=on_disconnect
        client.connect('127.0.0.1',config['mqtt']['wsPort' if websocket else 'port'],30)
        client.loop_start()
        try:
            assert connected.wait(5),'MQTT CONNACK timed out'
            assert finished.wait(5),'MQTT authorization response timed out'
            return result
        finally:
            client.disconnect();client.loop_stop()
    device=next(a for a in config['accounts'] if a['role']=='device')
    operator=next(a for a in config['accounts'] if a['role']=='operator')
    check('Anonymous MQTT connection is rejected',probe()['connect']!=0)
    check('Wrong MQTT password is rejected',probe({**device,'password':'wrong'})['connect']!=0)
    check('Device cannot subscribe outside its room',probe(device,subscribe='another/room/#')['subscribe']==[128])
    check('WebSocket MQTT authenticates the voice account',probe(operator,websocket=True)['connect']==0)
    result=probe(operator,publish=config['baseTopic']+'/sensor/motion')
    check('Voice account cannot forge sensor data',result.get('disconnect') is True)
    return saved_cookie

def verify_database(url, request, saved_cookie, check):
    check('Web session survives service restart',http(url,'/api/database',headers={'Cookie':saved_cookie})[0]==200)
    summary=request('/api/database')
    check('SQLite contains telemetry and authentication audit',summary['driver']=='SQLite' and summary['records']>5 and summary['authEvents']>5 and summary['users']==5)
    history=request('/api/history?limit=5')
    check('History SQL limit and event filters work',len(history)<=5 and all(r['event']=='sensor:temp_humid' for r in request('/api/history?event=sensor%3Atemp_humid&limit=3')))
    try:
        request('/api/history?limit=501')
        raise AssertionError('Oversized history query must fail')
    except HTTPError as error:
        check('Invalid database query returns HTTP 400',error.code==400)
