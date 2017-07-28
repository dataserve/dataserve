"use strict"

const util = require("util");
const DB = require("./db");

class DataServe {

    constructor(model_class, config){
        this._model_class = model_class;
        this._config = config;
        
        this._model = {};
        this._db = new DB;
        this._db_default = null;
        if (config.db._default_) {
            this._db_default = config.db._default_;
        }
    }
    
    run_external(command){
        //console.log('query', command);

        var promise = null;
        var type = command[0].toLowerCase();
        
        switch (type) {
        case 'command':
            {
                this.encode(
                    [
                        [
                            'ds_get',
                            3, //arrity
                            ['readonly', 'fast'], //flags
                            1, //first key in args
                            2, //last key in args
                            1, //step count
                        ],
                        [
                            'ds_get_multi',
                            3,
                            ['readonly', 'fast'],
                            1,
                            2,
                            1,
                        ],
                    ]
                );
            }
            break;
        case 'ds_get':
        case 'ds_get_multi':
        case 'ds_set':
        case 'ds_add':
        case 'ds_remove':
        case 'ds_remove_multi':
        case 'ds_lookup':
            {
                let db_table = command[1];
                let input = JSON.parse(command[2]);
                promise = this.run(db_table + ":" + type.substr(3), input);
            }
            break;
        }
        if (promise) {
            promise.then(output => {
                console.log("CALL RESULT:", util.inspect(output, false, null));
                if (output.status) {
                    console.log('CALL SUCCESS');
                } else {
                    console.log('CALL FAIL');
                }
            });
        } else {
            console.log("COMMAND NOT UNDERSTOOD");
        }
    }

    run(db_table_command, input){
        let [db_table, command] = db_table_command.split(":");
        if (db_table.split(".").length == 1) {
            db_table = this._db_default + "." + db_table;
        }
        if (!this._model[db_table]) {
            this._model[db_table] = new this._model_class(this, this._config, this._db, db_table);
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
