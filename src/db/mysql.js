'use strict'

const mysql = require('mysql');
const util = require("util");
const microtime = require('microtime');

class MySql {
    
    constructor(dbName, config){
        this.debug = process.env.APP_DEBUG;
        
        if (!config.connectionLimit) {
            config.connectionLimit = 10;
        }
        this.pool = mysql.createPool({
            connectionLimit: config.connectionLimit,
            host: config.host,
            user: config.user,
            password: config.password,
            database: dbName,
            multipleStatements: true,
        });
        this._query("SHOW VARIABLES LIKE 'max_connections'")
            .then(rows => {
                if (rows[0].Value < config.connectionLimit) {
                    throw new Error("Mysql max_connections less than connectionLimit");
                }
            });
    }

    query(sql, bind={}, retType=null) {
        var forceMaster = false;
        if (this.master) {
            forceMaster = true;
            this.master = false;
        }
        
        var queryType = sql.substring(0, 8).toUpperCase();
        if (queryType.indexOf("SELECT") == 0) {
            queryType = "SELECT";
        } else if (queryType.indexOf("UPDATE") == 0) {
            queryType = "UPDATE";
        } else if (queryType.indexOf("INSERT") == 0) {
            queryType = "INSERT";
        } else if (queryType.indexOf("REPLACE") == 0) {
            queryType = "REPLACE";
        } else if (queryType.indexOf("DELETE") == 0
                   || queryType.indexOf("TRUNCATE") == 0) {
            queryType = "DELETE";
        } else {
            queryType = null;
        }

        return this._query(sql, bind, forceMaster)
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

    queryMulti(input) {
        var forceMaster = false;
        if (this.master) {
            forceMaster = true;
            this.master = false;
        }

        let queries = [], sqlConcat = [];
        for (let sql of input) {
            let query = {};
            let queryType = sql.substring(0, 8).toUpperCase();
            if (queryType.indexOf("SELECT") == 0) {
                queryType = "SELECT";
            } else if (queryType.indexOf("UPDATE") == 0) {
                queryType = "UPDATE";
            } else if (queryType.indexOf("INSERT") == 0) {
                queryType = "INSERT";
            } else if (queryType.indexOf("REPLACE") == 0) {
                queryType = "REPLACE";
            } else if (queryType.indexOf("DELETE") == 0
                       || queryType.indexOf("TRUNCATE") == 0) {
                queryType = "DELETE";
            } else {
                queryType = null;
            }
            query = {
                sql: sql,
                type: queryType
            };
            queries.push(query);
            sqlConcat.push(sql);
        }
        return this._query(sqlConcat.join(";"))
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
    
    _query(sql, bind, forceMaster, dbOverride){
        return new Promise((resolve, reject) => {
            this.pool.getConnection((err, connection) => {
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
                if (this.debug) {
                    timeStart = microtime.now();
                }

                connection.query(sql, bind, (error, results, fields) => {
                    if (this.debug) {
                        console.log((microtime.now() - timeStart) / 1000000, sql, bind);
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
