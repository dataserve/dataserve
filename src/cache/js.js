'use strict';

const Promise = require('bluebird');
const LRU = require('lru-cache');

class CacheJS {

    constructor(config, log) {
        this.log = log;
        
        let opt = {
            max: config.size,
            length: function (n, key) { return 1; },
        };
        
        this.cache = LRU(opt);
    }

    key(dbTable, field, key) {
        return dbTable + ':' + field + ':' + key
    }
    
    getAll() {
        let output = {};
        
        return this.log.add('cache,cache:getAll', () => {
            let keys = this.cache.keys();

            keys.forEach((key) => {
                output[key] = this.cache.peek(key);
            });
            
            return Promise.resolve(output);
        });
    }
    
    get(dbTable, field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        
        return this.log.add('cache,cache:get', () => {
            let output = {};

            keys.forEach((key) => {
                let val = this.cache.get(this.key(dbTable, field, key));
                
                if (typeof val !== 'undefined') {
                    output[key] = val;
                }
            });
            
            return Promise.resolve(output);
        });
    }

    set(dbTable, field, vals) {
        return this.log.add('cache,cache:set', () => {
            Object.keys(vals).forEach((key) => {
                this.cache.set(this.key(dbTable, field, key), vals[key]);
            });
            
            return Promise.resolve(vals);
        });
    }

    del(dbTable, field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        
        return this.log.add('cache,cache:del', () => {
            keys.forEach((key) => {
                this.cache.del(this.key(dbTable, field, key));
            });
            
            return Promise.resolve(true);
        });
    }
        
    delAll() {
        return this.log.add('cache,cache:delAll', () => {
            this.cache.reset();
            
            return Promise.resolve(true);
        });
    }
    
}

module.exports = CacheJS;
