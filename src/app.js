#!/usr/bin/env nodejs

require('dotenv').config({path: "../.env"});

const util = require("util");
const redisd = require("./redis-protocol/lib/index");
const microtime = require("microtime");
const Model = require("./model");
const config = new (require("./config"))("../config/example.json");
const db = new (require("./db"));
const cache = new (require("./cache"));
const dataserve = new (require("./dataserve"))(Model, config, db, cache);

var server = redisd.createServer(function(command) {
    //console.log("QUERY", command);

    var promise = null;
    var type = command[0].toLowerCase();
    var time_start = microtime.now();
    
    switch (type) {
    case "command":
        {
            this.encode(
                [
                    [
                        "ds_get",
                        3, //arrity
                        ["readonly", "fast"], //flags
                        1, //first key in args
                        2, //last key in args
                        1, //step count
                    ],
                    [
                        "ds_get_multi",
                        3,
                        ["readonly", "fast"],
                        1,
                        2,
                        1,
                    ],
                ]
            );
        }
        return;
    case "ds_add":
    case "ds_get":
    case "ds_get_multi":
    case "ds_lookup":
    case "ds_output_cache":
    case "ds_set":
    case "ds_remove":
    case "ds_remove_multi":
        {
            let db_table = command[1], input = {};
            try {
                input = JSON.parse(command[2]);
            } catch (error) {}
            promise = dataserve.run(db_table + ":" + type.substr(3), input);
        }
        break;
    }
    if (promise) {
        promise.then(output => {
            let time_run = (microtime.now() - time_start) / 1000000;
            if (output.status) {
                console.log(time_run, "CALL SUCCESS");
            } else {
                console.log(time_run, "CALL FAIL:", JSON.stringify(output));//, util.inspect(output, false, null));
            }
            this.encode(JSON.stringify(output));
        });
    } else {
        console.log("COMMAND NOT UNDERSTOOD");
        this.encode("ERROR");
    }
});

server.listen(6380, function() {
    console.log("fake redis started");
});
