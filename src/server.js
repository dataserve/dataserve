#!/usr/bin/env nodejs

const cli = require("commander");
const fs = require("fs");
const microtime = require("microtime");
const net = require('net');
const Parser = require('redis-parser');
const util = require("util");

const Dataserve = require("./dataserve");
const {version} = require('../package.json');
const {Response} = require('./server/encoder');
const {r} = require("./util");

class Server {
    
    constructor(cli) {
        this.cli = cli;
        
        let config_path = cli.config ? cli.config : __dirname + "/../config/example.json";
        if (!fs.existsSync(config_path)) {
            throw new Error("Config file not found: " + config_path);
        }
        let dotenv_path = cli.env ? cli.env : null;

        this.dataserve = new Dataserve(config_path, dotenv_path);
        this.server = this.createServer();

        let listen = cli.port ? cli.port : 6380;
        if (cli.socket) {
            listen = cli.socket;
            if (fs.existsSync(cli.socket)) {
                fs.unlinkSync(cli.socket);
            }
        }
        this.server.listen(listen, () => {
            if (this.cli.socket) {
                fs.chmodSync(this.cli.socket, '777');
            }
            console.log("Redis protocol listening on " + listen);
        });
    }

    createServer() {
        return net.createServer({}, connection => {
            let response = new Response(connection);
            
            let parser = new Parser({
                returnReply: input => {
                    this.handleCommand(input, response);
                },
                returnError: err => {
                    this.handleCommand("_invalid_", response);
                }
            });

            connection.on('data', data => {
                parser.execute(data);
            });
        });
    }

    handleCommand(input, response) {
        //console.log("QUERY", input);

        const command = input[0].toLowerCase();
        const time_start = microtime.now();
        
        switch (command) {
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
                this.dataserve.run(db_table + ":" + command.substr(3), payload)
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
                        response.encode(JSON.stringify(output));
                    })
                    .catch(() => {
                        response.encode(JSON.stringify(r(false, "Unknown error")));
                    });
            }
            break;
        case "command":
            {
                response.encode(
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
        default:
            console.log("Command not understood: " + command);
            response.encode(JSON.stringify(r(false, "Command not understood: " + command)));
            break;
        }
    }
}

cli.version(version)
    .option('-c, --config <path>', 'Config File path')
    .option('-e, --env <path>', 'Load .env path')
    .option('-p, --port <n>', 'Port', parseInt)
    .option('-s, --socket <path>', 'Socket')
    .parse(process.argv);

const server = new Server(cli);
