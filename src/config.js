"use strict"

const _array = require("lodash/array");
const _object = require("lodash/object");
const path = require("path");
const Type = require('type-of-is');

class Config {
    
    constructor(configPath) {
        this.configDir = path.dirname(configPath);
        this.config = require(configPath);

        if (!this.config.dbs || !Object.keys(this.config.dbs).length) {
            throw new Error("Missing dbs in config: " + configPath);
        }
        
        this.dbs = this.config.dbs;
        this.requires = {};
        
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
        for (let dbName in this.dbs) {
            if (this.dbs[dbName].requires && Object.keys(this.dbs[dbName].requires).length) {
                this.buildRequires(dbName, this.dbs[dbName].requires);
                this.configRequires(dbName);
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

    buildRequires(dbName, requires) {
        this.mergeRequires(dbName, requires);
        
        for (let module in requires) {
            let tableName = module.split(":");
            
            let parentModule = tableName[0];
            
            let modulePath = this.configDir + "/module" + parentModule.charAt(0).toUpperCase() + parentModule.slice(1);
            
            let moduleContents = require(modulePath);

            if (!moduleContents.requires || !Object.keys(moduleContents.requires).length) {
                continue;
            }

            this.buildRequires(dbName, moduleContents.requires);
        }
    }

    mergeRequires(dbName, requires) {
        if (!this.requires[dbName]) {
            this.requires[dbName] = {};
        }
        for (let req in requires) {
            if (this.requires[dbName][req]) {
                this.requires[dbName][req] = _object.mergeWith(this.requires[dbName][req], requires[req], this.mergeRequiresObj);
            } else {
                this.requires[dbName][req] = requires[req];
            }
        }
    }

    mergeRequiresObj(objValue, srcValue) {
        if (typeof objValue !== "undefined" && !Type.is(objValue, Object) && !Array.isArray(objValue)) {
            objValue = [objValue];
        }
        if (typeof srcValue !== "undefined" && !Type.is(srcValue, Object) && !Array.isArray(srcValue)) {
            srcValue = [srcValue];
        }
        if (Array.isArray(objValue)) {
            if (!Array.isArray(srcValue)) {
                srcValue = [srcValue];
            }
            return _array.uniq(objValue.concat(srcValue));
        }
    }

    configRequires(dbName) {
        let tables = {};
        for (let module in this.requires[dbName]) {
            let opt = this.requires[dbName][module];
            let enable = [];
            let extendTables = {};
            if (opt) {
                if (opt.enable) {
                    if (!Array.isArray(opt.enable)) {
                        enable = [opt.enable];
                    } else {
                        enable = opt.enable;
                    }
                }
                if (opt.tables) {
                    extendTables = opt.tables;
                }
            }
            let tableName = module.split(":");
            let parentModule = tableName[0];
            
            if (1 < tableName.length) {
                tableName = tableName.slice(1).join("_") + "_" + tableName[0];
            } else {
                tableName = tableName[0];
            }

            let modulePath = this.configDir + "/module" + parentModule.charAt(0).toUpperCase() + parentModule.slice(1);
            let moduleContents = require(modulePath);

            if (!moduleContents.tables || !Object.keys(moduleContents.tables).length) {
                continue;
            }

            if (extendTables) {
                moduleContents.tables = _object.mergeWith(moduleContents.tables, extendTables, this.mergeRequiresObj);
            }

            for (let table in moduleContents.tables) {
                if (typeof moduleContents.tables[table].enabled !== "undefined"
                    && !moduleContents.tables[table].enabled
                    && enable.indexOf(table) === -1) {
                    continue;
                }
                tables[tableName] = moduleContents.tables[table];
            }
        }

        if (Object.keys(tables).length) {
            if (!this.dbs[dbName].tables) {
                this.dbs[dbName].tables = {};
            }

            this.dbs[dbName].tables = _object.mergeWith(this.dbs[dbName].tables, tables, this.mergeRequiresObj);
        }
    }
    
}

module.exports = Config;
