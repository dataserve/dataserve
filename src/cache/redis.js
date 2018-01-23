'use strict';

const bluebird = require('bluebird');
const redis = require('redis');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

class CacheRedis {

    constructor(config, log) {
        this.log = log;
        
        this.cache = redis.createClient(config);
    }

    key(dbTable, field, key) {
        return dbTable + ':' + field + ':' + key
    }
    
    getAll() {
        let output = {};
        
        return this.log.add('cache,cache:getAll', () => {
            return this.cache.keysAsync('*');
        }).then((cacheKeys) => {
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
            keys.forEach((key) => {
                cacheKeys.push(this.key(dbTable, field, key));
            });
        }
        
        let output = {};
        
        return this.log.add('cache,cache:get', () => {
            return this.cache.mgetAsync(cacheKeys)
        }).then((res) => {
            let output = {};

            keys.forEach((key) => {
                let val = res.shift();
                
                if (val === null) {
                    return;
                }
                
                output[key] = JSON.parse(val);
            });
            
            return output;
        });
    }

    set(dbTable, field, vals) {
        let input = [];

        Object.keys(vals).forEach((key) => {
            let val = JSON.stringify(vals[key]);
            
            input.push(this.key(dbTable, field, key));
            
            input.push(val);
        });
        
        return this.log.add('cache,cache:set', () => {
            return this.cache.msetAsync(input);
        }).then((res) => {
            return vals;
        });
    }

    del(dbTable, field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        
        let cacheKeys = [];

        keys.forEach((key) => {
            cacheKeys.push(this.key(dbTable, field, key));
        });
        
        return this.log.add('cache,cache:del', () => {
            return this.cache.delAsync(cacheKeys);
        });
    }

    delAll() {
        return this.log.add('cache,cache:delAll', () => {
            return this.cache.flushdbAsync();
        });
    }
    
}

module.exports = CacheRedis;
