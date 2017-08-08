"use strict"

const Memcache = require('memcached-promisify');

class CacheMemcache {

    constructor(config) {
        //ignore "type" key
        if (1 < Object.keys(config)) {
            if (!config.hosts) {
                throw Error("Memcache requires {hosts} config option");
            }
            this.cache = new Memcache(config.hosts, config);
        } else {
            this.cache = new Memcache();
        }
    }

    key(dbTable, field, key) {
        return dbTable + ":" + field + ":" + key
    }
    
    getAll() {
        return Promise.reject("not supported by memcache");
    }
    
    get(dbTable, field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        let cacheKeys = [], lookup = {};
        for (let key of keys) {
            cacheKeys.push(this.key(dbTable, field, key));
            lookup[key] = this.key(dbTable, field, key);
        }
        let output = {};
        return this.cache.getMulti(cacheKeys)
            .then(res => {
                let output = {};
                for (let key of keys) {
                    let val = res[lookup[key]];
                    if (typeof val === "undefined") {
                        continue;
                    }
                    if (val === "<null>") {
                        val = null;
                    } else {
                        val = JSON.parse(val);
                    }
                    output[key] = val;
                }
                return output;
            });
    }

    set(dbTable, field, vals) {
        let promises = [];
        for (let key in vals) {
            let val = vals[key];
            if (val === null) {
                val = "<null>";
            } else {
                val = JSON.stringify(val);
            }
            promises.push(this.cache.set(this.key(dbTable, field, key), val, 0));
        }
        return Promise.all(promises);
    }

    del(dbTable, field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        let promises = [];
        for (let key of keys) {
            promises.push(this.cache.del(this.cacheKey(dbTable, field, key)));
        }
        return Promise.all(promises);
    }

    delAll() {
        return new Promise((resolve, reject) => {
            this.cache._cache.flush(() => {
                resolve();
            });
        });
    }
    
}

module.exports = CacheMemcache;
