'use strict';

const _array = require('lodash/array');

module.exports.camelize = function(str) {
    return str.replace(/[_.-](\w|$)/g, function (_,x) {
        return x.toUpperCase();
    });
};

module.exports.intArray = function(arr, allowZero=true) {
    if (!arr || !Array.isArray(arr)) {
        return [];
    }
    
    arr = arr.map(val => parseInt(val, 10));
    
    if (!allowZero) {
        arr = arr.filter(val => val !== 0);
    }
    
    return _array.uniq(arr);
}

module.exports.paramF = function(arr, param, def) {
    return arr[param] ? arr[param] : def;
}

module.exports.paramFo = function(arr, param) {
    return module.exports.paramF(arr, param, {});
}

module.exports.paramFn = function(arr, param) {
    return module.exports.paramF(arr, param, null);
}

module.exports.loadJson = function(path) {
    return JSON.parse(JSON.stringify(require(path)));
}

module.exports.randomString = function(length, chars) {
    let mask = '';
    
    if (-1 < chars.indexOf('a')) {
        mask += 'abcdefghijklmnopqrstuvwxyz';
    }
    
    if (-1 < chars.indexOf('A')) {
        mask += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }
    
    if (-1 < chars.indexOf('#')) {
        mask += '0123456789';
    }
    
    if (-1 < chars.indexOf('!')) {
        mask += '~`!@#$%^&*()_+-={}[]:";\'<>?,./|\\';
    }
    
    let result = '';

    let i = length;
    
    for (; 0 < i; --i) {
        result += mask[Math.floor(Math.random() * mask.length)];
    }
    
    return result;
}
