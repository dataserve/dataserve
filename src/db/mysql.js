'use strict'

const microtime = require('microtime');
const mysql = require('mysql');
const Type = require('type-of-is');
const util = require("util");

class MySql {
    
    constructor(dbName, config){
        this.debug = require("debug")("dataserve:mysql");
        this.replicated = false;

        if (config.write && config.read) {
            this.configReplicated(dbName, config);
            this.replicated = true;
        } else {
            this.configSingle(dbName, config);
        }
    }

    configSingle(dbName, config) {
        if (!config.connectionLimit) {
            config.connectionLimit = 10;
        }
        let opt = {
            connectionLimit: config.connectionLimit,
            host: config.host,
            user: config.user,
            password: config.password,
            database: dbName,
            multipleStatements: true,
        };
        if (config.port) {
            opt.port = config.port;
        }
        this.pool = mysql.createPool(opt);
        this._query("SHOW VARIABLES LIKE 'max_connections'")
            .then(rows => {
                if (rows[0].Value < config.connectionLimit) {
                    throw new Error("Mysql max_connections less than connectionLimit");
                }
            });
    }

    configReplicated(dbName, config){
        this.pools = {
            write: null,
            read: null,
        };
        if (!config.write.connectionLimit) {
            config.write.connectionLimit = 10;
        }
        let writeOpt = {
            connectionLimit: config.write.connectionLimit,
            host: config.write.host,
            user: config.write.user,
            password: config.write.password,
            database: dbName,
            multipleStatements: true,
        };
        if (config.write.port) {
            writeOpt.port = config.write.port;
        }
        this.pools.write = mysql.createPool(opt);
        this._query("SHOW VARIABLES LIKE 'max_connections'")
            .then(rows => {
                if (rows[0].Value < config.write.connectionLimit) {
                    throw new Error("Mysql WRITE: max_connections less than connectionLimit");
                }
            });
        if (!config.read.connectionLimit) {
            config.read.connectionLimit = 10;
        }
        let readOpt = {
            connectionLimit: config.read.connectionLimit,
            host: config.read.host,
            user: config.read.user,
            password: config.read.password,
            database: dbName,
            multipleStatements: true,
        };
        if (config.read.port) {
            readOpt.port = config.read.port;
        }
        this.pools.read = mysql.createPool(opt);
        this._query("SHOW VARIABLES LIKE 'max_connections'")
            .then(rows => {
                if (rows[0].Value < config.read.connectionLimit) {
                    throw new Error("Mysql READ: max_connections less than connectionLimit");
                }
            });
    }

    query(sql, bind={}, retType=null, forceEndpoint=null) {
        var queryType = sql.substring(0, 8).toUpperCase();
        if (queryType.indexOf("SELECT") == 0) {
            queryType = "SELECT";
            if (!forceEndpoint) {
                forceEndpoint = "read";
            }
        } else if (queryType.indexOf("UPDATE") == 0) {
            queryType = "UPDATE";
            forceEndpoint = "write";
        } else if (queryType.indexOf("INSERT") == 0) {
            queryType = "INSERT";
            forceEndpoint = "write";
        } else if (queryType.indexOf("REPLACE") == 0) {
            queryType = "REPLACE";
            forceEndpoint = "write";
        } else if (queryType.indexOf("DELETE") == 0
                   || queryType.indexOf("TRUNCATE") == 0) {
            queryType = "DELETE";
            forceEndpoint = "write";
        } else {
            queryType = null;
        }

        return this._query(sql, bind, forceEndpoint)
            .then(rows => {
                if (queryType == "SELECT") {
                    if (typeof(retType) === "boolean" && retType) {
                        if (!rows.length) {
                            return {};
                        }
                        return rows[0];
                    }
                    if (typeof(retType) === "string") {
                        if (!rows.length) {
                            return {};
                        }
                        let res = {};
                        for (let row in rows) {
                            res[rows[row][retType]] = rows[row];
                        }
                        return res;
                    }
                    return rows;
                }
                if (queryType == "INSERT") {
                    return {
                        insertId: rows.insertId,
                    };
                }
                if (queryType == "DELETE") {
                    return {
                        affectedRows: rows.affectedRows,
                    };
                }
                if (queryType == "UPDATE" || queryType == "REPLACE") {
                    return {
                        affectedRows: rows.affectedRows,
                        changedRows: rows.changedRows,
                    };
                }
                return null;
            });
    }

