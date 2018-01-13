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

module.exports.loadJson = function(path) {
    return JSON.parse(JSON.stringify(require(path)));
}

module.exports.randomString = function(length, chars) {
    let mask = '';
    
    if (chars.indexOf('a') > -1) {
        mask += 'abcdefghijklmnopqrstuvwxyz';
    }
    
    if (chars.indexOf('A') > -1) {
        mask += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }
    
    if (chars.indexOf('#') > -1) {
        mask += '0123456789';
    }
    
    if (chars.indexOf('!') > -1) {
        mask += '~`!@#$%^&*()_+-={}[]:";\'<>?,./|\\';
    }
    
    let result = '';
    
    for (var i = length; i > 0; --i) {
        result += mask[Math.floor(Math.random() * mask.length)];
    }
    
    return result;
}
