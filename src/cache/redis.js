"use strict"

const bluebird = require("bluebird");
const redis = require("redis");

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

class CacheRedis {

    constructor(config) {
        this.cache = redis.createClient(config);
    }

    key(dbTable, field, key) {
        return dbTable + ":" + field + ":" + key
    }
    
    getAll() {
        let output = {};
        return this.cache.keysAsync("*")
            .then(cacheKeys => {
                if (!cacheKeys.length) {
                    return [];
                }
                return this.get(null, null, cacheKeys, true);
            });
    }
    
    get(dbTable, field, keys, keysRaw=false) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        let cacheKeys = [];
        if (keysRaw) {
            cacheKeys = keys;
        } else {
            for (let key of keys) {
                cacheKeys.push(this.key(dbTable, field, key));
            }
        }
        let output = {};
        return this.cache.mgetAsync(cacheKeys)
            .then(res => {
                let output = {};
                for (let key of keys) {
                    let val = res.shift();
                    if (val === null) {
                        continue;
                    }
                    output[key] = JSON.parse(val);
                }
                return output;
            });
    }

    set(dbTable, field, vals) {
        let input = [];
        for (let key in vals) {
            let val = JSON.stringify(vals[key]);
            input.push(this.key(dbTable, field, key));
            input.push(val);
        }
        return this.cache.msetAsync(input)
            .then(res => {
                return vals;
            });
    }

    del(dbTable, field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        let cacheKeys = [];
        for (let key of keys) {
            cacheKeys.push(this.key(dbTable, field, key));
        }
        return this.cache.delAsync(cacheKeys);
    }

    delAll() {
        return this.cache.flushdbAsync();
    }
    
}

module.exports = CacheRedis;
