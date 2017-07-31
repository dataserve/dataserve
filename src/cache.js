'use strict'

//const MySql = require("./mysql");

class Cache {

    constructor(){
        this._dbs = {};
    }
    
    get_cache(db_name, db_config) {
        let db_key = db_config.type + ":" + db_name;
        if (this._dbs[db_key]) {
            return this._dbs[db_key];
        }
        db_config = db_config.cache;
        if (!db_config || !db_config.type) {
            throw new Error("missing cache type for: " + db_name + " - " + JSON.stringify(db_config));
        }
        switch (db_config.type) {
        case "js":
            let CacheJS = require("./cache/js");
            this._dbs[db_key] = new CacheJS(db_name, db_config);
            break;
        case "memcache":
            this._dbs[db_key] = new Memcache(db_name, db_config);
            break;
        case "redis":
            this._dbs[db_key] = new Redis(db_name, db_config);
            break;
        default:
            throw new Error("unknown Cache type: " + db_config.type);
        }
        return this._dbs[db_key];
    }

}

module.exports = Cache;
