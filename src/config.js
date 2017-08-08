"use strict"

class Config {
    
    constructor(path) {
        this.config = require(path);

        if (this.config.dbs) {
            this.dbs = this.config.dbs;
        }
        if (process.env.DB_DEFAULT) {
            this.dbDefault = process.env.DB_DEFAULT;
        }
        let dbList = [];
        if (process.env.DB_LIST) {
            dbList = process.env.DB_LIST.split(",");
        }
        if (dbList.length) {
            for (let db of dbList) {
                if (process.env["DB_" + db]) {
                    this.configSingle(db);
                    continue;
                }
                if (process.env["DB_" + db + "_TYPE"]
                    && process.env["DB_" + db + "_WRITE"]
                    && process.env["DB_" + db + "_READ"]) {
                    this.configReplicated(db);
                    continue;
                }
            }
        }
    }

    configSingle(db) {
        let dbParam = process.env["DB_" + db].split(",");
        //type
        if (dbParam[0] && dbParam[0].length) {
            this.dbs[db].db.type = dbParam[0];
        }
        //hostname
        if (dbParam[1] && dbParam[1].length) {
            let [host, port] = dbParam[1].split(":");
            this.dbs[db].db.host = host;
            if (port) {
                this.dbs[db].db.port = parseInt(port, 10);
            }
        }
        //user
        if (dbParam[2] && dbParam[2].length) {
            this.dbs[db].db.user = dbParam[2];
        }
        //password
        if (dbParam[3] && dbParam[3].length) {
            this.dbs[db].db.password = dbParam[3];
        }
        //connection limit
        if (dbParam[4] && dbParam[4].length) {
            this.dbs[db].db.connectionLimit = parseInt(dbParam[4], 10);
        }
    }

    configReplicated(db) {
        //type
        if (process.env["DB_" + db + "_TYPE"]) {
            this.dbs[db].db.type = process.env["DB_" + db + "_TYPE"];
        }

        let dbWriteParam = process.env["DB_" + db + "_WRITE"].split(",");
        this.dbs[db].db.write = {
            type: this.dbs[db].db.type,
        };
        //hostname
        if (dbWriteParam[0] && dbWriteParam[0].length) {
            let [host, port] = dbWriteParam[0].split(":");
            this.dbs[db].db.write.host = host;
            if (port) {
                this.dbs[db].db.write.port = parseInt(port, 10);
            }
        }
        //user
        if (dbWriteParam[1] && dbWriteParam[1].length) {
            this.dbs[db].db.write.user = dbWriteParam[1];
        }
        //password
        if (dbWriteParam[2] && dbWriteParam[2].length) {
            this.dbs[db].db.write.password = dbWriteParam[2];
        }
        //connection limit
        if (dbWriteParam[3] && dbWriteParam[3].length) {
            this.dbs[db].db.write.connectionLimit = parseInt(dbWriteParam[3], 10);
        } else if (this.dbs[db].db.connectionLimit) {
            this.dbs[db].db.write.connectionLimit = this.dbs[db].db.connectionLimit;
        }

        let dbReadParam = process.env["DB_" + db + "_READ"].split(",");
        this.dbs[db].db.read = {
            type: this.dbs[db].db.type,
        };
        //hostname
        if (dbReadParam[0] && dbReadParam[0].length) {
            let [host, port] = dbReadParam[0].split(":");
            this.dbs[db].db.read.host = host;
            if (port) {
                this.dbs[db].db.read.port = parseInt(port, 10);
            }
        }
        //user
        if (dbReadParam[1] && dbReadParam[1].length) {
            this.dbs[db].db.read.user = dbReadParam[1];
        }
        //password
        if (dbReadParam[2] && dbReadParam[2].length) {
            this.dbs[db].db.read.password = dbReadParam[2];
        }
        //connection limit
        if (dbReadParam[3] && dbReadParam[3].length) {
            this.dbs[db].db.read.connectionLimit = parseInt(dbReadParam[3], 10);
        } else if (this.dbs[db].db.connectionLimit) {
            this.dbs[db].db.read.connectionLimit = this.dbs[db].db.connectionLimit;
        }
            
    }
    
}

module.exports = Config;
