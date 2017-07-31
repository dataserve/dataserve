"use strict"

const util = require("util");
const DB = require("./db");
const Cache = require("./cache");

class DataServe {

    constructor(model_class, config){
        this._model_class = model_class;
        this._config = config;
        
        this._model = {};
        this._db = new DB;
        this._cache = new Cache;
        this._db_default = null;
        if (config.db._default_) {
            this._db_default = config.db._default_;
        }
    }
    
    run(db_table_command, input){
        let [db_table, command] = db_table_command.split(":");
        if (db_table.split(".").length == 1) {
            if (!this._db_default) {
                throw new Error("No DB specified & config missing default DB");
            }
            db_table = this._db_default + "." + db_table;
        }
        if (!this._model[db_table]) {
            this._model[db_table] = new this._model_class(this, this._config, this._db, this._cache, db_table);
            console.log("CREATED", db_table);
        }
        switch (command) {
        case "add":
        case "get":
        case "get_count":
        case "get_multi":
        case "lookup":
        case "remove":
        case "remove_multi":
        case "set":
            return this._model[db_table][command](input);
        }
        throw new Error("invalid command");
    }
}

module.exports = DataServe;
