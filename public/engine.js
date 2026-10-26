'use strict';
// Transparent heuristic, not a meteorological forecast or safety assessment.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WeatherEngine=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const activities={
    walk:{label:'Walking',ideal:[12,24],wind:25,rain:35},
    run:{label:'Running',ideal:[7,19],wind:22,rain:25},
    cycle:{label:'Cycling',ideal:[10,24],wind:18,rain:20},
    photo:{label:'Photography',ideal:[8,26],wind:30,rain:20},
    outdoors:{label:'Outdoor work',ideal:[8,25],wind:25,rain:20}
  };
  function clamp(n){return Math.max(0,Math.min(100,Math.round(n)));}
  function normalizePreferences(raw={}){
    const n=(value,fallback,min,max)=>{const v=Number(value);return value!==''&&value!==null&&value!==undefined&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;};
    const idealMin=n(raw.idealMin,12,-30,45),idealMax=n(raw.idealMax,24,-30,50);
    return {idealMin:Math.min(idealMin,idealMax),idealMax:Math.max(idealMin,idealMax),rainTolerance:n(raw.rainTolerance,50,0,100),windTolerance:n(raw.windTolerance,50,0,100)};
  }
  function evaluate(slot,activity='walk',preferences=null){
    const base=activities[activity]||activities.walk;
    const p=preferences?normalizePreferences(preferences):null;
    const a=p?{...base,ideal:[p.idealMin,p.idealMax],wind:base.wind+(p.windTolerance-50)*0.2,rain:base.rain+(p.rainTolerance-50)*0.4}:base;
    const temp=Number(slot.feelsLikeC??slot.tempC);
    const wind=Number(slot.windKmh);
    const rain=Number(slot.rainProbability);
    const outside=temp<a.ideal[0]?a.ideal[0]-temp:temp>a.ideal[1]?temp-a.ideal[1]:0;
    const penalties={temperature:Math.min(35,outside*3),rain:Math.min(45,rain*(p?0.45*(1.5-p.rainTolerance/100):0.45)),wind:Math.min(30,Math.max(0,wind-a.wind)*(p?2*(1.5-p.windTolerance/100):2))};
    const score=clamp(100-penalties.temperature-penalties.rain-penalties.wind);
    const reasons=[];
    if(rain>a.rain)reasons.push(`${rain}% precipitation probability`);
    if(wind>a.wind)reasons.push(`wind ${wind} km/h`);
    if(outside>0)reasons.push(`feels like ${Math.round(temp)}°C`);
    if(!reasons.length)reasons.push('comfortable temperature, relatively low wind and rain risk');
    return {score,reasons,penalties,label:score>=80?'Great':score>=60?'Good':score>=40?'Fair':'Poor'};
  }
  function rank(slots,activity,now=Date.now(),preferences=null){
    return slots.filter(s=>s.time>=now-60*60*1000).map(s=>({...s,...evaluate(s,activity,preferences)})).sort((a,b)=>b.score-a.score||a.time-b.time);
  }
  function departureOptions(slots,activity='cycle',now=Date.now(),preferences=null){
    const upcoming=slots.filter(s=>s.time>=now-60*60*1000).sort((a,b)=>a.time-b.time);
    return upcoming.slice(0,3).map((s,i)=>({...s,...evaluate(s,activity,preferences),note:i===0?'Earliest available forecast slot':`Forecast slot ${i+1}`}));
  }
  return {activities,evaluate,rank,departureOptions,normalizePreferences};
});
