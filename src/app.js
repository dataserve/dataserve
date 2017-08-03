#!/usr/bin/env nodejs

const cli = require("commander");
const fs = require("fs");
const microtime = require("microtime");
const {r} = require("./util");
const redisd = require("./redis-protocol/lib/index");
const util = require("util");

let dotenv = "../.env", dotenv_dev = "../.env_dev";
if (fs.existsSync(dotenv_dev)) {
    dotenv = dotenv_dev;
}
require('dotenv').config({path: dotenv});

const Model = require("./model");
const config = new (require("./config"))("../config/example.json");
const db = new (require("./db"));
const cache = new (require("./cache"));
const dataserve = new (require("./dataserve"))(Model, config, db, cache);

cli.version('0.0.2')
    .option('-p, --port <n>', 'Port', parseInt)
    .parse(process.argv);

const server = redisd.createServer(function(input) {
    //console.log("QUERY", input);

    const command = input[0].toLowerCase();
    const time_start = microtime.now();
    
    switch (command) {
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
            let db_table = input[1], payload = {};
            try {
                payload = JSON.parse(input[2]);
            } catch (error) {}
            dataserve.run(db_table + ":" + command.substr(3), payload)
                .then(output => {
                    let time_run = (microtime.now() - time_start) / 1000000;
                    if (output.status) {
                        if (process.env.APP_DEBUG) {
                            console.log(time_run, "CALL SUCCESS");
                        }
                    } else {
                        if (process.env.APP_DEBUG) {
                            console.log(time_run, "CALL FAIL:", JSON.stringify(output));//, util.inspect(output, false, null));
                        }
                    }
                    this.encode(JSON.stringify(output));
                })
                .catch(() => {
                    this.encode(JSON.stringify(r(false, "Unknown error")));
                });
        }
        break;
    default:
        console.log("Command not understood: " + command);
        this.encode(JSON.stringify(r(false, "Command not understood: " + command)));
        break;
    }
});

let port = cli.port ? cli.port : 6380;
server.listen(port, function() {
    console.log("Redis protocol listening on port " + port);
});
