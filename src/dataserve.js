"use strict"

const util = require("util");

const {r, int_array} = require("./util");
const Cache = require("./cache");
const Config = require("./config");
const DB = require("./db");
const Model = require("./model");
const Query = require("./query");

class Dataserve {

    constructor(config_path, dotenv_path){
        //required if dotenv file not already loaded
        if (dotenv_path) {
            require('dotenv').config({path: dotenv_path});
        }
        
        this._model_class = Model;
        this._db = new DB;
        this._cache = new Cache;

        this._config = new Config(config_path);
        
        this._model = {};
        this._db_default = null;
        if (this._config.db._default_) {
            this._db_default = this._config.db._default_;
        }
    }

    db_table(db_table) {
        if (db_table.split(".").length == 1) {
            if (!this._db_default) {
                throw new Error("No DB specified & config missing default DB");
            }
            return this._db_default + "." + db_table;
        }
        return db_table;
    }
    
    get_model(db_table) {
        if (!this._model[db_table]) {
            this._model[db_table] = new this._model_class(this, this._config, this._db, this._cache, db_table);
            if (process.env.APP_DEBUG) {
                console.log("CREATED", db_table);
            }
        }
        return this._model[db_table];
    }
    
    run(db_table_command, input){
        let [db_table, command] = db_table_command.split(":");
        db_table = this.db_table(db_table);
               
        return this.get_model(db_table).run(command, input);
    }
    
}

module.exports = Dataserve;
