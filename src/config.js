'use strict';

const _array = require('lodash/array');
const _object = require('lodash/object');
const path = require('path');
const Type = require('type-of-is');
const SqlSchemaModulizer = require('../../sql-schema-modulizer');

const { loadJson } = require('./util');

class Config {
    
    constructor(configPath, middlewareLookup) {
        this.configDir = path.dirname(configPath);

        this.dbDefault = null;

        let opt = {
            cascadeDown: {
                middleware: '',
            },
            cascadeExpand: middlewareLookup,
        };
        
        this.config = new SqlSchemaModulizer(opt);

        this.config.buildFromPath(configPath);

        this.dbs = {};

        let dbNames = this.config.getDbNames();

        if (!dbNames.length) {
            throw new Exception('no dbs found in config');
        }

        dbNames.forEach((dbName) => {
            this.dbs[dbName] = {};
        });

        if (process.env.DB_DEFAULT) {
            this.dbDefault = process.env.DB_DEFAULT;
        }
        
        let dbList = [];
        
        if (process.env.DB_LIST) {
            dbList = process.env.DB_LIST.split(',');
        }
        
        if (dbList.length) {
            dbList.forEach((dbName) => {
                if (process.env[`DB_${dbName}_CACHE`]) {
                    this.configCache(dbName);
                }
                
                if (process.env[`DB_${dbName}`]) {
                    this.configSingle(dbName);
                    
                    return;
                }
                
                if (process.env[`DB_${dbName}_TYPE`]
                    && process.env[`DB_${dbName}_WRITE`]
                    && process.env[`DB_${dbName}_READ`]) {
                    this.configReplicated(dbName);
                    
                    return;
                }
            });
        }
    }

    getDbNames() {
        return Object.keys(this.dbs);
    }

    getDbConfig(dbName) {
        return this.config.getDbConfig(dbName);
    }

    getDbSchema(dbName) {
        return this.config.getDbSchema(dbName);
    }

    getTableConfig(dbName, tableName) {
        return this.config.getTableConfig(dbName, tableName);
    }

    getTableSchema(dbName, tableName) {
        return this.config.getTableSchema(dbName, tableName);
    }

    configCache(dbName) {
        let cacheParam = process.env[`DB_${dbName}_CACHE`].split(',');

        if (!cacheParam.length) {
            return;
        }

        this.dbs[dbName].cache = {};
        
        //type
        if (cacheParam[0] && cacheParam[0].length) {
            this.dbs[dbName].cache.type = cacheParam[0];
        }
        
        //hostname
        if (cacheParam[1] && cacheParam[1].length) {
            let [host, port] = cacheParam[1].split(':');
            
            this.dbs[dbName].cache.host = host;
            
            if (port) {
                this.dbs[dbName].cache.port = parseInt(port, 10);
            }
        }
    }
    
    configSingle(dbName) {
        let dbParam = process.env[`DB_${dbName}`].split(',');

        if (!dbParam.length) {
            return;
        }
        
        //type
        if (dbParam[0] && dbParam[0].length) {
            this.dbs[dbName].type = dbParam[0];
        }
        
        //hostname
        if (dbParam[1] && dbParam[1].length) {
            let [host, port] = dbParam[1].split(':');
            
            this.dbs[dbName].host = host;
            
            if (port) {
                this.dbs[dbName].port = parseInt(port, 10);
            }
        }
        
        //user
        if (dbParam[2] && dbParam[2].length) {
            this.dbs[dbName].user = dbParam[2];
        }
        
        //password
        if (dbParam[3] && dbParam[3].length) {
            this.dbs[dbName].password = dbParam[3];
        }
        
        //connection limit
        if (dbParam[4] && dbParam[4].length) {
            this.dbs[dbName].connectionLimit = parseInt(dbParam[4], 10);
        }
    }

    configReplicated(dbName) {
        //type
        if (process.env[`DB_${dbName}_TYPE`]) {
            this.dbs[dbName].type = process.env[`DB_${dbName}_TYPE`];
        }

        let dbWriteParam = process.env[`DB_${dbName}_WRITE`].split(',');
        
        this.dbs[dbName].write = {
            type: this.dbs[dbName].type,
        };
        
        //hostname
        if (dbWriteParam[0] && dbWriteParam[0].length) {
            let [host, port] = dbWriteParam[0].split(':');
            
            this.dbs[dbName].write.host = host;
            
            if (port) {
                this.dbs[dbName].write.port = parseInt(port, 10);
            }
        }
        
        //user
        if (dbWriteParam[1] && dbWriteParam[1].length) {
            this.dbs[dbName].write.user = dbWriteParam[1];
        }
        
        //password
        if (dbWriteParam[2] && dbWriteParam[2].length) {
            this.dbs[dbName].write.password = dbWriteParam[2];
        }
        
        //connection limit
        if (dbWriteParam[3] && dbWriteParam[3].length) {
            this.dbs[dbName].write.connectionLimit = parseInt(dbWriteParam[3], 10);
        } else if (this.dbs[dbName].connectionLimit) {
            this.dbs[dbName].write.connectionLimit = this.dbs[dbName].connectionLimit;
        }

        let dbReadParam = process.env[`DB_${dbName}_READ`].split(',');
        
        this.dbs[dbName].read = {
            type: this.dbs[dbName].type,
        };
        
        //hostname
        if (dbReadParam[0] && dbReadParam[0].length) {
            let [host, port] = dbReadParam[0].split(':');
            
            this.dbs[dbName].read.host = host;
            
            if (port) {
                this.dbs[dbName].read.port = parseInt(port, 10);
            }
        }
        
        //user
        if (dbReadParam[1] && dbReadParam[1].length) {
            this.dbs[dbName].read.user = dbReadParam[1];
        }
        
        //password
        if (dbReadParam[2] && dbReadParam[2].length) {
            this.dbs[dbName].read.password = dbReadParam[2];
        }
        
        //connection limit
        if (dbReadParam[3] && dbReadParam[3].length) {
            this.dbs[dbName].read.connectionLimit = parseInt(dbReadParam[3], 10);
        } else if (this.dbs[dbName].connectionLimit) {
            this.dbs[dbName].read.connectionLimit = this.dbs[dbName].connectionLimit;
        }
    }

}

module.exports = Config;
