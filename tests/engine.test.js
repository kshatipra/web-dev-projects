'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {evaluate,rank,departureOptions}=require('../public/engine');
const good={time:Date.now()+3600000,tempC:18,feelsLikeC:18,windKmh:8,rainProbability:0};
test('ideal conditions score 100',()=>assert.equal(evaluate(good,'cycle').score,100));
test('rain and wind lower scores',()=>assert.ok(evaluate({...good,windKmh:45,rainProbability:95},'cycle').score<evaluate(good,'cycle').score));
test('scores stay between 0 and 100',()=>assert.ok(evaluate({...good,feelsLikeC:-40,windKmh:100,rainProbability:100},'run').score>=0));
test('ranks highest score first',()=>assert.equal(rank([{...good,windKmh:40},{...good,time:good.time+3600000}], 'cycle')[0].windKmh,8));
test('departure returns chronological next 3 slots',()=>assert.equal(departureOptions([good,{...good,time:good.time+3600000},{...good,time:good.time+7200000},{...good,time:good.time+10800000}]).length,3));
