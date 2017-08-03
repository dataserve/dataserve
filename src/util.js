"use strict"

const _array = require("lodash/array");

module.exports.int_array = function(arr) {
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

module.exports.param_f = function(arr, param, def) {
    return arr[param] ? arr[param] : def;
}

module.exports.param_fo = function(arr, param) {
    return module.exports.param_f(arr, param, {});
}
