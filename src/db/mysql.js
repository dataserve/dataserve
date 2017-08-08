'use strict'

const microtime = require('microtime');
const mysql = require('mysql');
const Type = require('type-of-is');
const util = require("util");

const {intArray, r} = require("../util");

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

    add(model, query) {
        let cols = [], vals = [], bind = [], primaryKeyVal = null;
        for (let field in query.fields) {
            cols.push(field);
            if (model.getField(field).type == "int") {
                vals.push(parseInt(query.fields[field], 10));
            } else {
                vals.push(":" + field);
                bind[field] = query.fields[field];
            }
        }
        if (!model.getField(model.primaryKey).autoinc) {
            if (typeof query.fields[model.primaryKey] === "undefined") {
                return Promise.reject(r(false, "primary key required"));
            }
            primaryKeyVal = query.fields[model.primaryKey];
        }
        let sql = "INSERT INTO " + model.getTable() + " (" + cols.join(",") + ") VALUES (" + vals.join(",") + ")";
        return this.query(sql, bind)
            .then(res => {
                if (!primaryKeyVal) {
                    primaryKeyVal = res.insertId;
                }
                return primaryKeyVal;
            });
    }

    get(model, query, getVals) {
        let where = [], bind = {};
        if (model.getField(query.get.field).type == "int") {
            getVals = intArray(getVals);
            where.push(query.get.field + " IN (" + getVals.join(",") + ")");
        } else {
            getVals = [...new Set(getVals)];
            let wh = [], cnt = 1;
            for (let index in getVals) {
                wh.push(":" + query.get.field + cnt);
                bind[query.get.field + cnt] = getVals[index];
                ++cnt;
            }
            where.push(query.get.field + " IN (" + wh.join(",") + ")");
        }
        let sql = this.select(model);
        sql += this.from(model);
        sql += this.where(where);
        console.log("PRIMARY", model.primaryKey);
        return this.query(sql, bind, model.primaryKey, "write")
    }

    getMulti(model, query) {
        var queries = [];
        if (model.getField(query.getMulti.field) == 'int') {
            query[query.getMulti.field] = intArray(query.getMulti.vals);
            for (let id of query.getMulti.vals) {
                let sql = 'SELECT ' + model.getField(model.primaryKey).name + ' ';
                sql += this.from(model);
                sql += 'WHERE ' + field + '=' + id;
                queries.push(sql);
            }
        } else if (model.getField(query.getMulti.field) == 'string') {
            //TODO
        } else {
            return Promise.resolve(r(false, "invalid field type for multi get:" + model.getField(query.getMulti.field)));
        }
        return this.queryMulti(queries);
    }

    inc(model, query) {
        let vals = query.primaryKey;
        if (!Array.isArray(vals)) {
            vals = [vals];
        }
        vals = intArray(vals);
        let updates = [];
        for (let key in query.fields) {
            updates.push(key + "=" + key + " + " + parseInt(query.fields[key], 10));
        }
        let sql = "UPDATE " + model.getTable() + " SET ";
        sql += updates.join(",");
        sql += "WHERE " + this.primaryKey + " IN (" + vals.join(",") + ")";
        return this.query(sql);
    }

    lookup(model, query) {
        let sqlSelect = "SELECT " + query.alias + "." + model.primaryKey + " "
        let sql = this.from(model, query.alias);
        if (query.join && Array.isArray(query.join) && query.join.length) {
            for (let table in query.join) {
                sql += "INNER JOIN " + table + " ON (" + query.join[table] + ") ";
            }
        }
        if (query.leftJoin && Array.isArray(query.leftJoin) && query.leftJoin.length) {
            for (let table in query.leftJoin) {
                sql += "LEFT JOIN " + table + " ON (" + query.leftTable[table] + ") ";
            }
        }
        
        sql += this.where(query.where);
        let sqlGroup = this.group(query.group);
        sql += sqlGroup;
        sql += this.order(query.order);

        let sqlLimit = this.limit(query);
        
        let sqlRows = sqlSelect + sql + sqlLimit;

        let sqlCnt = "SELECT COUNT(*) AS cnt " + sql;
        if (sqlGroup.length) {
            sqlCnt = "SELECT COUNT(*) AS cnt FROM (" + sqlSelect + sql + ") AS t";
        }

        if (query.isOutputStyle("FOUND_ONLY")) {
            return this.query(sqlCnt, query.bind, true).then(row => {
                let meta = {
                    pages: query.limit.limit ? Math.ceil(row.cnt/query.limit.limit) : null,
                    found: row.cnt,
                };
                return Promise.reject(r(true, [], meta));
            });
        }
        
        return this.query(sqlRows, query.bind, model.primaryKey)
            .then(rows => {
                if (query.isOutputStyle("INCLUDE_FOUND")) {
                    return this.query(sqlCnt, query.bind, true).then(found => [rows, found["cnt"]]);
                } else {
                    return [rows, null];
                }
            });
    }

    set(model, query) {
        var sql = "", updates = [], bind = {};
        if (model.getField(model.primaryKey).setInsert) {
            query.fields[model.primaryKey] = query.primaryKey;
            let cols = [], vals = [];
            for (let field in query.fields) {
                cols.push(field);
                if (model.getField(field).type == "int") {
                    vals.push(parseInt(query.fields[field], 10));
                    if (field != model.primaryKey) {
                        updates.push(field + "=" + parseInt(query.fields[field], 10) + " ");
                    }
                } else {
                    vals.push(":" + field);
                    if (field != model.primaryKey) {
                        updates.push(field + "=:" + field + " ");
                    }
                    bind[field] = query.fields[field];
                }
            }
            sql = "INSERT INTO " + model.getTable() + " (" + cols.join(",") + ") VALUES (" + vals.join(",") + ") ON DUPLICATE KEY UPDATE " + updates.join(",") + " ";
        } else {
            sql = "UPDATE " + model.getTable() + " SET ";
            for (let field in query.fields) {
                if (model.getField(field).type == "int") {
                    updates.push(field + "=" + parseInt(query.fields[field], 10) + " ");
                } else {
                    updates.push(field + "=:" + field + " ");
                    bind[field] = query.fields[field];
                }
            }
            sql += updates.join(",") + " ";
            if (query.custom) {
                if (updates) {
                    sql += ",";
                }
                sql += custom.join(",") + " ";
            }
            if (model.getField(model.primaryKey).type == "int") {
                sql += "WHERE " + model.primaryKey + "=" + parseInt(query.primaryKey, 10);
            } else {
                sql += "WHERE " + model.primaryKey + "=:" + model.primaryKey;
                bind[model.primaryKey] = query.primaryKey;
            }
        }
        return this.query(sql, bind);
    }

    remove(model, query) {
        let vals = query.primaryKey;
        if (!Array.isArray(vals)) {
            vals = [vals];
        }
        let bind = {};
        let sql = "DELETE ";
        sql += this.from(model);
        if (model.getField(model.primaryKey).type == "int") {
            vals = intArray(vals);
            sql += "WHERE " + model.primaryKey + " IN (" + vals.join(",") + ")";
        } else {
            vals = [...new Set(vals)];
            let wh = [], cnt = 1;
            for (let key in vals) {
                wh.push(":" + model.primaryKey + cnt);
                bind[model.primaryKey + cnt] = vals[key];
                ++cnt;
            }
            sql += "WHERE " + model.primaryKey + " IN (" + wh.join(",") + ")";
        }
        return this.query(sql, bind);
    }

    select(model, raw=""){
        if (raw) {
            return "SELECT " + raw + " ";
        }
        return "SELECT "
            + Object.keys(model.fields).join(",")
            + (model.timestamps && model.timestamps.created ? ",UNIX_TIMESTAMP(" + model.timestamps.created.name + ") AS " + model.timestamps.created.name : "")
            + (model.timestamps && model.timestamps.modified ? ",UNIX_TIMESTAMP(" + model.timestamps.modified.name + ") AS " + model.timestamps.modified.name : "")
            + " ";
    }

    from(model, alias="") {
        return "FROM " + model.getTable() + " " + (alias?alias + " ":"");
    }

    where(where){
        if (!where || !Array.isArray(where) || !where.length) {
            return "";
        }
        return "WHERE " + where.join(" AND ") + " ";
    }

    group(group){
        if (!group || !Array.isArray(group) || !group.length) {
            return "";
        }
        return "GROUP BY " + group.join(",") + " ";
    }

    order(order){
        if (!order || !Array.isArray(order) || !order.length) {
            return "";
        }
        return "ORDER BY " + order.join(",") + " ";
    }

    limit(query){
        if (!query.limit.page || !query.limit.limit) {
            return "";
        }
        let page = parseInt(query.limit.page, 10) - 1;
        let limit = parseInt(query.limit.limit, 10);
        let offset = page * limit;
        return "LIMIT " + offset + "," + limit;
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
