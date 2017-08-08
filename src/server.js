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
        
        let configPath = cli.config ? cli.config : __dirname + "/../config/example.json";
        if (!fs.existsSync(configPath)) {
            throw new Error("Config file not found: " + configPath);
        }
        let dotenvPath = cli.env ? cli.env : null;

        this.dataserve = new Dataserve(configPath, dotenvPath);

        this.debug = require("debug")("dataserve");
        
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
            this.debug("Redis protocol listening on " + listen);
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
        //this.debug("QUERY", input);

        const command = input[0].toLowerCase();
        const timeStart = microtime.now();
        
        switch (command) {
        case "ds_add":
        case "ds_flush_cache":
        case "ds_get":
        case "ds_get_count":
        case "ds_get_multi":
        case "ds_lookup":
        case "ds_output_cache":
        case "ds_set":
        case "ds_remove":
        case "ds_remove_multi":
            {
                let dbTable = input[1], payload = {};
                try {
                    payload = JSON.parse(input[2]);
                } catch (error) {}
                this.dataserve.run(dbTable + ":" + command.substr(3), payload)
                    .then(output => {
                        let timeRun = (microtime.now() - timeStart) / 1000000;
                        if (output.status) {
                            this.debug(timeRun, "CALL SUCCESS");
                        } else {
                            this.debug(timeRun, "CALL FAIL", JSON.stringify(output));//, util.inspect(output, false, null));
                        }
                        response.encode(JSON.stringify(output));
                    })
                    .catch((err) => {
                        this.debug("CALL FAIL:", err);
                        response.encode(JSON.stringify(r(false, "Unknown error")));
                    });
            }
            break;
        case "ds_log":
            response.encode(JSON.stringify(r(true, this.dataserve.log.getAll())));
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
            this.debug("Command not understood: " + command);
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
