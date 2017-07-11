"use strict"

const util = require("util");

class Command {

    constructor(){
        this._model = {};
    }
    
    run_external(command){
        console.log('query', command);

        var promise = null;
        
        switch (command[0].toLowerCase()) {
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
                promise = this.run_internal("get", db_table, input);
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

    run_internal(command, db_table, input){
        if (!this._model[db_table]) {
            let DataServe = require('./dataserve');
            this._model[db_table] = new DataServe(db_table);
            console.log("CREATED", db_table);
        }
        switch (command) {
        case "get":
            return this._model[db_table].get(input);
        case "get_multi":
            return this._model[db_table].get_multi(input);
        case "set":
            return this._model[db_table].set(input);
        case "add":
            return this._model[db_table].add(input);
        case "remove":
            return this._model[db_table].remove(input);
        case "remove_multi":
            return this._model[db_table].remove_multi(input);
        case "lookup":
            return this._model[db_table].lookup(input);
        }
        throw new Error("invalid command");
    }
}

const command = new Command;
    
module.exports = command;
