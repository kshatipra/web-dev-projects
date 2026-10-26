'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RouteEngine=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  // Nearest 3-hour forecast slot to estimated point arrival. Does not interpolate or claim minute accuracy.
  function closest(slots,target){if(!Array.isArray(slots)||!slots.length)return null;return slots.reduce((a,b)=>Math.abs(b.time-target)<Math.abs(a.time-target)?b:a);}
  function evaluateDeparture(route,departMs,activity='cycle',preferences=null){
    if(!route?.samples?.length||!Number.isFinite(route.durationMinutes))return null;
    const total=route.durationMinutes*60000;
    const points=route.samples.map(point=>{
      const arrival=departMs+total*point.fraction;
      const slot=closest(point.slots,arrival);
      if(!slot||Math.abs(slot.time-arrival)>2*60*60*1000)return null;
      return {...WeatherEngine.evaluate(slot,activity,preferences),label:point.label,arrival,slot};
    });
    if(points.some(p=>!p))return null;
    const average=Math.round(points.reduce((sum,p)=>sum+p.score,0)/points.length);
    const weakest=points.reduce((a,b)=>b.score<a.score?b:a);
    return {departure:departMs,arrival:departMs+total,score:average,weakest:weakest.label,points};
  }
  function compare(route,departures,activity,preferences){return departures.map(d=>evaluateDeparture(route,d,activity,preferences)).filter(Boolean).sort((a,b)=>b.score-a.score||a.departure-b.departure);}
  return {closest,evaluateDeparture,compare};
});
