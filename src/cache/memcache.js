"use strict";

const Promise = require("bluebird");
const Memcache = require("memcached");

class CacheMemcache {

    constructor(config, log) {
        this.log = log;
        
        //ignore "type" key
        if (1 < Object.keys(config)) {
            if (!config.hosts) {
                throw Error("Memcache requires {hosts} config option");
            }
            
            this.cache = new Memcache(config.hosts, config);
        } else {
            this.cache = new Memcache();
        }
        
        this.promisify = {
            getMulti: Promise.promisify(this.cache.getMulti, {context: this.cache}),
            set: Promise.promisify(this.cache.set, {context: this.cache}),
            del: Promise.promisify(this.cache.del, {context: this.cache}),
            flush: Promise.promisify(this.cache.flush, {context: this.cache}),
        };
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
        
        return this.log.add("cache,cache:get", () => {
            return this.promisify.getMulti(cacheKeys);
        })
            .then(res => {
                let output = {};
                
                for (let key of keys) {
                    let val = res[lookup[key]];
                    
                    if (typeof val === "undefined") {
                        continue;
                    }
                    
                    output[key] = JSON.parse(val);
                }
                
                return output;
            });
    }

    set(dbTable, field, vals) {
        let promises = [];
        
        for (let key in vals) {
            let val = JSON.stringify(vals[key]);
            
            promises.push(this.promisify.set(this.key(dbTable, field, key), val, 0));
        }
        
        return this.log.add("cache,cache:set", () => {
            return Promise.all(promises);
        });
    }

    del(dbTable, field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        
        let promises = [];
        
        for (let key of keys) {
            promises.push(this.promisify.del(this.key(dbTable, field, key)));
        }
        
        return this.log.add("cache,cache:del", () => {
            return Promise.all(promises);
        });
    }

    delAll() {
        return this.log.add("cache,cache:delAll", () => {
            return this.promisify.flush();
        });
    }
    
}

module.exports = CacheMemcache;
