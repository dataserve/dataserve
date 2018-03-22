'use strict';

class DB {

    constructor(dataserve, config, log){
        this.dataserve = dataserve;

        this.config = config;
        
        this.log = log;
        
        this.dbs = {};
    }
    
    getDb(dbName) {
        let dbConfig = this.config.dbs[dbName];
        
        if (!dbConfig || !dbConfig.type) {
            throw new Error('missing db type for: ' + dbName + ' - ' + JSON.stringify(dbConfig));
        }

        let dbKey = dbConfig.type + ':' + dbName;
        
        if (this.dbs[dbKey]) {
            return this.dbs[dbKey];
        }
               
        switch (dbConfig.type) {
        case 'mysql':
            let MySql = require('./db/mysql');
            
            this.dbs[dbKey] = new MySql(dbName, dbConfig, this.dataserve, this.log);
            
            break;
        default:
            throw new Error('unknown DB type: ' + dbConfig.type);
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
