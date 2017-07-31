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
        if (!db_config.type) {
            throw new Error("missing db type for: " + db_name);
        }
        switch (db_config.type) {
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

    query(...args) {
        return this._db.query(...args);
    }

    query_multi(...args) {
        return this._db.query_multi(...args);
    }

}

module.exports = DB;
