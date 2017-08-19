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
            for (let dbName of dbList) {
                if (process.env["DB_" + dbName + "_CACHE"]) {
                    try {
                        let cacheConfig = JSON.parse(process.env["DB_" + dbName + "_CACHE"]);
                        this.dbs[dbName].cache = Object.assign(this.dbs[dbName].cache, cacheConfig);
                    } catch(error) {};
                }
                if (process.env["DB_" + dbName]) {
                    this.configSingle(dbName);
                    continue;
                }
                if (process.env["DB_" + dbName + "_TYPE"]
                    && process.env["DB_" + dbName + "_WRITE"]
                    && process.env["DB_" + dbName + "_READ"]) {
                    this.configReplicated(dbName);
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
        }
    }

    configSingle(dbName) {
        let dbParam = process.env["DB_" + dbName].split(",");
        //type
        if (dbParam[0] && dbParam[0].length) {
            this.dbs[dbName].db.type = dbParam[0];
        }
        //hostname
        if (dbParam[1] && dbParam[1].length) {
            let [host, port] = dbParam[1].split(":");
            this.dbs[dbName].db.host = host;
            if (port) {
                this.dbs[dbName].db.port = parseInt(port, 10);
            }
        }
        //user
        if (dbParam[2] && dbParam[2].length) {
            this.dbs[dbName].db.user = dbParam[2];
        }
        //password
        if (dbParam[3] && dbParam[3].length) {
            this.dbs[dbName].db.password = dbParam[3];
        }
        //connection limit
        if (dbParam[4] && dbParam[4].length) {
            this.dbs[dbName].db.connectionLimit = parseInt(dbParam[4], 10);
        }
    }

    configReplicated(dbName) {
        //type
        if (process.env["DB_" + dbName + "_TYPE"]) {
            this.dbs[dbName].db.type = process.env["DB_" + dbName + "_TYPE"];
        }

        let dbWriteParam = process.env["DB_" + dbName + "_WRITE"].split(",");
        this.dbs[dbName].db.write = {
            type: this.dbs[dbName].db.type,
        };
        //hostname
        if (dbWriteParam[0] && dbWriteParam[0].length) {
            let [host, port] = dbWriteParam[0].split(":");
            this.dbs[dbName].db.write.host = host;
            if (port) {
                this.dbs[dbName].db.write.port = parseInt(port, 10);
            }
        }
        //user
        if (dbWriteParam[1] && dbWriteParam[1].length) {
            this.dbs[dbName].db.write.user = dbWriteParam[1];
        }
        //password
        if (dbWriteParam[2] && dbWriteParam[2].length) {
            this.dbs[dbName].db.write.password = dbWriteParam[2];
        }
        //connection limit
        if (dbWriteParam[3] && dbWriteParam[3].length) {
            this.dbs[dbName].db.write.connectionLimit = parseInt(dbWriteParam[3], 10);
        } else if (this.dbs[dbName].db.connectionLimit) {
            this.dbs[dbName].db.write.connectionLimit = this.dbs[dbName].db.connectionLimit;
        }

        let dbReadParam = process.env["DB_" + dbName + "_READ"].split(",");
        this.dbs[dbName].db.read = {
            type: this.dbs[dbName].db.type,
        };
        //hostname
        if (dbReadParam[0] && dbReadParam[0].length) {
            let [host, port] = dbReadParam[0].split(":");
            this.dbs[dbName].db.read.host = host;
            if (port) {
                this.dbs[dbName].db.read.port = parseInt(port, 10);
            }
        }
        //user
        if (dbReadParam[1] && dbReadParam[1].length) {
            this.dbs[dbName].db.read.user = dbReadParam[1];
        }
        //password
        if (dbReadParam[2] && dbReadParam[2].length) {
            this.dbs[dbName].db.read.password = dbReadParam[2];
        }
        //connection limit
        if (dbReadParam[3] && dbReadParam[3].length) {
            this.dbs[dbName].db.read.connectionLimit = parseInt(dbReadParam[3], 10);
        } else if (this.dbs[dbName].db.connectionLimit) {
            this.dbs[dbName].db.read.connectionLimit = this.dbs[dbName].db.connectionLimit;
        }
    }

    buildModuleExtends(dbName, configExtends, parentModule, parentTableNamePrepend) {
        if (!configExtends) {
            return;
        }
        let parentModuleName, parentTableName;
        if (parentModule) {
            let parentModuleSplit = parentModule.split(":");
            parentModuleName = parentModuleSplit[0];
            parentTableName = parentModuleSplit[1];
        }
        let retChildrenModules = [];
        for (let module in configExtends) {
            if (!configExtends[module]) {
                configExtends[module] = {};
            }
            let tmpParentTableNamePrepend = parentTableNamePrepend;
            let moduleSplit = module.split(":"), modulePrepended = null;
            let moduleName = moduleSplit[0], tableName = moduleSplit[1];
            if (!tmpParentTableNamePrepend
                && parentModuleName
                && parentTableName
                && parentModuleName == tableName) {
                tmpParentTableNamePrepend = parentTableName;
            }
            if (tmpParentTableNamePrepend) {
                tmpParentTableNamePrepend += "_" + tableName;
                modulePrepended = moduleName + ":" + tmpParentTableNamePrepend;
            } else {
                modulePrepended = module;
            }
            
            if (this.requires[dbName][modulePrepended]) {
                this.requires[dbName][modulePrepended] = _object.merge(this.requires[dbName][modulePrepended], [configExtends[module], {parentModule: parentModule}]);
            } else {
                this.requires[dbName][modulePrepended] = _object.merge(configExtends[module], {parentModule: parentModule});
            }

            let modulePath = this.configDir + "/module" + moduleName.charAt(0).toUpperCase() + moduleName.slice(1);

            let moduleContents = loadJson(modulePath), childrenModules = [];

            if (moduleContents.extends && Object.keys(moduleContents.extends).length) {
                childrenModules = this.buildModuleExtends(dbName, moduleContents.extends, modulePrepended, tmpParentTableNamePrepend);
            }

            if (childrenModules.length) {
                this.requires[dbName][modulePrepended] = _object.merge(this.requires[dbName][modulePrepended], {childrenModules: childrenModules});
            }

            if (moduleContents.requires && Object.keys(moduleContents.requires).length) {
                this.buildModuleRequires(dbName, moduleContents.requires);
            }

            retChildrenModules.push(modulePrepended);
        }

        return retChildrenModules;
    }
    
    buildModuleRequires(dbName, configRequires) {
        if (!configRequires) {
            return;
        }
        for (let module in configRequires) {
            if (!configRequires[module]) {
                configRequires[module] = {};
            }
            let moduleSplit = module.split(":");
            let moduleName = moduleSplit[0];

            if (this.requires[dbName][module]) {
                this.requires[dbName][module] = _object.merge(this.requires[dbName][module], configRequires[module]);
            } else {
                this.requires[dbName][module] = configRequires[module];
            }

            let modulePath = this.configDir + "/module" + moduleName.charAt(0).toUpperCase() + moduleName.slice(1);

            let moduleContents = loadJson(modulePath);

            if (moduleContents.extends && Object.keys(moduleContents.extends).length) {
                this.buildModuleExtends(dbName, moduleContents.extends, moduleName);
            }

            if (moduleContents.requires && Object.keys(moduleContents.requires).length) {
                this.buildModuleRequires(dbName, moduleContents.requires);
            }
        }
    }
    
    buildModules(dbName) {
        let tables = {}, moduleInfo = {}, tableInfo = {};
        for (let module in this.requires[dbName]) {
            let opt = this.requires[dbName][module];
            let enable = [], extendTables = {}, parentModule = null, childrenModules = null;
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
                if (opt.parentModule) {
                    parentModule = opt.parentModule;
                }
                if (opt.childrenModules) {
                    childrenModules = opt.childrenModules;
                }
            }
            let [moduleName, tableNamePrepend] = module.split(":");
            
            let modulePath = this.configDir + "/module" + moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
            let moduleContents = loadJson(modulePath);
            
            if (!moduleContents.tables || !Object.keys(moduleContents.tables).length) {
                continue;
            }
  
            if (extendTables) {
                moduleContents.tables = _object.mergeWith(moduleContents.tables, extendTables, this.mergeConfig);
            }

            let siblingsAssoc = {}, moduleTables = [];
            moduleInfo[module] = {
                tables: [],
                assoc: {}
            };
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
                if (!tableInfo[tableName]) {
                    tableInfo[tableName] = {
                        parentModule: parentModule,
                        childrenModules: childrenModules,
                        siblingsAssoc: {},
                    };
                }
                tables[tableName] = moduleContents.tables[table];
                moduleInfo[module].assoc[table] = tableName;
                moduleInfo[module].tables.push(tableName);
                siblingsAssoc[table] = tableName;
                moduleTables.push(tableName);
            }
            for (let tableName of moduleTables) {
                tableInfo[tableName].siblingsAssoc = siblingsAssoc;
            }
        }
        for (let tableName in tables) {
            let parentTables = {}, siblingTables = {}, childrenTables = {};
            if (tableInfo[tableName].parentModule && moduleInfo[tableInfo[tableName].parentModule]) {
                parentTables = moduleInfo[tableInfo[tableName].parentModule].assoc;
            }
            if (tableInfo[tableName].childrenModules) {
                for (let childrenModule of tableInfo[tableName].childrenModules) {
                    if (moduleInfo[childrenModule]) {
                        childrenTables = Object.assign(childrenTables, moduleInfo[childrenModule].assoc);
                    }
                }
            }
            if (tableInfo[tableName] && tableInfo[tableName].siblingsAssoc) {
                siblingTables = tableInfo[tableName].siblingsAssoc;
            }
            this.extendTable(tables, tableName, parentTables, siblingTables, childrenTables);
        }
        if (Object.keys(tables).length) {
            if (!this.dbs[dbName].tables) {
                this.dbs[dbName].tables = {};
            }

            this.dbs[dbName].tables = _object.mergeWith(this.dbs[dbName].tables, tables, this.mergeConfig);
        }
    }

    extendTable(tables, tableName, parentTables, siblingTables, childrenTables) {
        let tmpParentTables = {};
        for (let table in parentTables) {
            tmpParentTables["^" + table] = parentTables[table];
        };
        parentTables = tmpParentTables;

        let tmpSiblingTables = {};
        for (let table in siblingTables) {
            tmpSiblingTables["$" + table] = siblingTables[table];
        }
        siblingTables = tmpSiblingTables;

        let tmpChildrenTables = {};
        for (let table in childrenTables) {
            tmpChildrenTables[">" + table] = childrenTables[table];
        }
        childrenTables = tmpChildrenTables;
        
        let table = tables[tableName];
        let fields = table.fields;
        if (fields) {
            Object.keys(fields).forEach(field => {
                let fieldAssoc = this.associateTable(field, parentTables, siblingTables, childrenTables);
                if (fieldAssoc === field) {
                    return;
                }
                fields[fieldAssoc] = fields[field];
                delete fields[field];
            });
        }
        let keys = table.keys;
        if (keys) {
            for (let keyName in keys) {
                if (!keys[keyName].fields) {
                    continue;
                }
                keys[keyName].fields.forEach((field, index) => {
                    let fieldAssoc = this.associateTable(field, parentTables, siblingTables, childrenTables);
                    if (fieldAssoc === field) {
                        return;
                    }
                    keys[keyName].fields[index] = fieldAssoc;
                });
            }
        }
        let relationships = table.relationships;
        if (relationships) {
            Object.keys(table.relationships).forEach(rel => {
                table.relationships[rel].forEach((tbl, index) => {
                    let tblAssoc = this.associateTable(tbl, parentTables, siblingTables, childrenTables);
                    if (tblAssoc === tbl) {
                        return;
                    }
                    relationships[rel][index] = tblAssoc;
                });
            });
        }
    }

    associateTable(str, parentTables, siblingTables, childrenTables) {
        if (parentTables) {
            Object.keys(parentTables).sort().forEach(table => {
                str = str.replace(table, parentTables[table]);
            });
        }
        if (siblingTables) {
            Object.keys(siblingTables).sort().forEach(table => {
                str = str.replace(table, siblingTables[table]);
            });
        }
        if (childrenTables) {
            Object.keys(childrenTables).sort().forEach(table => {
                str = str.replace(table, childrenTables[table]);
            });
        }
        return str;
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
