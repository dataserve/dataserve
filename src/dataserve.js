"use strict";

const Promise = require("bluebird");
const { MiddlewareManager: Manager } = require("js-middleware");
const util = require("util");

const Cache = require("./cache");
const Config = require("./config");
const DB = require("./db");
const Log = require("./log");
const Model = require("./model");
const { middlewareHandler } = require("./middleware");
const { queryHandler } = require("./query");
const { camelize } = require("./util");

class Dataserve {

    constructor(configPath, middlewarePath, dotenvPath, lock){
        //required if dotenv file not already loaded
        if (dotenvPath) {
            require('dotenv').config({path: dotenvPath});
        }
        
        this.log = new Log;
        
        this.config = new Config(configPath);

        this.db = new DB(this.config, this.log);
        
        this.cache = new Cache(this.config, this.log);

        this.middlewareLookup = middlewarePath ? require(this.middlewareLookup) : null;

        this.debug = require("debug")("dataserve");

        this.lock = lock;

        this.model = {};

        this.manager = {};
    }

    dbTable(dbTable) {
        if (dbTable.split(".").length == 1) {
            if (!this.config.dbDefault) {
                throw new Error("No DB specified & config missing default DB, check environment variables or specify .env path");
            }
            
            return this.config.dbDefault + "." + dbTable;
        }
        
        return dbTable;
    }

    initDbTable(dbTable) {
        let [dbName, tableName] = dbTable.split(".");

        let db = this.db.getDb(dbName);

        let cache = this.cache.getCache(dbName);

        let tableConfig = this.config.getTableConfig(dbName, tableName);

        this.model[dbTable] = new Model(this, dbTable, tableConfig, db, cache, this.log, this.lock);

        this.manager[dbTable] = new Manager(this.model[dbTable]);

        this.manager[dbTable].use('run', queryHandler);

        this.manager[dbTable].use('run', middlewareHandler(this.middlewareLookup));

        this.debug("Created dbTable " + dbTable);
    }

    getManager(dbTable) {
        if (!this.manager[dbTable]) {
            this.initDbTable(dbTable);
        }
        
        return this.manager[dbTable];
    }

    getModel(dbTable) {
        if (!this.model[dbTable]) {
            this.initDbTable(dbTable);
        }
        
        return this.model[dbTable];
    }
    
    run(dbTableCommand, input){
        let [dbTable, command] = dbTableCommand.split(":");
        
        command = camelize(command);

        //TODO: FIX
        if (command === "outputDbSchema") {
            return this.getDb().outputDbSchema(this.dbName, this.dbConfig, this.dataserve);
        }
        
        //TODO: FIX
        if (["flushCache", "outputCache"].indexOf(command) !== -1) {
            return this[command]();
        }
        
        dbTable = this.dbTable(dbTable);

        return this.getModel(dbTable).run({
            command,
            input,
        });
    }
    
}

module.exports = Dataserve;
