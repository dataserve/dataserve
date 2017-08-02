"use strict"

const Query = require("./query");
const util = require("util");
const {r, int_array} = require("./util");

class DataServe {

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
        
        let model = this.get_model(db_table);
        let query = new Query(input, command, model);
        
        //POPULATE HOOKS
        var hooks = {
            pre: [],
            post: [],
        };
        switch (command) {
        case "add":
        case "lookup":
        case "set":
            this["hooks_" + command](db_table, hooks);
            break;
        }
        //RUN COMMAND
        switch (command) {
        case "add":
        case "get":
        case "get_count":
        case "get_multi":
        case "lookup":
        case "remove":
        case "remove_multi":
        case "set":
            return model[command](query, hooks);
        case "output_cache":
            return model[command]();
        }
        throw new Error("invalid command: " + command);
    }

    hooks_add(db_table, hooks) {
        hooks.pre.push(query => {
            console.log("WHATS UP");
        });
    }
    
    hooks_lookup(db_table, hooks) {
        hooks.pre.push(query => {
            let model = this.get_model(db_table);
            let table_config = model.table_config();
            let where = [], bind = {}, input = null;
            if (input = query.raw('=')) {
                for (let field in input) {
                    if (!model.get_field(field)) {
                        continue;
                    }
                    let vals = input[field];
                    if (!Array.isArray(vals)) {
                        vals = [vals];
                    }
                    if (model.get_field(field).type == "int") {
                        vals = int_array(vals);
                        where.push(query.alias + "." + field + " IN (" + vals.join(",") + ") ");
                    } else {
                        vals = [...new Set(vals)];
                        let wh = [], cnt = 1;
                        for (let val of vals) {
                            wh.push(":" + field + cnt);
                            bind[field + cnt] = val;
                            ++cnt;
                        }
                        where.push(field + " IN (" + wh.join(",") + ")");
                    }
                }
            }
            if (input = query.raw("%search")) {
                for (let field in input) {
                    if (!model.get_field(field)) {
                        continue;
                    }
                    where.push(query.alias + "." + field + " LIKE :" + field);
                    bind[field] = "%" + input[field];
                }
            }
            if (input = query.raw("search%")) {
                for (let field in input) {
                    if (!model.get_field(field)) {
                        continue;
                    }
                    where.push(query.alias + "." + field + " LIKE :" + field);
                    bind[field] = input[field] + "%";
                }
            }
            if (input = query.raw("%search%")) {
                for (let field in input) {
                    if (!model.get_field(field)) {
                        continue;
                    }
                    where.push(query.alias + "." + field + " LIKE :" + field);
                    bind[field] = "%" + input[field] + "%";
                }
            }
            if (input = query.raw(">")) {
                for (let field in input) {
                    if (!model.get_field(field)) {
                        continue;
                    }
                    where.push(":" + field + "_greater < " + query.alias + "." + field);
                    bind[field + "_greater"] = parseInt(input[field], 10);
                }
            }
            if (input = query.raw(">=")) {
                for (let field in input) {
                    if (!model.get_field(field)) {
                        continue;
                    }
                    where.push(":" + field + "_greater_equal <= " + query.alias + "." + field);
                    bind[field + "_greater_equal"] = parseInt(input[field], 10);
                }
            }
            if (input = query.raw("<")) {
                for (let field in input) {
                    if (!model.get_field(field)) {
                        continue;
                    }
                    where.push(query.alias + "." + field + " < :" + field + "_less");
                    bind[field + "_less"] = parseInt(input[field], 10);
                }
            }
            if (input = query.raw("<=")) {
                for (let field in input) {
                    if (!model.get_field(field)) {
                        continue;
                    }
                    where.push(query.alias + "." + field + ". <= :" + field + "_less_equal");
                    bind[field + "_less_equal"] = parseInt(input[field], 10);
                }
            }
            if (input = query.raw("modulo")) {
                for (let field in input) {
                    if (!model.get_field(field)) {
                        continue;
                    }
                    where.push(query.alias + "." + field + " % :" + field + "_modulo_mod = :" + field + "_modulo_val");
                    bind[field + "_modulo_mod"] = parseInt(input[field]["mod"], 10);
                    bind[field + "_modulo_val"] = parseInt(input[field]["val"], 10);
                }
            }
            query.add_where(where, bind);
        });
        hooks.post.push(result => {
            console.log("WHATS UP OUT");
            return result;
        });
    }

    hooks_set(db_table, hooks) {
        hooks.pre.push(query => {
            console.log("WHATS UP");
        });
    }
    
}

module.exports = DataServe;
