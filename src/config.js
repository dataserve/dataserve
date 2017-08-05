"use strict"

class Config {
    
    constructor(path) {
        this.config = require(path);

        if (this.config.db) {
            this.db = this.config.db;
        }
        if (process.env.DB_DEFAULT) {
            this.db["_default_"] = process.env.DB_DEFAULT;
        }
        let dbList = [];
        if (process.env.DB_LIST) {
            dbList = process.env.DB_LIST.split(",");
        }
        if (dbList.length) {
            for (let db of dbList) {
                if (!process.env["DB_" + db]) {
                    continue;
                }
                let dbParam = process.env["DB_" + db].split(",");
                //type
                if (dbParam[0].length) {
                    this.db[db].db.type = dbParam[0];
                }
                //hostname
                if (dbParam[1].length) {
                    let [host, port] = dbParam[1].split(":");
                    this.db[db].db.host = host;
                    if (port) {
                        this.db[db].db.port = parseInt(port, 10);
                    }
                }
                //user
                if (dbParam[2].length) {
                    this.db[db].db.user = dbParam[2];
                }
                //password
                if (dbParam[3].length) {
                    this.db[db].db.password = dbParam[3];
                }
                //connection limit
                if (dbParam[4].length) {
                    this.db[db].db.connectionLimit = parseInt(dbParam[4], 10);
                }
            }
        }
    }
    
}

module.exports = Config;
