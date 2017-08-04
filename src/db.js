'use strict'

class DB {

    constructor(){
        this.dbs = {};
    }
    
    getDb(dbName, dbConfig) {
        let dbKey = dbConfig.type + ":" + dbName;
        if (this.dbs[dbKey]) {
            return this.dbs[dbKey];
        }
        dbConfig = dbConfig.db;
        if (!dbConfig || !dbConfig.type) {
            throw new Error("missing db type for: " + dbName + " - " + JSON.stringify(dbConfig));
        }
        switch (dbConfig.type) {
        case "mysql":
            let MySql = require("./db/mysql");
            this.dbs[dbKey] = new MySql(dbName, dbConfig);
            break;
        default:
            throw new Error("unknown DB type: " + dbConfig.type);
        }
        return this.dbs[dbKey];
    }

    query(...args) {
        return this.db.query(...args);
    }

    queryMulti(...args) {
        return this.db.queryMulti(...args);
    }

}

module.exports = DB;
