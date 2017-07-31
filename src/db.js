'use strict'

class DB {

    constructor(){
        this._dbs = {};
    }
    
    get_db(db_name, db_config) {
        let db_key = db_config.type + ":" + db_name;
        if (this._dbs[db_key]) {
            return this._dbs[db_key];
        }
        db_config = db_config.db;
        if (!db_config || !db_config.type) {
            throw new Error("missing db type for: " + db_name + " - " + JSON.stringify(db_config));
        }
        switch (db_config.type) {
        case "mysql":
            let MySql = require("./db/mysql");
            this._dbs[db_key] = new MySql(db_name, db_config);
            break;
        default:
            throw new Error("unknown DB type: " + db_config.type);
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
