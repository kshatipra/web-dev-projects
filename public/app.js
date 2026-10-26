'use strict';
const $=selector=>document.querySelector(selector);
const icons={Clear:'☀',Clouds:'☁',Rain:'☂',Drizzle:'☂',Snow:'❄',Thunderstorm:'ϟ',Mist:'≋',Fog:'≋',Haze:'≋',Smoke:'≋'};
const form=$('#search-form'),input=$('#city'),button=$('#search-button'),status=$('#status');
let forecast=null,controller=null,requestId=0,currentCity='';
const STORAGE='weatherwise:v3:';
function readStorage(key,fallback){try{const v=JSON.parse(localStorage.getItem(STORAGE+key));return v??fallback;}catch{return fallback;}}
function writeStorage(key,value){try{localStorage.setItem(STORAGE+key,JSON.stringify(value));}catch{/* private browsing or disabled storage */}}
let savedCities=readStorage('cities',[]);
if(!Array.isArray(savedCities))savedCities=[];
savedCities=savedCities.filter(c=>typeof c==='string'&&c.length<=80).slice(0,8);
const defaults={idealMin:12,idealMax:24,rainTolerance:50,windTolerance:50};
const initialPrefs=WeatherEngine.normalizePreferences(readStorage('prefs',defaults));
function preferences(){return WeatherEngine.normalizePreferences({idealMin:$('#pref-min').value,idealMax:$('#pref-max').value,rainTolerance:$('#pref-rain').value,windTolerance:$('#pref-wind').value});}
function syncPrefs(p){$('#pref-min').value=p.idealMin;$('#pref-max').value=p.idealMax;$('#pref-rain').value=p.rainTolerance;$('#pref-wind').value=p.windTolerance;$('#rain-value').textContent=`${p.rainTolerance}/100`;$('#wind-value').textContent=`${p.windTolerance}/100`;}
function renderCities(){const root=$('#saved-cities');root.replaceChildren();if(!savedCities.length){root.append(element('span','muted','Saved cities will appear here, on this device.'));return;}savedCities.forEach(city=>{const chip=element('span','city-chip');const load=element('button','city-open',city);load.type='button';load.addEventListener('click',()=>{input.value=city;form.requestSubmit();});const remove=element('button','city-remove','×');remove.type='button';remove.setAttribute('aria-label',`Remove ${city}`);remove.addEventListener('click',()=>{savedCities=savedCities.filter(c=>c!==city);writeStorage('cities',savedCities);renderCities();});chip.append(load,remove);root.append(chip);});}
syncPrefs(initialPrefs);renderCities();
for(const id of ['#pref-min','#pref-max','#pref-rain','#pref-wind']){$(id).addEventListener('input',()=>{const p=preferences();$('#rain-value').textContent=`${p.rainTolerance}/100`;$('#wind-value').textContent=`${p.windTolerance}/100`;writeStorage('prefs',p);renderPlanner();});}
$('#reset-prefs').addEventListener('click',()=>{syncPrefs(defaults);writeStorage('prefs',defaults);renderPlanner();});
$('#save-city').addEventListener('click',()=>{if(!currentCity)return;savedCities=[currentCity,...savedCities.filter(c=>c.toLocaleLowerCase()!==currentCity.toLocaleLowerCase())].slice(0,8);writeStorage('cities',savedCities);renderCities();});
function setStatus(msg,error=false){status.textContent=msg;status.classList.toggle('error',error);}
function element(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el;}
function timeLabel(ms,offset){const date=new Date(ms+offset*1000);return date.toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'UTC'});}
function renderCurrent(data){
  $('#place').textContent=[data.city,data.country].filter(Boolean).join(', ');
  $('#description').textContent=data.description;
  $('#weather-symbol').textContent=icons[data.condition]||'◌';
  $('#temperature').textContent=`${Math.round(data.tempC)}°`;
  $('#feels').textContent=`${Math.round(data.feelsLikeC)}°C`;
  $('#humidity').textContent=`${data.humidity}%`;
  $('#wind').textContent=`${data.windKmh} km/h`;
}
function infoCard(slot,offset,top=false){
  const card=element('article','option card'+(top?' featured':''));
  const head=element('div','option-head');head.append(element('span','time',timeLabel(slot.time,offset)),element('span','rating',slot.label));card.append(head);
  const line=element('div','score-line');line.append(element('strong','score',`${slot.score}/100`),element('span','muted',`${Math.round(slot.tempC)}°C · ${slot.rainProbability}% rain · ${slot.windKmh} km/h wind`));card.append(line);
  card.append(element('div','score-track'));card.lastChild.append(element('div','score-fill'));card.lastChild.firstChild.style.width=`${slot.score}%`;
  card.append(element('p','reason',slot.reasons.join(' · ')));
  if(top){const p=slot.penalties;card.append(element('p','breakdown',`Penalty breakdown: temperature −${Math.round(p.temperature)}, rain −${Math.round(p.rain)}, wind −${Math.round(p.wind)}`));}
  return card;
}
function renderPlanner(){
  if(!forecast)return;
  const activity=$('#activity').value,offset=forecast.timezoneOffsetSeconds||0;
  const ranked=WeatherEngine.rank(forecast.slots,activity,Date.now(),preferences());
  const rec=$('#recommendations');rec.replaceChildren();
  if(!ranked.length)rec.append(element('p','muted','No upcoming forecast slots are available.'));
  else ranked.slice(0,3).forEach((slot,i)=>rec.append(infoCard(slot,offset,i===0)));
  const departure=$('#departure-options');departure.replaceChildren();
  const options=WeatherEngine.departureOptions(forecast.slots,activity,Date.now(),preferences());
  if(!options.length)departure.append(element('p','muted','No upcoming forecast slots available.'));
  else {const best=Math.max(...options.map(o=>o.score));options.forEach(o=>{const card=infoCard(o,offset);if(o.score===best)card.prepend(element('span','best','BEST OF NEXT 3 SLOTS'));departure.append(card);});}
}
form.addEventListener('submit',async e=>{
  e.preventDefault();const city=input.value.trim();if(!city){setStatus('Enter a city.',true);return;}
  if(controller)controller.abort();const thisRequest=++requestId;controller=new AbortController();
  button.disabled=true;setStatus('Checking weather and ranking forecast windows…');
  try{
    const res=await fetch(`/api/weather?city=${encodeURIComponent(city)}`,{signal:controller.signal});
    const data=await res.json();if(!res.ok)throw new Error(data.error||'Weather lookup failed.');
    if(thisRequest!==requestId)return;
    if(!data.forecast?.slots?.length)throw new Error('No forecast slots available for this city.');
    forecast=data.forecast;currentCity=[data.current.city,data.current.country].filter(Boolean).join(", ");$('#save-city').disabled=false;renderCurrent(data.current);renderPlanner();$('#dashboard').hidden=false;setStatus('Forecast ready. Choose an activity to compare conditions.');
  }catch(err){if(err.name!=='AbortError'&&thisRequest===requestId)setStatus(err.message||'Unable to load weather.',true);}
  finally{if(thisRequest===requestId)button.disabled=false;}
});
$('#activity').addEventListener('change',renderPlanner);
