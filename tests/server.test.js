'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateCity,normalizeForecast,normalizeCurrent,limit}=require('../server');
test('city validation',()=>{assert.equal(validateCity('München'),true);assert.equal(validateCity(''),false);assert.equal(validateCity('a&appid=bad'),false);});
test('normalizes 3-hour forecast units',()=>{const data=normalizeForecast({city:{timezone:3600},list:[{dt:1760000000,main:{temp:10,feels_like:9,humidity:75},wind:{speed:5},pop:0.7,weather:[{main:'Rain',description:'rain'}]}]});assert.equal(data.slots[0].windKmh,18);assert.equal(data.slots[0].rainProbability,70);assert.equal(data.timezoneOffsetSeconds,3600);});
test('current weather normalization',()=>{const d=normalizeCurrent({name:'Berlin',sys:{country:'DE'},main:{temp:12,feels_like:10,humidity:60},wind:{speed:2},weather:[{main:'Clear',description:'clear sky'}]});assert.equal(d.windKmh,7);});
test('rate limiter allows first request',()=>assert.equal(limit('test-unique-ip'),false));
