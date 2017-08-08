"use strict"

const util = require("util");

const Cache = require("./cache");
const Config = require("./config");
const DB = require("./db");
const Model = require("./model");
const Query = require("./query");

class Dataserve {

    constructor(configPath, dotenvPath){
        //required if dotenv file not already loaded
        if (dotenvPath) {
            require('dotenv').config({path: dotenvPath});
        }
        
        this.modelClass = Model;
        this.db = new DB;
        this.cache = new Cache;

        this.config = new Config(configPath);
        
        this.model = {};
        this.dbDefault = null;
        if (this.config.dbDefault) {
            this.dbDefault = this.config.dbDefault
        }
    }

    dbTable(dbTable) {
        if (dbTable.split(".").length == 1) {
            if (!this.dbDefault) {
                throw new Error("No DB specified & config missing default DB, check environment variables or specify .env path");
            }
            return this.dbDefault + "." + dbTable;
        }
        return dbTable;
    }
    
    getModel(dbTable) {
        if (!this.model[dbTable]) {
            this.model[dbTable] = new this.modelClass(this, this.config, this.db, this.cache, dbTable);
            if (process.env.APP_DEBUG) {
                console.log("CREATED", dbTable);
            }
        }
        return this.model[dbTable];
    }
    
    run(dbTableCommand, input){
        let [dbTable, command] = dbTableCommand.split(":");
        dbTable = this.dbTable(dbTable);
        return this.getModel(dbTable).run(command, input);
    }
    
}

module.exports = Dataserve;
