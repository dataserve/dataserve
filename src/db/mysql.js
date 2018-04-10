'use strict';

const Promise = require('bluebird');
const microtime = require('microtime');
const mysql = require('mysql');
const Type = require('type-of-is');
const util = require('util');

const { createResult } = require('../result');
const { intArray } = require('../util');

class MySql {
    
    constructor(dbName, config, dataserve, log){
        this.debug = require('debug')('dataserve:mysql');

        this.dbName = dbName;

        this.dataserve = dataserve;
        
        this.log = log;
        
        this.replicated = false;

        this.selectFields = this.selectFields.bind(this);

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

        Object.keys(query.getFields(fieldsIndex)).forEach((field) =>{
            cols.push(field);
            
            if (model.getField(field).type == 'int') {
                vals.push(parseInt(query.getField(fieldsIndex, field), 10));
            } else {
                vals.push(':' + field);
                
                bind[field] = query.getField(fieldsIndex, field).toString();
            }
        });
        
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
        
        for (let fieldsIndex = 0, n = query.getFieldsCnt(); fieldsIndex < n; ++fieldsIndex) {
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

            getVals.forEach((val) => {
                wh.push(':' + query.get.field + cnt);
                
                bind[query.get.field + cnt] = val;
                
                ++cnt;
            });
            
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
        var queries = [], bind = {};
        
        if (model.getField(query.getMany.field).type == 'int') {
            intArray(query.getMany.vals).forEach((id) => {
                let sql = 'SELECT ' + model.primaryKey + ' ';
                
                sql += this.from(model);
                
                sql += 'WHERE ' + query.getMany.field + '=' + id;
                
                queries.push(sql);
            });
        } else if (model.getField(query.getMany.field).type == 'string') {
            let cnt = 0;
            
            query.getMany.vals.forEach((id) => {
                let sql = 'SELECT ' + model.primaryKey + ' ';
                
                sql += this.from(model);
                
                sql += 'WHERE ' + query.getMany.field + '=:id' + cnt;
                
                queries.push(sql);

                bind['id' + cnt] = id;

                ++cnt;
            });
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

        Object.keys(query.getFields(fieldsIndex)).forEach((field) => {
            updates.push(field + '=' + field + ' + ' + parseInt(query.getField(fieldIndex, field), 10));
        });
        
        let sql = 'UPDATE ' + model.getTableName() + ' SET ';
        
        sql += updates.join(',');
        
        sql += 'WHERE ' + this.primaryKey + ' IN (' + vals.join(',') + ')';
        
        return this.log.add('db,db:inc', () => {
            return this.query(sql);
        });
    }

    incMulti(model, query) {
        let promiseRun = [];
        
        for (let fieldsIndex = 0, n = query.getFieldsCnt(); fieldsIndex < n; ++fieldsIndex) {
            promiseRun.push(this.inc(model, query, fieldsIndex));
        }

        return Promise.all(promiseRun);
    }
    
    lookup(model, query) {
        this.buildLookup(model, query);
        
        let sqlSelect = 'SELECT ' + (query.distinct ? 'DISTINCT ' : '') + query.alias + '.' + model.primaryKey + ' '
        
        let sql = this.from(model, query.alias);

        if (query.join) {
            Object.keys(query.join).forEach((table) => {
                sql += 'INNER JOIN ' + table + ' ON (' + query.join[table] + ') ';
            });
        }
        
        if (query.leftJoin) {
            Object.keys(query.leftJoin).forEach((table) => {
                sql += 'LEFT JOIN ' + table + ' ON (' + query.leftJoin[table] + ') ';
            });
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
            return this.query(sqlRows, query.bind);
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

    buildLookupOther(model, query, field) {
        let alias = query.alias;
        
        let otherTableIndex = field.indexOf('.');

        if (otherTableIndex !== -1) {
            let otherTable = field.substring(0, otherTableIndex);

            field = field.substring(otherTableIndex + 1);

            model = this.dataserve.getModel(this.dbName + '.' + otherTable);

            alias = otherTable;
        }

        return { alias, field, model };
    }
    
    buildLookup(modelOrig, query) {
        let where = [], bind = {}, input = null;

        if (input = query.raw('=')) {
            Object.keys(input).forEach((fieldOrig) => {
                let vals = input[fieldOrig];

                if (!Array.isArray(vals)) {
                    vals = [vals];
                }

                let { alias, field, model } = this.buildLookupOther(modelOrig, query, fieldOrig);
                
                if (!model.getField(field)) {
                    return;
                }

                const nullable = model.getField(field).nullable;
                
                if (model.getField(field).type == 'int') {                    
                    vals = intArray(vals, true, nullable);

                    let containsNull = false;
                    
                    if (nullable) {
                        vals = vals.filter((val) => {
                            if (val === null) {
                                containsNull = true;

                                return false;
                            }

                            return true;
                        });
                    }

                    if (containsNull && vals.length) {
                        where.push('(' + alias + '.' + field + ' IN (' + vals.join(',') + ') OR ' + alias + '.' + field + ' IS NULL)');
                    } else if (containsNull) {
                        where.push(alias + '.' + field + ' IS NULL');
                    } else {
                        where.push(alias + '.' + field + ' IN (' + vals.join(',') + ')');
                    }
                } else {
                    vals = [...new Set(vals)];

                    let wh = [], cnt = 1;

                    let containsNull = false;

                    vals.forEach((val) => {
                        if (val === null && nullable) {
                            containsNull = true;
                        } else {
                            wh.push(':' + field + cnt);

                            bind[field + cnt] = val;

                            ++cnt;
                        }
                    });

                    if (containsNull && wh.length) {
                        where.push('(' + alias + '.' + field + ' IN (' + wh.join(',') + ') OR ' + alias + '.' + field + ' IS NULL)');
                    } else if (containsNull) {
                        where.push(alias + '.' + field + ' IS NULL');
                    } else {
                        where.push(alias + '.' + field + ' IN (' + wh.join(',') + ')');
                    }
                }
            });
        }

        if (input = query.raw('!=')) {
            Object.keys(input).forEach((fieldOrig) => {
                let vals = input[fieldOrig];

                if (!Array.isArray(vals)) {
                    vals = [vals];
                }

                let { alias, field, model } = this.buildLookupOther(modelOrig, query, fieldOrig);

                if (!model.getField(field)) {
                    return;
                }

                const nullable = model.getField(field).nullable;

                if (model.getField(field).type == 'int') {
                    vals = intArray(vals, true, nullable);

                    let containsNull = false;
                    
                    if (nullable) {
                        vals = vals.filter((val) => {
                            if (val === null) {
                                containsNull = true;

                                return false;
                            }

                            return true;
                        });
                    }
                    
                    if (containsNull && vals.length) {
                        where.push('(' + alias + '.' + field + ' NOT IN (' + vals.join(',') + ') AND ' + alias + '.' + field + ' IS NOT NULL)');
                    } else if (containsNull) {
                        where.push(alias + '.' + field + ' IS NOT NULL');
                    } else {
                        where.push(alias + '.' + field + ' NOT IN (' + vals.join(',') + ')');
                    }
                } else {
                    vals = [...new Set(vals)];

                    let wh = [], cnt = 1;

                    let containsNull = false;

                    vals.forEach((val) => {
                        if (val === null && nullable) {
                            containsNull = true;
                        } else {
                            wh.push(':' + field + cnt);

                            bind[field + cnt] = val;

                            ++cnt;
                        }
                    });

                    if (containsNull && wh.length) {
                        where.push('(' + alias + '.' + field + ' NOT IN (' + wh.join(',') + ') AND ' + alias + '.' + field + ' IS NOT NULL)');
                    } else if (containsNull) {
                        where.push(alias + '.' + field + ' IS NOT NULL');
                    } else {
                        where.push(alias + '.' + field + ' NOT IN (' + wh.join(',') + ')');
                    }
                }
            });
        }

        if (input = query.raw('%search')) {
            Object.keys(input).forEach((fieldOrig) => {
                let val = input[fieldOrig];

                let { alias, field, model } = this.buildLookupOther(modelOrig, query, fieldOrig);
                
                where.push(query.alias + '.' + field + ' LIKE :' + field);

                bind[field] = '%' + val;
            });
        }

        if (input = query.raw('search%')) {
            Object.keys(input).forEach((fieldOrig) => {
                let val = input[fieldOrig];

                let { alias, field, model } = this.buildLookupOther(modelOrig, query, fieldOrig);
                
                where.push(alias + '.' + field + ' LIKE :' + field);

                bind[field] = val + '%';
            });
        }

        if (input = query.raw('%search%')) {
            Object.keys(input).forEach((fieldOrig) => {
                let val = input[fieldOrig];

                let { alias, field, model } = this.buildLookupOther(modelOrig, query, fieldOrig);
                
                where.push(alias + '.' + field + ' LIKE :' + field);

                bind[field] = '%' + val + '%';
            });
        }

        if (input = query.raw('>')) {
            Object.keys(input).forEach((fieldOrig) => {
                let val = input[fieldOrig];

                let { alias, field, model } = this.buildLookupOther(modelOrig, query, fieldOrig);
                
                where.push(':' + field + '_greater < ' + alias + '.' + field);

                bind[field + '_greater'] = val;
            });
        }

        if (input = query.raw('>=')) {
            Object.keys(input).forEach((fieldOrig) => {
                let val = input[fieldOrig];

                let { alias, field, model } = this.buildLookupOther(modelOrig, query, fieldOrig);

                where.push(':' + field + '_greater_equal <= ' + alias + '.' + field);

                bind[field + '_greater_equal'] = val;
            });
        }

        if (input = query.raw('<')) {
            Object.keys(input).forEach((fieldOrig) => {
                let val = input[fieldOrig];

                let { alias, field, model } = this.buildLookupOther(modelOrig, query, fieldOrig);
                
                where.push(alias + '.' + field + ' < :' + field + '_less');

                bind[field + '_less'] = val;
            });
        }

        if (input = query.raw('<=')) {
            Object.keys(input).forEach((fieldOrig) => {
                let val = input[fieldOrig];

                let { alias, field, model } = this.buildLookupOther(modelOrig, query, fieldOrig);
                
                where.push(alias + '.' + field + ' <= :' + field + '_less_equal');

                bind[field + '_less_equal'] = val;
            });
        }

        if (input = query.raw('modulo')) {
            Object.keys(input).forEach((fieldOrig) => {
                let mod = input[fieldOrig]['mod'];

                let val = input[fieldOrig]['val'];

                let { alias, field, model } = this.buildLookupOther(modelOrig, query, fieldOrig);
                
                where.push(alias + '.' + field + ' % :' + field + '_modulo_mod = :' + field + '_modulo_val');

                bind[field + '_modulo_mod'] = parseInt(mod, 10);

                bind[field + '_modulo_val'] = parseInt(val, 10);
            });
        }

        query.addWhere(where, bind);
    }

    raw(model, query) {
        if (!query.getRaw('sql') || typeof query.getRaw('sql') !== 'string') {
            return Promise.reject('missing sql');
        }

        const bind = (typeof query.getRaw('bind') === 'object' && query.getRaw('bind')) || {};

        const retType = query.getRaw('retType') || null;
        
        return this.log.add('db,db:raw', () => {
            return this.query(query.getRaw('sql'), bind, retType);
        });
    }

    set(model, query, fieldsIndex=0) {
        var sql = '', updates = [], bind = {};
        
        if (model.setInsert) {
            let primaryKey = query.getField(fieldsIndex, model.primaryKey);

            if (typeof primaryKey === 'undefined') {
                return Promise.reject('Missing primary key on setInsert table');
            }

            let cols = [], vals = [], custom = [];

            Object.keys(query.getFields(fieldsIndex)).forEach((field) => {
                cols.push(field);

                const val = query.getField(fieldsIndex, field);

                const isNull = val === null && model.getField(field).nullable;

                if (isNull) {
                    vals.push('NULL');
                    
                    if (!query.getCustom(field)) {
                        updates.push(field + '=NULL');
                    }
                } else if (model.getField(field).type == 'int') {
                    vals.push(parseInt(val, 10));
                    
                    if (field != model.primaryKey) {
                        if (!query.getCustom(field)) {
                            updates.push(field + '=' + parseInt(val, 10));
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
            });

            query.getCustomFields().forEach((field) => {
                custom.push(field + '=' + query.getCustom(field));
            });

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

            Object.keys(query.getFields(fieldsIndex)).forEach((field) => {
                if (query.getCustom(field)) {
                    return;
                }

                const val = query.getField(fieldsIndex, field);

                const isNull = val === null && model.getField(field).nullable;

                if (isNull) {
                    updates.push(field + '=NULL');
                } else if (model.getField(field).type == 'int') {
                    updates.push(field + '=' + parseInt(query.getField(fieldsIndex, field), 10));
                } else {
                    updates.push(field + '=:' + field);
                    
                    bind[field] = query.getField(fieldsIndex, field).toString();
                }
            });
            
            sql += updates.join(',');

            const custom = Object.keys(query.getCustomFields()).map((field) => {
                return field + '=' + query.getCustom(field);
            });
            
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
                if (Array.isArray(query.primaryKey)) {
                    sql += 'WHERE ' + model.primaryKey + '=' + parseInt(query.primaryKey[fieldsIndex], 10);
                } else {
                    sql += 'WHERE ' + model.primaryKey + '=' + parseInt(query.primaryKey, 10);
                }
            } else {
                sql += 'WHERE ' + model.primaryKey + '=:' + model.primaryKey;

                if (Array.isArray(query.primaryKey)) {
                    bind[model.primaryKey] = query.primaryKey[fieldsIndex];
                } else {
                    bind[model.primaryKey] = query.primaryKey;
                }
            }
        }
        
        return this.log.add('db,db:set', () => {
            return this.query(sql, bind);
        });
    }

    setMulti(model, query) {
        let promiseRun = [];
        
        for (let fieldsIndex = 0, n = query.getFieldsCnt(); fieldsIndex < n; ++fieldsIndex) {
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

            vals.forEach((val) => {
                wh.push(':' + model.primaryKey + cnt);
                
                bind[model.primaryKey + cnt] = val;
                
                ++cnt;
            });
            
            sql += 'WHERE ' + model.primaryKey + ' IN (' + wh.join(',') + ')';
        }
        
        return this.log.add('db,db:remove', () => {
            return this.query(sql, bind);
        });
    }

    selectFields(model) {
        return (field) => {
            let type = this.validateType(model.getField(field).type);

            if (type === 'DateTime') {
                return `UNIX_TIMESTAMP(${field}) AS ${field}`;
            }

            return field;
        };
    }
    
    select(model, raw=''){
        if (raw) {
            return 'SELECT ' + raw + ' ';
        }
        
        return 'SELECT '
            + Object.keys(model.fields).map(this.selectFields(model)).join(',')
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

                    rows.forEach((row) => {
                        res[row[retType]] = row;
                    });
                    
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

        input.forEach((sql) => {
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
        });
        
        return this._query(sqlConcat.join(';'), bind, forceEndpoint).then((results) => {
            var output = [];

            if (sqlConcat.length === 1) {
                results = [ results ];
            }

            Object.keys(results).forEach((index) => {
                let rows = results[index];

                let query = queries[index];

                if (query.type == 'SELECT') {
                    output.push(rows);
                    
                    return;
                }
                
                if (query.type == 'INSERT') {
                    output.push({
                        insertId: rows.insertId,
                    });
                    
                    return;
                }
                
                if (query.type == 'DELETE') {
                    output.push({
                        affectedRows: rows.affectedRows,
                    });
                    
                    return;
                }
                
                if (query.type == 'UPDATE' || query.type == 'REPLACE') {
                    output.push({
                        affectedRows: rows.affectedRows,
                        changedRows: rows.changedRows,
                    });
                    
                    return;
                }
                
                output.push(null);
            });
            
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
                        reject(error.message);
                        
                        return;
                    }

                    resolve(results);
                });
            });
        });
    }

}

module.exports = MySql;
