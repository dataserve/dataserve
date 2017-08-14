"use strict"

const _array = require("lodash/array");
const _object = require("lodash/object");
const path = require("path");
const Type = require('type-of-is');
const util = require("util");

const {loadJson} = require("./util");

class Config {
    
    constructor(configPath) {
        this.configDir = path.dirname(configPath);
        this.config = loadJson(configPath);

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
            if (!this.requires[dbName]) {
                this.requires[dbName] = {};
            }
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

    buildRequires(dbName, requires, prevModule, prevTableNamePrepend) {
        let prevParentModule, prevTableName;
        if (prevModule) {
            let prevModuleName = prevModule.split(":");
            prevParentModule = prevModuleName[0];
            prevTableName = prevModuleName[1];
        }
        for (let module in requires) {
            if (!requires[module]) {
                requires[module] = {};
            }
            let tmpPrevTableNamePrepend = prevTableNamePrepend;
            let moduleName = module.split(":"), modulePrepended = null;
            let parentModule = moduleName[0], tableName = moduleName[1];
            if (!tmpPrevTableNamePrepend
                && prevParentModule
                && prevTableName
                && prevParentModule == tableName) {
                tmpPrevTableNamePrepend = prevTableName;
            }
            if (tmpPrevTableNamePrepend) {
                modulePrepended = parentModule + ":" + tmpPrevTableNamePrepend + "_" + tableName;
                if (requires[module].tables) {
                    this.extendRequiresTables(requires[module].tables);
                }
            } else {
                modulePrepended = module;
            }
            if (this.requires[dbName][modulePrepended]) {
                this.requires[dbName][modulePrepended] = _object.merge(this.requires[dbName][modulePrepended], requires[module]);
            } else {
                this.requires[dbName][modulePrepended] = requires[module];
            }

            let modulePath = this.configDir + "/module" + parentModule.charAt(0).toUpperCase() + parentModule.slice(1);

            let moduleContents = loadJson(modulePath);

            if (!moduleContents.requires || !Object.keys(moduleContents.requires).length) {
                continue;
            }
            this.buildRequires(dbName, moduleContents.requires, modulePrepended, tmpPrevTableNamePrepend);
        }
    }

    extendRequiresTables(tables) {
        for (let table in tables) {
            let fields = tables[table].fields;
            if (!fields) {
                continue;
            }
            let keys = tables[table].keys;
            if (keys) {
                for (let field in keys) {
                    if (!keys[field].fields) {
                        continue;
                    }
                    keys[field].fields = keys[field].fields.map(fld => {
                        if (!fields[fld]) {
                            return fld;
                        }
                        return tmpPrevTableNamePrepend + "_" + fld;
                    });
                }
            }
            let relationships = tables[table].relationships;
            if (relationships && relationships.belongsTo) {
                relationships.belongsTo = relationships.belongsTo.map(field => {
                    if (!fields[field + "_id"]) {
                        return field;
                    }
                    fields[tmpPrevTableNamePrepend + "_" + field + "_id"] = fields[field + "_id"];
                    delete fields[field + "_id"];
                    return tmpPrevTableNamePrepend + "_" + field;
                });
            }
        }
    }
    
    mergeConfig(objValue, srcValue) {
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
            let moduleName = module.split(":");
            let parentModule = moduleName[0];
            let tableNamePrepend = moduleName[1];
            
            let modulePath = this.configDir + "/module" + parentModule.charAt(0).toUpperCase() + parentModule.slice(1);
            let moduleContents = loadJson(modulePath);
            
            if (!moduleContents.tables || !Object.keys(moduleContents.tables).length) {
                continue;
            }
  
            if (extendTables) {
                moduleContents.tables = _object.mergeWith(moduleContents.tables, extendTables, this.mergeConfig);
            }

            for (let table in moduleContents.tables) {
                if (typeof moduleContents.tables[table].enabled !== "undefined"
                    && !moduleContents.tables[table].enabled
                    && enable.indexOf(table) === -1) {
                    continue;
                }
                let tableName = table;
                if (tableNamePrepend) {
                    tableName = tableNamePrepend + "_" + tableName;
                }
                if (tableName !== table) {
                    let fields = moduleContents.tables[table].fields;
                    if (fields && fields[parentModule + "_id"]) {
                        fields[tableNamePrepend + "_" + parentModule + "_id"] = fields[parentModule + "_id"];
                        delete fields[parentModule + "_id"];
                    }
                    let keys = moduleContents.tables[table].keys;
                    if (keys) {
                        for (let field in keys) {
                            if (!keys[field].fields) {
                                continue;
                            }
                            keys[field].fields = keys[field].fields.map(fld => {
                                if (fld !== parentModule + "_id") {
                                    return fld;
                                }
                                return tableNamePrepend + "_" + fld;
                            });
                        }
                    }
                }
                tables[tableName] = moduleContents.tables[table];
            }
        }

        if (Object.keys(tables).length) {
            if (!this.dbs[dbName].tables) {
                this.dbs[dbName].tables = {};
            }

            this.dbs[dbName].tables = _object.mergeWith(this.dbs[dbName].tables, tables, this.mergeConfig);
        }
    }
    
}

module.exports = Config;
