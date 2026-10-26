'use strict';
(function(){
const el=id=>document.getElementById(id);
let lastRoute=null;
function add(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;}
function dateText(t){return new Date(t).toLocaleString(undefined,{weekday:'short',hour:'2-digit',minute:'2-digit'});}
function show(){if(!lastRoute)return;const r=lastRoute.route;const activity=el('activity').value;
const pref=WeatherEngine.normalizePreferences({idealMin:el('pref-min').value,idealMax:el('pref-max').value,rainTolerance:el('pref-rain').value,windTolerance:el('pref-wind').value});
const base=Math.ceil(Date.now()/3600000)*3600000+Number(el('route-departure').value)*3600000;
const options=RouteEngine.compare(r,[base,base+3600000,base+7200000],activity,pref);
const root=el('route-options');root.replaceChildren();
if(!options.length){root.append(add('p','muted','Not enough forecast coverage for these departure times. Try a different route.'));return;}
options.forEach((o,i)=>{const card=add('article','card route-option'+(i===0?' featured':''));card.append(add('p','eyebrow',i===0?'BEST OF COMPARED DEPARTURES':'ALTERNATIVE DEPARTURE'));card.append(add('h3','',`${dateText(o.departure)} · ${o.score}/100`));card.append(add('p','muted',`Estimated arrival ${dateText(o.arrival)} · Weakest conditions near ${o.weakest}`));const list=add('div','route-points');o.points.forEach(p=>{const point=add('div','route-point');point.append(add('strong','',p.label),add('span','',`${Math.round(p.slot.tempC)}°C · ${p.slot.rainProbability}% rain · ${p.slot.windKmh} km/h wind`),add('small','',`Score ${p.score}/100 · forecast ${dateText(p.slot.time)}`));list.append(point);});card.append(list);root.append(card);});
}
el('route-form').addEventListener('submit',async event=>{event.preventDefault();const from=el('route-from').value.trim(),to=el('route-to').value.trim();const status=el('route-status'),btn=el('route-submit');btn.disabled=true;status.textContent='Finding route and sampling forecasts…';status.classList.remove('error');
try{const response=await fetch(`/api/route-weather?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);const data=await response.json();if(!response.ok)throw new Error(data.error||'Route unavailable');lastRoute=data;el('route-summary').textContent=`${data.from} → ${data.to} · ${data.route.distanceKm} km · approximately ${data.route.durationMinutes} min driving (no traffic)`;el('route-results').hidden=false;show();status.textContent='Route comparison ready.';}
catch(err){status.textContent=err.message||'Route unavailable';status.classList.add('error');}
finally{btn.disabled=false;}});
['route-departure','activity','pref-min','pref-max','pref-rain','pref-wind'].forEach(id=>el(id).addEventListener('change',show));
})();
