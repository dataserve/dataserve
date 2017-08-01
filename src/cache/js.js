"use strict"

const _object = require("lodash/object");
var LRU = require("lru-cache");

class CacheJS {

    constructor(config) {
        let opt = {
            max: config.size,
            length: function (n, key) { return 1; },
        };
        this._cache = LRU(opt);
    }

    get_all() {
        let output = {};
        let keys = this._cache.keys();
        for (let key of keys) {
            output[key] = this._cache.peek(key);
        }
        return Promise.resolve(output);
    }
    
    get(db_table, field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        let output = {};
        for (let key of keys) {
            let val = this._cache.get(db_table + ":" + field + ":" + key);
            if (typeof val !== "undefined") {
                output[key] = val;
            }
        }
        return Promise.resolve(output);
    }

    set(db_table, field, vals) {
        for (let key in vals) {
            this._cache.set(db_table + ":" + field + ":" + key, vals[key]);
        }
        return Promise.resolve(vals);
    }

    del(db_table, field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        for (let key of keys) {
            this._cache.del(db_table + ":" + field + ":" + key);
        }
        return Promise.resolve(true);
    }

    del_all() {
        this._cache.reset();
        return Promise.resolve(true);
    }
    
}

module.exports = CacheJS;
