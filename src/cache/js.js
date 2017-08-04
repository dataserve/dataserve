"use strict"

const _object = require("lodash/object");
var LRU = require("lru-cache");

class CacheJS {

    constructor(config) {
        let opt = {
            max: config.size,
            length: function (n, key) { return 1; },
        };
        this.cache = LRU(opt);
    }

    getAll() {
        let output = {};
        let keys = this.cache.keys();
        for (let key of keys) {
            output[key] = this.cache.peek(key);
        }
        return Promise.resolve(output);
    }
    
    get(dbTable, field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        let output = {};
        for (let key of keys) {
            let val = this.cache.get(dbTable + ":" + field + ":" + key);
            if (typeof val !== "undefined") {
                output[key] = val;
            }
        }
        return Promise.resolve(output);
    }

    set(dbTable, field, vals) {
        for (let key in vals) {
            this.cache.set(dbTable + ":" + field + ":" + key, vals[key]);
        }
        return Promise.resolve(vals);
    }

    del(dbTable, field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        for (let key of keys) {
            this.cache.del(dbTable + ":" + field + ":" + key);
        }
        return Promise.resolve(true);
    }

    delAll() {
        this.cache.reset();
        return Promise.resolve(true);
    }
    
}

module.exports = CacheJS;
