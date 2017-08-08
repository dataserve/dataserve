"use strict"

const _array = require("lodash/array");

module.exports.camelize = function(str) {
    return str.replace(/[_.-](\w|$)/g, function (_,x) {
        return x.toUpperCase();
    });
};

module.exports.intArray = function(arr) {
    if (!arr || !Array.isArray(arr)) {
        return [];
    }
    arr = arr.map(val => parseInt(val, 10));
    return _array.uniq(arr);
}

module.exports.r = function(success, result=null, meta={}){
    if (success) {
        return {
            status: true,
            result: result,
            meta: meta,
        };
    }
    let error = result.error || result;
    if (result instanceof Error) {
        //error = result.toString();
        error = result.stack;
    }
    return {
        status: false,
        error: error,
        meta: meta,
    };
}

module.exports.paramF = function(arr, param, def) {
    return arr[param] ? arr[param] : def;
}

module.exports.paramFo = function(arr, param) {
    return module.exports.paramF(arr, param, {});
}
