#!/usr/bin/env nodejs

const cli = require("commander");
const cluster = require("cluster");
const ClusterReadwriteLock = require("cluster-readwrite-lock");
const fs = require("fs");
const microtime = require("microtime");
const net = require('net');
const numCPUs = require("os").cpus().length;
const Parser = require('redis-parser');
const Promise = require("bluebird");
const ReadwriteLock = require("readwrite-lock");
const util = require("util");

const Dataserve = require("./dataserve");
const {version} = require('../package.json');
const {Response} = require('./server/encoder');
const {r} = require("./util");

class Server {
    
    constructor(cli) {
        this.cli = cli;

        this.configPath = cli.config ? cli.config : __dirname + "/../config/example.json";
        
        if (!fs.existsSync(this.configPath)) {
            throw new Error("Config file not found: " + this.configPath);
        }
        
        this.dotenvPath = cli.env ? cli.env : null;

        if (this.dotenvPath) {
            if (!fs.existsSync(this.dotenvPath)) {
                throw new Error("Dotenv file not found: " + configPath);
            }
            
            require('dotenv').config({path: this.dotenvPath});
        }

        this.debug = require("debug")("dataserve");

        this.listen = cli.port ? cli.port : 6380;
            
        if (this.cli.socket) {
            this.listen = this.cli.socket;
            
            this.isSocket = true;
        } else {
            this.isSocket = false;
        }

        this.workers = 1 < cli.workers ? cli.workers : 1;

        let opt = {
            Promise: Promise,
            maxPending: 5000
        };
        
        this.lock = 1 < this.workers ? new ClusterReadwriteLock(cluster, opt) : new ReadwriteLock(opt);
    }

    start() {
        return new Promise((resolve, reject) => {
            if (cluster.isMaster) {
                if (this.isSocket) {
                    if (fs.existsSync(this.listen)) {
                        fs.unlinkSync(this.listen);
                    }
                }
                
                this.debug(`Master ${process.pid} is running`);
            } else {
                this.debug(`Worker ${process.pid} started`);
            }

            if (1 < this.workers && cluster.isMaster) {
                let onlineCnt = 0, resolved = false;
                
                cluster.on('message', (worker, msg, handle) => {
                    if (msg === "WORKER-ONLINE") {
                        ++onlineCnt;
                        if (!resolved && onlineCnt == this.workers) {
                            resolved = true;
                            resolve();
                        }
                    }
                });
                
                cluster.on('exit', (worker, code, signal) => {
                    this.debug(`Worker ${worker.process.pid} died`);

                    --onlineCnt;
                    
                    cluster.fork();
                });
                
                // Fork workers.
                for (let i = 0; i < this.workers; ++i) {
                    cluster.fork();
                }
            } else {
                this.dataserve = new Dataserve(this.configPath, null, this.lock);
                
                this.server = this.createServer();

                this.server.listen(this.listen, () => {
                    if (this.isSocket) {
                        if (fs.existsSync(this.listen)) {
                            fs.chmodSync(this.listen, '777');
                        }
                    }
                    
                    this.debug("Redis protocol listening on " + this.listen);

                    if (cluster.isMaster) {
                        resolve();
                    } else {
                        process.send("WORKER-ONLINE");
                    }
                });
            }
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
        
        switch (command) {
        case "ds_add":
        case "ds_flush_cache":
        case "ds_get":
        case "ds_get_count":
        case "ds_get_multi":
        case "ds_inc":
        case "ds_lookup":
        case "ds_output_cache":
        case "ds_output_db_schema":
        case "ds_output_table_schema":
        case "ds_set":
        case "ds_remove":
        case "ds_remove_multi":
            return this.handleCommandRun(input, command, response);
        case "ds_log":
            return response.encode(JSON.stringify(r(true, this.dataserve.log.getAll())));
        case "command":
            return this.handleCommandDoc(input, command, response);
        }

        return this.handleCommandUnknown(input, command, response);
    }

    handleCommandRun(input, command, response) {
        const timeStart = microtime.now();
        
        let dbTable = input[1], payload = {};
        
        try {
            payload = JSON.parse(input[2]);
        } catch (error) {}

        let dbTableCommand = dbTable + ":" + command.substr(3);
        
        this.dataserve.run(dbTableCommand, payload)
            .then(output => {
                let timeRun = (microtime.now() - timeStart) / 1000000;
                
                if (output && output.status) {
                    this.debug(timeRun, "CALL SUCCESS", dbTableCommand);
                } else {
                    this.debug(timeRun, "CALL FAIL", JSON.stringify(output));//, util.inspect(output, false, null));
                }
                
                response.encode(JSON.stringify(output));
            })
            .catch(err => {
                this.debug("CALL FAIL:", err);
                
                response.encode(JSON.stringify(r(false, "Unknown error")));
            });
    }

    handleCommandDoc(input, command, response) {
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

    handleCommandUnknown(input, command, response) {
        this.debug("Command not understood: " + command);
            
        response.encode(JSON.stringify(r(false, "Command not understood: " + command)));
    }

}

function startServer() {
    const server = new Server(cli);
    
    return server.start();
}

cli.version(version)
    .option('-c, --config <path>', 'Config File path')
    .option('-e, --env <path>', 'Load .env path')
    .option('-p, --port <n>', 'Port', parseInt)
    .option('-s, --socket <path>', 'Socket')
    .option('-w, --workers <n>', 'Forked Workers', parseInt);

cli.command('sql')
    .description('Output Generated SQL')
    .action(() => {
        cli.workers = 1;
        
        startServer().then(() => {
            //TODO: run SQL command and exit
        });

cli.parse(process.argv);

if (!cli.args.length) {
    startServer();
}
