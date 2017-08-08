"use strict"

class Cache {

    constructor(log) {
        this.log = log;
        this.dbs = {};
    }
    
    getCache(dbName, dbConfig) {
        let dbKey = dbConfig.type + ":" + dbName;
        if (this.dbs[dbKey]) {
            return this.dbs[dbKey];
        }
        dbConfig = dbConfig.cache;
        if (!dbConfig || !dbConfig.type) {
            throw new Error("missing cache type for: " + dbName + " - " + JSON.stringify(dbConfig));
        }
        switch (dbConfig.type) {
        case "js":
            let CacheJS = require("./cache/js");
            this.dbs[dbKey] = new CacheJS(dbConfig, this.log);
            break;
        case "memcache":
        case "memcached":
            let CacheMemcache = require("./cache/memcache");
            this.dbs[dbKey] = new CacheMemcache(dbConfig, this.log);
            break;
        case "redis":
            let CacheRedis = require("./cache/redis");
            this.dbs[dbKey] = new CacheRedis(dbConfig, this.log);
            break;
        default:
            throw new Error("unknown Cache type: " + dbConfig.type);
        }
        return this.dbs[dbKey];
    }

}

module.exports = Cache;
