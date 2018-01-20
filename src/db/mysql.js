'use strict';

const Promise = require('bluebird');
const microtime = require('microtime');
const mysql = require('mysql');
const Type = require('type-of-is');
const util = require('util');

const { createResult } = require('../result');
const { intArray } = require('../util');

class MySql {
    
    constructor(dbName, config, log){
        this.debug = require('debug')('dataserve:mysql');
        
        this.log = log;
        
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
        
        this._query("SHOW VARIABLES LIKE 'max_connections'").then((rows) => {
            if (rows[0].Value < config.connectionLimit) {
                throw new Error(`Mysql max_connections less than connectionLimit, ${rows[0].Value} < ${config.connectionLimit}`);
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
        
        this._query("SHOW VARIABLES LIKE 'max_connections'").then((rows) => {
            if (rows[0].Value < config.write.connectionLimit) {
                throw new Error(`Mysql WRITE: max_connections less than connectionLimit, ${rows[0].Value} < ${config.write.connectionLimit}`);
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
        
        this._query("SHOW VARIABLES LIKE 'max_connections'").then((rows) => {
            if (rows[0].Value < config.read.connectionLimit) {
                throw new Error(`Mysql READ: max_connections less than connectionLimit, ${rows[0].Value} < ${config.read.connectionLimit}`);
            }
        });
    }

    validateType(type) {
        type = type.split(':')[0];
        
        switch (type) {
        case 'int':
        case 'tinyint':
        case 'smallint':
        case 'mediumint':
        case 'bigint':
            return 'Integer';
        case 'float':
        case 'decimal':
        case 'double':
            return 'Number';
        case 'string':
        case 'char':
        case 'varchar':
        case 'tinytext':
        case 'text':
        case 'mediumtext':
        case 'longtext':
        case 'enum':
            return 'String';
        case 'set':
            return 'Array';
        case 'date':
            return 'Date';
        case 'datetime':
        case 'timestamp':
            return 'DateTime';
        case 'time':
            return 'Time';
        case 'year':
            return 'Year';
        }
        
        return null;
    }

    add(model, query, fieldsIndex=0) {
        if (model.setInsert) {
            return Promise.reject('Cannot `add` on a setInsert table, use `set` command instead');
        }

        let cols = [], vals = [], bind = [], primaryKeyVal = null;
        
        for (let field in query.getFields(fieldsIndex)) {
            cols.push(field);
            
            if (model.getField(field).type == 'int') {
                vals.push(parseInt(query.getField(fieldsIndex, field), 10));
            } else {
                vals.push(':' + field);
                
                bind[field] = query.getField(fieldsIndex, field).toString();
            }
        }
        
        if (!model.getField(model.primaryKey).autoInc) {
            primaryKeyVal = query.getField(fieldsIndex, model.primaryKey);
            
            if (typeof primaryKeyVal === 'undefined') {
                return Promise.reject('primary key required when not autoIncrementing');
            }
        }
        
        let sql = 'INSERT INTO ' + model.getTableName() + ' (' + cols.join(',') + ') VALUES (' + vals.join(',') + ')';
        
        return this.log.add('db,db:add', () => {
            return this.query(sql, bind);
        }).then((res) => {
            if (!primaryKeyVal) {
                primaryKeyVal = res.insertId;
            }
                
            return primaryKeyVal;
        });
    }

    addMulti(model, query) {
        let promiseRun = [];
        
        for (let fieldsIndex = 0; fieldsIndex < query.getFieldsCnt(); ++fieldsIndex) {
            promiseRun.push(this.add(model, query, fieldsIndex));
        }

        return Promise.all(promiseRun).then((primaryKeyVal) => primaryKeyVal);
    }

    get(model, query, getVals) {
        let where = [], bind = {};
        
        if (model.getField(query.get.field).type == 'int') {
            getVals = intArray(getVals);
            
            where.push(query.get.field + ' IN (' + getVals.join(',') + ')');
        } else {
            getVals = [...new Set(getVals)];
            
            let wh = [], cnt = 1;
            
            for (let index in getVals) {
                wh.push(':' + query.get.field + cnt);
                
                bind[query.get.field + cnt] = getVals[index];
                
                ++cnt;
            }
            
            where.push(query.get.field + ' IN (' + wh.join(',') + ')');
        }
        
        let sql = this.select(model);
        
        sql += this.from(model);
        
        sql += this.where(where);
        
        return this.log.add('db,db:get', () => {
            return this.query(sql, bind, model.primaryKey, 'write')
        });
    }

    getMany(model, query) {
        var queries = [];
        
        if (model.getField(query.getMany.field).type == 'int') {
            let vals = intArray(query.getMany.vals);

            for (let id of vals) {
                let sql = 'SELECT ' + model.primaryKey + ' ';
                
                sql += this.from(model);
                
                sql += 'WHERE ' + query.getMany.field + '=' + id;
                
                queries.push(sql);
            }
        } else if (model.getField(query.getMany.field).type == 'string') {
            //TODO
        } else {
            return Promise.reject('invalid field type for many get:' + query.getMany.field + ' - ' + model.getField(query.getMany.field).type);
        }
        
        return this.log.add('db,db:getMany', () => {
            return this.queryMulti(queries);
        });
    }

    inc(model, query, fieldsIndex=0) {
        let vals = query.primaryKey[fieldsIndex];
        
        if (!Array.isArray(vals)) {
            vals = [vals];
        }
        
        vals = intArray(vals);
        
        let updates = [];
        
        for (let field in query.getFields(fieldsIndex)) {
            updates.push(field + '=' + field + ' + ' + parseInt(query.getField(fieldIndex, field), 10));
        }
        
        let sql = 'UPDATE ' + model.getTableName() + ' SET ';
        
        sql += updates.join(',');
        
        sql += 'WHERE ' + this.primaryKey + ' IN (' + vals.join(',') + ')';
        
        return this.log.add('db,db:inc', () => {
            return this.query(sql);
        });
    }

    incMulti(model, query) {
        let promiseRun = [];
        
        for (let fieldsIndex = 0; fieldsIndex < query.getFieldsCnt(); ++fieldsIndex) {
            promiseRun.push(this.inc(model, query, fieldsIndex));
        }

        return Promise.all(promiseRun);
    }
    
    lookup(model, query) {
        this.buildLookup(model, query);
        
        let sqlSelect = 'SELECT ' + query.alias + '.' + model.primaryKey + ' '
        
        let sql = this.from(model, query.alias);
        
        if (query.join && Array.isArray(query.join) && query.join.length) {
            for (let table in query.join) {
                sql += 'INNER JOIN ' + table + ' ON (' + query.join[table] + ') ';
            }
        }
        
        if (query.leftJoin && Array.isArray(query.leftJoin) && query.leftJoin.length) {
            for (let table in query.leftJoin) {
                sql += 'LEFT JOIN ' + table + ' ON (' + query.leftTable[table] + ') ';
            }
        }
        
        sql += this.where(query.where);
        
        let sqlGroup = this.group(query.group);
        
        sql += sqlGroup;
        
        sql += this.order(query.order);

        let sqlLimit = this.limit(query);
        
        let sqlRows = sqlSelect + sql + sqlLimit;

        let sqlCnt = 'SELECT COUNT(*) AS cnt ' + sql;
        
        if (sqlGroup.length) {
            sqlCnt = 'SELECT COUNT(*) AS cnt FROM (' + sqlSelect + sql + ') AS t';
        }

        if (query.isOutputStyle('FOUND_ONLY')) {
            return this.log.add('db,db:lookup:found', () => {
                return this.query(sqlCnt, query.bind, true);
            }).then((row) => {
                let meta = {
                    pages: query.limit.limit ? Math.ceil(row.cnt/query.limit.limit) : null,
                    found: row.cnt,
                };
                    
                return Promise.reject(createResult(true, [], meta));
            });
        }
        
        return this.log.add('db,db:lookup', () => {
            return this.query(sqlRows, query.bind, model.primaryKey)
        }).then((rows) => {
            if (query.isOutputStyle('INCLUDE_FOUND')) {
                return this.log.add('db,db:lookup:found', () => {
                    return this.query(sqlCnt, query.bind, true).then((found) => [rows, found['cnt']]);
                });
            } else {
                return [rows, null];
            }
        });
    }

    buildLookup(model, query) {
        let where = [], bind = {}, input = null;

        if (input = query.raw('=')) {
            for (let field in input) {
                if (!model.getField(field)) {
                    continue;
                }

                let vals = input[field];

                if (!Array.isArray(vals)) {
                    vals = [vals];
                }

                if (model.getField(field).type == 'int') {
                    vals = intArray(vals);

                    where.push(query.alias + '.' + field + ' IN (' + vals.join(',') + ') ');
                } else {
                    vals = [...new Set(vals)];

                    let wh = [], cnt = 1;

                    for (let val of vals) {
                        wh.push(':' + field + cnt);

                        bind[field + cnt] = val;

                        ++cnt;
                    }

                    where.push(field + ' IN (' + wh.join(',') + ')');
                }
            }
        }

        if (input = query.raw('%search')) {
            for (let field in input) {
                if (!model.getField(field)) {
                    continue;
                }

                where.push(query.alias + '.' + field + ' LIKE :' + field);

                bind[field] = '%' + input[field];
            }
        }

        if (input = query.raw('search%')) {
            for (let field in input) {
                if (!model.getField(field)) {
                    continue;
                }

                where.push(query.alias + '.' + field + ' LIKE :' + field);

                bind[field] = input[field] + '%';
            }
        }

        if (input = query.raw('%search%')) {
            for (let field in input) {
                if (!model.getField(field)) {
                    continue;
                }

                where.push(query.alias + '.' + field + ' LIKE :' + field);

                bind[field] = '%' + input[field] + '%';
            }
        }

        if (input = query.raw('>')) {
            for (let field in input) {
                if (!model.getField(field)) {
                    continue;
                }

                where.push(':' + field + '_greater < ' + query.alias + '.' + field);

                bind[field + '_greater'] = parseInt(input[field], 10);
            }
        }

        if (input = query.raw('>=')) {
            for (let field in input) {
                if (!model.getField(field)) {
                    continue;
                }

                where.push(':' + field + '_greater_equal <= ' + query.alias + '.' + field);

                bind[field + '_greater_equal'] = parseInt(input[field], 10);
            }
        }

        if (input = query.raw('<')) {
            for (let field in input) {
                if (!model.getField(field)) {
                    continue;
                }

                where.push(query.alias + '.' + field + ' < :' + field + '_less');

                bind[field + '_less'] = parseInt(input[field], 10);
            }
        }

        if (input = query.raw('<=')) {
            for (let field in input) {
                if (!model.getField(field)) {
                    continue;
                }

                where.push(query.alias + '.' + field + '. <= :' + field + '_less_equal');

                bind[field + '_less_equal'] = parseInt(input[field], 10);
            }
        }

        if (input = query.raw('modulo')) {
            for (let field in input) {
                if (!model.getField(field)) {
                    continue;
                }

                where.push(query.alias + '.' + field + ' % :' + field + '_modulo_mod = :' + field + '_modulo_val');

                bind[field + '_modulo_mod'] = parseInt(input[field]['mod'], 10);

                bind[field + '_modulo_val'] = parseInt(input[field]['val'], 10);
            }
        }

        query.addWhere(where, bind);
    }

    set(model, query, fieldsIndex=0) {
        var sql = '', updates = [], bind = {};
        
        if (model.setInsert) {
            let primaryKey = query.getField(fieldsIndex, model.primaryKey);

            if (typeof primaryKey === 'undefined') {
                return Promise.reject('Missing primary key on setInsert table');
            }

            let cols = [], vals = [], custom = [];
            
            for (let field in query.getFields(fieldsIndex)) {
                cols.push(field);
                
                if (model.getField(field).type == 'int') {
                    vals.push(parseInt(query.getField(fieldsIndex, field), 10));
                    
                    if (field != model.primaryKey) {
                        if (!query.getCustom(field)) {
                            updates.push(field + '=' + parseInt(query.getField(fieldsIndex, field), 10));
                        }
                    }
                } else {
                    vals.push(':' + field);
                    
                    if (field != model.primaryKey) {
                        if (!query.getCustom(field)) {
                            updates.push(field + '=:' + field);
                        }
                    }
                    
                    bind[field] = query.getField(fieldsIndex, field).toString();
                }
            }

            for (let field of query.getCustomFields()) {
                custom.push(field + '=' + query.getCustom(field));
            }

            if (!cols.length || !vals.length || !updates.length) {
                return Promise.reject('missing fields');
            }
            
            sql = 'INSERT INTO ' + model.getTableName() + ' (' + cols.join(',') + ') VALUES (' + vals.join(',') + ') ON DUPLICATE KEY UPDATE ' + updates.join(',');

            if (custom.length) {
                if (updates.length) {
                    sql += ',';
                }

                sql += custom.join(',');
            }
        } else {
            sql = 'UPDATE ' + model.getTableName() + ' SET ';
            
            for (let field in query.getFields(fieldsIndex)) {
                if (query.getCustom(field)) {
                    continue;
                }
                
                if (model.getField(field).type == 'int') {
                    updates.push(field + '=' + parseInt(query.getField(fieldsIndex, field), 10));
                } else {
                    updates.push(field + '=:' + field);
                    
                    bind[field] = query.getField(fieldsIndex, field).toString();
                }
            }
            
            sql += updates.join(',');

            let custom = [];

            for (let field of query.getCustomFields()) {
                custom.push(field + '=' + query.getCustom(field));
            }
            
            if (custom.length) {
                if (updates.length) {
                    sql += ',';
                }
                
                sql += custom.join(',');
            } else if (!updates.length) {
                return Promise.reject('missing fields');
            }

            sql += ' ';
            
            if (model.getField(model.primaryKey).type == 'int') {
                sql += 'WHERE ' + model.primaryKey + '=' + parseInt(query.primaryKey[fieldsIndex], 10);
            } else {
                sql += 'WHERE ' + model.primaryKey + '=:' + model.primaryKey;
                
                bind[model.primaryKey] = query.primaryKey[fieldsIndex];
            }
        }
        
        return this.log.add('db,db:set', () => {
            return this.query(sql, bind);
        });
    }

    setMulti(model, query) {
        let promiseRun = [];
        
        for (let fieldsIndex = 0; fieldsIndex < query.getFieldsCnt(); ++fieldsIndex) {
            promiseRun.push(this.set(model, query, fieldsIndex));
        }

        return Promise.all(promiseRun);
    }

    remove(model, query) {
        let vals = query.primaryKey;
        
        if (!Array.isArray(vals)) {
            vals = [vals];
        }
        
        let bind = {};
        
        let sql = 'DELETE ';
        
        sql += this.from(model);
        
        if (model.getField(model.primaryKey).type == 'int') {
            vals = intArray(vals);
            
            sql += 'WHERE ' + model.primaryKey + ' IN (' + vals.join(',') + ')';
        } else {
            vals = [...new Set(vals)];
            
            let wh = [], cnt = 1;
            
            for (let key in vals) {
                wh.push(':' + model.primaryKey + cnt);
                
                bind[model.primaryKey + cnt] = vals[key];
                
                ++cnt;
            }
            
            sql += 'WHERE ' + model.primaryKey + ' IN (' + wh.join(',') + ')';
        }
        
        return this.log.add('db,db:remove', () => {
            return this.query(sql, bind);
        });
    }

    select(model, raw=''){
        if (raw) {
            return 'SELECT ' + raw + ' ';
        }
        
        return 'SELECT '
            + Object.keys(model.fields).join(',')
            + (model.timestamps && model.timestamps.created ? ',UNIX_TIMESTAMP(' + model.timestamps.created.name + ') AS ' + model.timestamps.created.name : '')
            + (model.timestamps && model.timestamps.modified ? ',UNIX_TIMESTAMP(' + model.timestamps.modified.name + ') AS ' + model.timestamps.modified.name : '')
            + ' ';
    }

    from(model, alias='') {
        return 'FROM ' + model.getTableName() + ' ' + (alias?alias + ' ':'');
    }

    where(where){
        if (!where || !Array.isArray(where) || !where.length) {
            return '';
        }
        
        return 'WHERE ' + where.join(' AND ') + ' ';
    }

    group(group){
        if (!group || !Array.isArray(group) || !group.length) {
            return '';
        }
        
        return 'GROUP BY ' + group.join(',') + ' ';
    }

    order(order){
        if (!order || !Array.isArray(order) || !order.length) {
            return '';
        }
        
        return 'ORDER BY ' + order.join(',') + ' ';
    }

    limit(query){
        if (!query.limit.page || !query.limit.limit) {
            return '';
        }
        
        let page = parseInt(query.limit.page, 10) - 1;
        
        let limit = parseInt(query.limit.limit, 10);
        
        let offset = page * limit;
        
        return 'LIMIT ' + offset + ',' + limit;
    }
    
    query(sql, bind={}, retType=null, forceEndpoint=null) {
        var queryType = sql.substring(0, 8).toUpperCase();
        
        if (queryType.indexOf('SELECT') == 0) {
            queryType = 'SELECT';
            
            if (!forceEndpoint) {
                forceEndpoint = 'read';
            }
        } else if (queryType.indexOf('UPDATE') == 0) {
            queryType = 'UPDATE';
            
            forceEndpoint = 'write';
        } else if (queryType.indexOf('INSERT') == 0) {
            queryType = 'INSERT';
            
            forceEndpoint = 'write';
        } else if (queryType.indexOf('REPLACE') == 0) {
            queryType = 'REPLACE';
            
            forceEndpoint = 'write';
        } else if (queryType.indexOf('DELETE') == 0
                   || queryType.indexOf('TRUNCATE') == 0) {
            queryType = 'DELETE';
            
            forceEndpoint = 'write';
        } else {
            queryType = null;
        }

        return this._query(sql, bind, forceEndpoint).then((rows) => {
            if (queryType == 'SELECT') {
                if (typeof(retType) === 'boolean' && retType) {
                    if (!rows.length) {
                        return {};
                    }
                    
                    return rows[0];
                }
                
                if (typeof(retType) === 'string') {
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
            
            if (queryType == 'INSERT') {
                return {
                    insertId: rows.insertId,
                };
            }
            
            if (queryType == 'DELETE') {
                return {
                    affectedRows: rows.affectedRows,
                };
            }
            
            if (queryType == 'UPDATE' || queryType == 'REPLACE') {
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
                        
            if (queryType.indexOf('SELECT') == 0) {
                queryType = 'SELECT';
                
                if (!forceEndpoint) {
                    forceEndpoint = 'read';
                }
            } else if (queryType.indexOf('UPDATE') == 0) {
                queryType = 'UPDATE';
                
                forceEndpoint = 'write';
            } else if (queryType.indexOf('INSERT') == 0) {
                queryType = 'INSERT';
                
                forceEndpoint = 'write';
            } else if (queryType.indexOf('REPLACE') == 0) {
                queryType = 'REPLACE';
                
                forceEndpoint = 'write';
            } else if (queryType.indexOf('DELETE') == 0
                       || queryType.indexOf('TRUNCATE') == 0) {
                queryType = 'DELETE';
                
                forceEndpoint = 'write';
            } else {
                queryType = null;
            }

            if (lastQueryType && queryType !== lastQueryType) {
                return Promise.reject('Every query must be of same type in queryMulti: ' + queryType + ':' + lastQueryType);
            }
            
            query = {
                sql: sql,
                type: queryType
            };
            
            queries.push(query);
            
            sqlConcat.push(sql);
            
            lastQueryType = queryType;
        }

        
        return this._query(sqlConcat.join(';'), bind, forceEndpoint).then((results) => {
            var output = [];

            if (sqlConcat.length === 1) {
                results = [ results ];
            }

            for (let index in results) {
                let rows = results[index];

                let query = queries[index];

                if (query.type == 'SELECT') {
                    output.push(rows);
                    
                    continue;
                }
                
                if (query.type == 'INSERT') {
                    output.push({
                        insertId: rows.insertId,
                    });
                    
                    continue;
                }
                
                if (query.type == 'DELETE') {
                    output.push({
                        affectedRows: rows.affectedRows,
                    });
                    
                    continue;
                }
                
                if (query.type == 'UPDATE' || query.type == 'REPLACE') {
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
                && forceEndpoint === 'read') {
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

                let timeStart = null;
                
                if (this.debug.enabled) {
                    timeStart = microtime.now();
                }

                connection.query(sql, bind, (error, results, fields) => {
                    if (this.debug.enabled) {
                        this.debug((microtime.now() - timeStart) / 1000000, sql, bind);
                    }
                    
                    connection.release();

                    if (error) {
                        return reject(error.message);
                    }

                    return resolve(results);
                });
            });
        });
    }

}

module.exports = MySql;
