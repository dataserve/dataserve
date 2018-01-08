'use strict';

class Cache {

    constructor(config, log) {
        this.debug = require('debug')('dataserve:cache');

        this.config = config;
        
        this.log = log;
        
        this.dbs = {};
    }
    
    getCache(dbName) {
        let dbConfig = this.config.dbs[dbName];
        
        if (!dbConfig || !dbConfig.type) {
            throw new Error('missing db type for: ' + dbName + ' - ' + JSON.stringify(dbConfig));
        }

        let dbKey = dbConfig.type + ':' + dbName;
        
        if (this.dbs[dbKey]) {
            return this.dbs[dbKey];
        }

        let cacheConfig = dbConfig.cache;
        
        if (!cacheConfig || !cacheConfig.type) {
            this.debug('missing cache type for: ' + dbName + ' - ' + JSON.stringify(dbConfig));
            return null;
        }
        
        switch (cacheConfig.type) {
        case 'js':
            let CacheJS = require('./cache/js');
            
            this.dbs[dbKey] = new CacheJS(cacheConfig, this.log);
            
            break;
        case 'memcache':
        case 'memcached':
            let CacheMemcache = require('./cache/memcache');
            
            this.dbs[dbKey] = new CacheMemcache(cacheConfig, this.log);
            
            break;
        case 'redis':
            let CacheRedis = require('./cache/redis');
            
            this.dbs[dbKey] = new CacheRedis(cacheConfig, this.log);
            
            break;
        default:
            throw new Error('unknown Cache type: ' + cacheConfig.type);
        }
        
        return this.dbs[dbKey];
    }

}

module.exports = Cache;
