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
                this.buildModuleExtends(dbName, this.dbs[dbName].extends);
                this.buildModuleRequires(dbName, this.dbs[dbName].requires);
                this.buildModules(dbName);
            }
            //console.log(util.inspect(this.requires[dbName], false, null));
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

    buildModuleExtends(dbName, configExtends, prevModule, prevTableNamePrepend) {
        if (!configExtends) {
            return;
        }
        let prevParentModule, prevTableName;
        if (prevModule) {
            let prevModuleName = prevModule.split(":");
            prevParentModule = prevModuleName[0];
            prevTableName = prevModuleName[1];
        }
        for (let module in configExtends) {
            if (!configExtends[module]) {
                configExtends[module] = {};
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
                tmpPrevTableNamePrepend += "_" + tableName;
                modulePrepended = parentModule + ":" + tmpPrevTableNamePrepend;
            } else {
                modulePrepended = module;
            }
            if (this.requires[dbName][modulePrepended]) {
                this.requires[dbName][modulePrepended] = _object.merge(this.requires[dbName][modulePrepended], [configExtends[module], {parent: prevModule}]);
            } else {
                this.requires[dbName][modulePrepended] = _object.merge(configExtends[module], {parent: prevModule});
            }

            let modulePath = this.configDir + "/module" + parentModule.charAt(0).toUpperCase() + parentModule.slice(1);

            let moduleContents = loadJson(modulePath);

            if (moduleContents.extends && Object.keys(moduleContents.extends).length) {
                this.buildModuleExtends(dbName, moduleContents.extends, modulePrepended, tmpPrevTableNamePrepend);
            }

            if (moduleContents.requires && Object.keys(moduleContents.requires).length) {
                this.buildModuleRequires(dbName, moduleContents.requires);
            }
        }
    }
    
    buildModuleRequires(dbName, configRequires) {
        if (!configRequires) {
            return;
        }
        for (let module in configRequires) {
            if (!configRequires[module]) {
                configRequires[module] = {};
            }
            let moduleName = module.split(":");
            let parentModule = moduleName[0];

            if (this.requires[dbName][module]) {
                this.requires[dbName][module] = _object.merge(this.requires[dbName][module], configRequires[module]);
            } else {
                this.requires[dbName][module] = configRequires[module];
            }

            let modulePath = this.configDir + "/module" + parentModule.charAt(0).toUpperCase() + parentModule.slice(1);

            let moduleContents = loadJson(modulePath);

            if (moduleContents.extends && Object.keys(moduleContents.extends).length) {
                this.buildModuleExtends(dbName, moduleContents.extends, parentModule);
            }

            if (moduleContents.requires && Object.keys(moduleContents.requires).length) {
                this.buildModuleRequires(dbName, moduleContents.requires);
            }
        }
    }
    
    buildModules(dbName) {
        let tables = {}, tableToParents = {}, tableToSiblings = {}, moduleToTable = {}, adjustTables = [];
        console.log(util.inspect(this.requires[dbName], false, null));
        for (let module in this.requires[dbName]) {
            let opt = this.requires[dbName][module];
            let enable = [];
            let extendTables = {};
            let parent = null;
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
                if (opt.parent) {
                    parent = opt.parent
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

            let siblings = {}, moduleTables = [];
            moduleToTable[module] = [];
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
                    adjustTables.push(tableName);
                }
                tables[tableName] = moduleContents.tables[table];
                tableToParents[tableName] = parent;
                moduleToTable[module].push({[table]: tableName});
                siblings[table] = tableName;
                moduleTables.push(tableName);
            }
            for (let table in moduleTables) {
                tableToSiblings[table] = siblings;
            }
        }
        for (let table of adjustTables) {
            let parentTables = [], siblingTables = [];
            if (tableToParents[table]) {
                parentTables = moduleToTable[tableToParents[table]];
                console.log("TABLE", table, "PARENTS", parentTables);
            }
            if (tableToSiblings[table]) {
                siblingTables = tableToSiblings[table];
                console.log("TABLE", table, "SIBLINGS", siblingTables);
            }
            /*
              let tablesParent = [];
              if (parent && this.requires[dbName][parent]) {
              let tables = this.requires[dbName][parent].tables;
              let moduleName = parent.split(":");
              let tableNamePrependParent = moduleName[1];
              if (tables && tableNamePrependParent) {
              let tablesParent = {};
              Object.keys(tables).forEach(tbl => {
              tablesParent[tbl] = tableNamePrependParent + "_" + tbl;
              });
              console.log("tablesParent", tablesParent);
              }
              //console.log("PARENT", util.inspect(parent, false, null));
              }
              
              console.log("MODULE: " + module, "EXTEND: " + table, "PARENT: " + parent, "TABLE: ", util.inspect(moduleContents.tables, false, null));
              this.extendTable(moduleContents.tables, table, parent);
            */
        }
        //console.log(util.inspect(tables, false, null));
        //console.log(parents);
        if (Object.keys(tables).length) {
            if (!this.dbs[dbName].tables) {
                this.dbs[dbName].tables = {};
            }

            this.dbs[dbName].tables = _object.mergeWith(this.dbs[dbName].tables, tables, this.mergeConfig);
        }
    }

    extendTable(tables, table, tablesParent) {
        let tablesSelf = Object.keys(tables);
        console.log("TABLES", tablesSelf);
        let fields = table.fields, fieldChange = {};
        if (fields && fields[parentModule + "_id"]) {
            fieldChange[parentModule + "_id"] = tableNamePrepend + "_" + parentModule + "_id";
        }
        let keys = table.keys;
        if (keys) {
            for (let field in keys) {
                if (!keys[field].fields) {
                    continue;
                }
                keys[field].fields = keys[field].fields.forEach((fld, index) => {
                    if (fld !== parentModule + "_id") {
                        return;
                    }
                    keys[field].fields[index] = tableNamePrepend + "_" + fld;
                });
            }
        }
        let relationships = table.relationships;
        if (relationships && relationships.belongsTo) {
            relationships.belongsTo.forEach((tbl, index) => {
                if (!fields[tbl + "_id"]) {
                    return;
                }
                fieldChange[tbl + "_id"] = tableNamePrepend + "_" + tbl + "_id";
                relationships.belongsTo[index] = tableNamePrepend + "_" + tbl;
            });
        }
        if (relationships && relationships.hasOne) {
            relationships.hasOne.forEach((tbl, index) => {
                if (!fields[tbl + "_id"]) {
                    return;
                }
                fieldChange[tbl + "_id"] = tableNamePrepend + "_" + tbl + "_id";
            });
        }
        if (relationships && relationships.hasMany) {
            relationships.hasMany.forEach((tbl, index) => {
                if (!fields[tbl + "_id"]) {
                    return;
                }
                fieldChange[tbl + "_id"] = tableNamePrepend + "_" + tbl + "_id";
            });
        }
        if (Object.keys(fieldChange).length) {
            for (let fld in fieldChange) {
                console.log("CHANGE", fld, fieldChange[fld]);
                fields[fieldChange[fld]] = fields[fld];
                delete fields[fld];
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
}

module.exports = Config;
