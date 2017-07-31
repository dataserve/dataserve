'use strict'

const mysql = require('mysql');
const util = require("util");

class MySql {
    
    constructor(db_name, config){
        if (!config.connectionLimit) {
            config.connectionLimit = 10;
        }
        this._pool = mysql.createPool({
            connectionLimit: config.connectionLimit,
            host: config.host,
            user: config.user,
            password: config.password,
            database: db_name,
            multipleStatements: true,
        });
        this._query("SHOW VARIABLES LIKE 'max_connections'")
            .then(rows => {
                if (rows[0].Value < config.connectionLimit) {
                    throw new Error("Mysql max_connections less than connectionLimit");
                }
            });
    }

    query(sql, bind={}, ret_type=null) {
        var force_master = false;
        if (this._master) {
            force_master = true;
            this._master = false;
        }
        
        var query_type = sql.substring(0, 8).toUpperCase();
        if (query_type.indexOf("SELECT") == 0) {
            query_type = "SELECT";
        } else if (query_type.indexOf("UPDATE") == 0) {
            query_type = "UPDATE";
        } else if (query_type.indexOf("INSERT") == 0) {
            query_type = "INSERT";
        } else if (query_type.indexOf("REPLACE") == 0) {
            query_type = "REPLACE";
        } else if (query_type.indexOf("DELETE") == 0
                   || query_type.indexOf("TRUNCATE") == 0) {
            query_type = "DELETE";
        } else {
            query_type = null;
        }

        return this._query(sql, bind, force_master)
            .then(rows => {
                if (query_type == "SELECT") {
                    if (typeof(ret_type) === "boolean" && ret_type) {
                        if (rows.length) {
                            return rows[0];
                        }
                        return rows;
                    }
                    if (typeof(ret_type) === "string") {
                        if (!rows.length) {
                            return {};
                        }
                        let res = {};
                        for (let row in rows) {
                            res[rows[row][ret_type]] = rows[row];
                        }
                        return res;
                    }
                    return rows;
                }
                if (query_type == "INSERT") {
                    return {
                        insertId: rows.insertId,
                    };
                }
                if (query_type == "DELETE") {
                    return {
                        affectedRows: rows.affectedRows,
                    };
                }
                if (query_type == "UPDATE" || query_type == "REPLACE") {
                    return {
                        affectedRows: rows.affectedRows,
                        changedRows: rows.changedRows,
                    };
                }
                return null;
            });
    }

    query_multi(input) {
        var force_master = false;
        if (this._master) {
            force_master = true;
            this._master = false;
        }

        let queries = [], sql_concat = [];
        for (let sql of input) {
            let query = {};
            let query_type = sql.substring(0, 8).toUpperCase();
            if (query_type.indexOf("SELECT") == 0) {
                query_type = "SELECT";
            } else if (query_type.indexOf("UPDATE") == 0) {
                query_type = "UPDATE";
            } else if (query_type.indexOf("INSERT") == 0) {
                query_type = "INSERT";
            } else if (query_type.indexOf("REPLACE") == 0) {
                query_type = "REPLACE";
            } else if (query_type.indexOf("DELETE") == 0
                       || query_type.indexOf("TRUNCATE") == 0) {
                query_type = "DELETE";
            } else {
                query_type = null;
            }
            query = {
                sql: sql,
                type: query_type
            };
            queries.push(query);
            sql_concat.push(sql);
        }
        return this._query(sql_concat.join(";"))
            .then(results => {
                var output = [];
                for (let index in results) {
                    let query = queries[index];
                    let rows = results[index];
                    if (query.type == "SELECT") {
                        if (typeof(ret_type) === "boolean" && ret_type) {
                            if (rows.length) {
                                output.push(rows[0]);
                            } else {
                                output.push(rows);
                            }
                            continue;
                        }
                        if (typeof(ret_type) === "string") {
                            if (!rows.length) {
                                output.push({});
                            } else {
                                let res = {};
                                for (let row in rows) {
                                    res[rows[row][ret_type]] = rows[row];
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
    
    _query(sql, bind, force_master, db_override){
        return new Promise((resolve, reject) => {
            this._pool.getConnection((err, connection) => {
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

                if (false) {
                    console.log(sql);
                }

                connection.query(sql, bind, (error, results, fields) => {
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
