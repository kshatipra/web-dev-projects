'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {URL} = require('node:url');
const ROOT = path.join(__dirname,'public');
const PORT = Number(process.env.PORT || 3000);
const cache = new Map();
const rate = new Map();
const ASSETS = {'/':'index.html','/style.css':'style.css','/app.js':'app.js','/engine.js':'engine.js','/route-engine.js':'route-engine.js','/route-app.js':'route-app.js'};
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function limit(ip,now=Date.now()){
  const hits=(rate.get(ip)||[]).filter(t=>now-t<60000);
  if(hits.length>=30){rate.set(ip,hits);return true;}
  hits.push(now);rate.set(ip,hits);
  if(rate.size>1000)rate.delete(rate.keys().next().value);
  return false;
}
function validateCity(city){return city.length>0&&city.length<=80&&/^[\p{L}\p{M}0-9 .,'()\-]+$/u.test(city);}
function normalizeCurrent(d){
  if(!d?.main||!d?.wind||!d?.weather?.[0]||!Number.isFinite(d.main.temp))throw new Error('Malformed weather data');
  return {city:d.name||'',country:d.sys?.country||'',tempC:d.main.temp,feelsLikeC:d.main.feels_like,humidity:d.main.humidity,windKmh:Math.round(d.wind.speed*3.6),condition:d.weather[0].main,description:d.weather[0].description};
}
function normalizeForecast(d){
  if(!Array.isArray(d?.list))throw new Error('Malformed forecast data');
  return {timezoneOffsetSeconds:Number(d.city?.timezone)||0, slots:d.list.filter(x=>Number.isFinite(x.dt)&&x.main&&x.wind&&x.weather?.[0]).map(x=>({time:x.dt*1000,tempC:x.main.temp,feelsLikeC:x.main.feels_like,humidity:x.main.humidity,windKmh:Math.round(x.wind.speed*3.6),rainProbability:Math.round((x.pop||0)*100),condition:x.weather[0].main,description:x.weather[0].description})).slice(0,40)};
}
async function upstream(endpoint,city){
  const u=new URL(`https://api.openweathermap.org/data/2.5/${endpoint}`);
  u.searchParams.set('q',city);u.searchParams.set('units','metric');u.searchParams.set('appid',process.env.OPENWEATHER_API_KEY);
  const response=await fetch(u,{signal:AbortSignal.timeout(8000)});
  if(response.status===404){const e=new Error('City not found. Check the spelling.');e.status=404;throw e;}
  if(response.status===401||response.status===403){const e=new Error('Weather provider rejected the API key.');e.status=503;throw e;}
  if(response.status===429){const e=new Error('Weather provider rate limit reached.');e.status=503;throw e;}
  if(!response.ok){const e=new Error('Weather provider is temporarily unavailable.');e.status=502;throw e;}
  return response.json();
}
async function getWeather(city){
  const key=city.toLocaleLowerCase();const existing=cache.get(key);
  if(existing&&Date.now()-existing.time<10*60*1000)return existing.data;
  const [current,forecast]=await Promise.all([upstream('weather',city),upstream('forecast',city)]);
  const data={current:normalizeCurrent(current),forecast:normalizeForecast(forecast)};
  cache.set(key,{time:Date.now(),data});if(cache.size>100)cache.delete(cache.keys().next().value);
  return data;
}

// Public OSRM demo routing is best-effort, not guaranteed production availability.
// This endpoint intentionally supports driving only; it does not model traffic or transit.
const routeCache = new Map();
async function requestJson(url,timeout=7500){
  const r=await fetch(url,{signal:AbortSignal.timeout(timeout),headers:{'User-Agent':'WeatherWisePortfolio/4.0 (educational route weather planner)'}});
  if(!r.ok)throw new Error(`Provider HTTP ${r.status}`);
  return r.json();
}
async function geocodeCity(city){
  const u=new URL('https://api.openweathermap.org/geo/1.0/direct');
  u.searchParams.set('q',city);u.searchParams.set('limit','1');u.searchParams.set('appid',process.env.OPENWEATHER_API_KEY);
  const result=await requestJson(u);
  if(!Array.isArray(result)||!result.length||!Number.isFinite(result[0].lat)||!Number.isFinite(result[0].lon)){
    const e=new Error(`Cannot find location: ${city}`);e.status=404;throw e;
  }
  return {name:result[0].name,country:result[0].country,lat:result[0].lat,lon:result[0].lon};
}
function routeSamples(route){
  const coords=route.geometry?.coordinates;
  if(!Array.isArray(coords)||coords.length<2)throw new Error('Routing provider returned invalid geometry');
  // Use cumulative geometry distances to select points near 0%, 50%, 100%.
  const rad=Math.PI/180;
  const dist=(a,b)=>{const dLat=(b[1]-a[1])*rad,dLon=(b[0]-a[0])*rad;const h=Math.sin(dLat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));};
  const cumulative=[0];for(let i=1;i<coords.length;i++)cumulative.push(cumulative[i-1]+dist(coords[i-1],coords[i]));
  const total=cumulative.at(-1);
  const midpoint=total/2;let mid=0;while(mid<cumulative.length-1&&cumulative[mid]<midpoint)mid++;
  return [coords[0],coords[mid],coords.at(-1)].map(([lon,lat])=>({lat,lon}));
}
async function getRouteWeather(from,to){
  const cacheKey=`${from.toLowerCase()}|${to.toLowerCase()}`;
  const hit=routeCache.get(cacheKey);if(hit&&Date.now()-hit.time<10*60*1000)return hit.data;
  const [start,end]=await Promise.all([geocodeCity(from),geocodeCity(to)]);
  const u=new URL(`https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}`);
  u.searchParams.set('overview','full');u.searchParams.set('geometries','geojson');u.searchParams.set('steps','false');
  let route;
  try{const d=await requestJson(u,10000);if(d.code!=='Ok'||!d.routes?.length)throw new Error('No driving route found');route=d.routes[0];}
  catch(e){const err=new Error('Driving route unavailable. Try cities connected by road.');err.status=502;throw err;}
  if(!Number.isFinite(route.distance)||!Number.isFinite(route.duration))throw new Error('Invalid route metrics');
  const samples=routeSamples(route);
  const forecasts=await Promise.all(samples.map(async (point)=>{
    const u=new URL('https://api.openweathermap.org/data/2.5/forecast');
    u.searchParams.set('lat',String(point.lat));u.searchParams.set('lon',String(point.lon));u.searchParams.set('units','metric');u.searchParams.set('appid',process.env.OPENWEATHER_API_KEY);
    return normalizeForecast(await requestJson(u));
  }));
  const data={from:start.name,to:end.name,route:{distanceKm:Math.round(route.distance/1000),durationMinutes:Math.round(route.duration/60),samples:samples.map((point,i)=>({...point,label:['Origin','Mid-route','Destination'][i],fraction:i/2,slots:forecasts[i].slots}))},notice:'OSRM driving route; weather sampled at three points using 3-hour forecasts. Route time excludes live traffic. Not a navigation or safety service.'};
  routeCache.set(cacheKey,{time:Date.now(),data});if(routeCache.size>50)routeCache.delete(routeCache.keys().next().value);
  return data;
}

async function handler(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'");
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  let url;try{url=new URL(req.url,'http://localhost');}catch{return json(res,400,{error:'Invalid request'});}
  if(url.pathname==='/api/route-weather'){
    const from=(url.searchParams.get('from')||'').trim(),to=(url.searchParams.get('to')||'').trim();
    if(!validateCity(from)||!validateCity(to)||from.toLowerCase()===to.toLowerCase())return json(res,400,{error:'Enter two different valid cities.'});
    if(limit(req.socket.remoteAddress||'unknown'))return json(res,429,{error:'Too many requests. Try again in a minute.'});
    if(!process.env.OPENWEATHER_API_KEY)return json(res,503,{error:'Set OPENWEATHER_API_KEY on the server.'});
    try{return json(res,200,await getRouteWeather(from,to));}
    catch(e){return json(res,e.status||502,{error:e.status?e.message:'Route or forecast provider is unavailable. Please try again.'});}
  }
  if(url.pathname==='/api/weather'){
    const city=(url.searchParams.get('city')||'').trim();
    if(!validateCity(city))return json(res,400,{error:'Enter a valid city (up to 80 characters).'});
    if(limit(req.socket.remoteAddress||'unknown'))return json(res,429,{error:'Too many requests. Try again in a minute.'});
    if(!process.env.OPENWEATHER_API_KEY)return json(res,503,{error:'Set OPENWEATHER_API_KEY on the server.'});
    try{return json(res,200,await getWeather(city));}catch(e){return json(res,e.status||502,{error:e.status?e.message:'Unable to load forecast. Check your connection and try again.'});}
  }
  const file=ASSETS[url.pathname];if(!file)return json(res,404,{error:'Not found'});
  try{const body=await fs.readFile(path.join(ROOT,file));const mime=file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html';res.writeHead(200,{'Content-Type':`${mime}; charset=utf-8`,'Cache-Control':'no-cache'});res.end(body);}catch{return json(res,500,{error:'Cannot load application'});}
}
if(require.main===module)http.createServer(handler).listen(PORT,()=>console.log(`WeatherWise: http://localhost:${PORT}`));
module.exports={handler,limit,validateCity,normalizeForecast,normalizeCurrent,routeSamples};