    queryMulti(input, bind={}, forceEndpoint=null) {
        let queries = [], sqlConcat = [], lastQueryType = null;
        for (let sql of input) {
            let query = {};
            let queryType = sql.substring(0, 8).toUpperCase();
            if (lastQueryType && queryType !== lastQueryType) {
                return Promise.reject("Every query must be of same type in queryMulti");
            }
            if (queryType.indexOf("SELECT") == 0) {
                queryType = "SELECT";
                if (!forceEndpoint) {
                    forceEndpoint = "read";
                }
            } else if (queryType.indexOf("UPDATE") == 0) {
                queryType = "UPDATE";
                forceEndpoint = "write";
            } else if (queryType.indexOf("INSERT") == 0) {
                queryType = "INSERT";
                forceEndpoint = "write";
            } else if (queryType.indexOf("REPLACE") == 0) {
                queryType = "REPLACE";
                forceEndpoint = "write";
            } else if (queryType.indexOf("DELETE") == 0
                       || queryType.indexOf("TRUNCATE") == 0) {
                queryType = "DELETE";
                forceEndpoint = "write";
            } else {
                queryType = null;
            }
            query = {
                sql: sql,
                type: queryType
            };
            queries.push(query);
            sqlConcat.push(sql);
            lastQueryType = queryType;
        }
        return this._query(sqlConcat.join(";"), bind, forceEndpoint)
            .then(results => {
                var output = [];
                for (let index in results) {
                    let query = queries[index];
                    let rows = results[index];
                    if (query.type == "SELECT") {
                        if (typeof(retType) === "boolean" && retType) {
                            if (rows.length) {
                                output.push(rows[0]);
                            } else {
                                output.push(rows);
                            }
                            continue;
                        }
                        if (typeof(retType) === "string") {
                            if (!rows.length) {
                                output.push({});
                            } else {
                                let res = {};
                                for (let row in rows) {
                                    res[rows[row][retType]] = rows[row];
                                }
                                output.push(res);
                            }
                            continue;
                        }
                        output.push(rows);
                        continue;
                    }
                    if (query.type == "INSERT") {
                        output.push({
                            insertId: rows.insertId,
                        });
                        continue;
                    }
                    if (query.type == "DELETE") {
                        output.push({
                            affectedRows: rows.affectedRows,
                        });
                        continue;
                    }
                    if (query.type == "UPDATE" || query.type == "REPLACE") {
                        output.push({
                            affectedRows: rows.affectedRows,
                            changedRows: rows.changedRows,
                        });
                        continue;
                    }
                    output.push(null);
                    continue;
                }
                return output;
            });
    }
    
    _query(sql, bind, forceEndpoint){
        var pool = null;
        if (!this.replicated) {
            pool = this.pool;
        } else {
            if (Type.is(forceEndpoint, String)
                && forceEndpoint === "read") {
                pool = this.pool.read;
            } else {
                pool = this.pool.write;
            }
        }
        return new Promise((resolve, reject) => {
            pool.getConnection((err, connection) => {
                if (err) {
                    return reject(err);
                }
                connection.config.queryFormat = function(query, values) {
                    if (!values) {
                        return query;
                    }
                    return query.replace(/\:(\w+)/g, (txt, key) => {
                        if (values.hasOwnProperty(key)) {
                            return this.escape(values[key]);
                        }
                        return txt;
                    });
                };

                var timeStart = null;
                if (this.debug.enabled) {
                    timeStart = microtime.now();
                }

                connection.query(sql, bind, (error, results, fields) => {
                    if (this.debug.enabled) {
                        this.debug((microtime.now() - timeStart) / 1000000, sql, bind);
                    }
                    connection.release();

                    if (error) {
                        return reject(error);
                    }

                    return resolve(results);
                });
            });
        });
    }

}

module.exports = MySql;
