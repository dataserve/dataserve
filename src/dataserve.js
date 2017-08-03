"use strict"

const Query = require("./query");
const util = require("util");
const {r, int_array} = require("./util");

class Dataserve {

    constructor(model_class, config, db, cache){
        this._model_class = model_class;
        this._config = config;
        
        this._model = {};
        this._db = db;
        this._cache = cache;
        this._db_default = null;
        if (config.db._default_) {
            this._db_default = config.db._default_;
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
            console.log("CREATED", db_table);
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
