"use strict";

const util = require("util");

const Cache = require("./cache");
const Config = require("./config");
const DB = require("./db");
const Log = require("./log");
const Model = require("./model");
const Query = require("./query");
const {camelize} = require("./util");

class Dataserve {

    constructor(configPath, dotenvPath, lock){
        //required if dotenv file not already loaded
        if (dotenvPath) {
            require('dotenv').config({path: dotenvPath});
        }
        
        this.modelClass = Model;
        
        this.log = new Log;
        
        this.db = new DB(this.log);
        
        this.cache = new Cache(this.log);

        this.config = new Config(configPath);

        this.debug = require("debug")("dataserve");

        this.lock = lock;

        this.model = {};
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
    
    getModel(dbTable) {
        if (!this.model[dbTable]) {
            let [dbName] = dbTable.split(".");

            let db = this.db.getDb(dbName, this.config.dbs[dbName]);

            let cache = this.cache.getCache(dbName, this.config.dbs[dbName]);

            let dbConfig = this.config.getDbConfig(dbName);
            
            this.model[dbTable] = new this.modelClass(this, dbConfig, db, cache, dbTable, this.log, this.lock);
            
            this.debug("Created model " + dbTable);
        }
        
        return this.model[dbTable];
    }
    
    run(dbTableCommand, input){
        let [dbTable, command] = dbTableCommand.split(":");
        
        command = camelize(command);
        
        dbTable = this.dbTable(dbTable);
        
        return this.getModel(dbTable).run(command, input);
    }
    
}

module.exports = Dataserve;
