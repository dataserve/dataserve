'use strict';

const Promise = require('bluebird');
const _object = require('lodash/object');

const { Result } = require('./result');
const { camelize, paramFo } = require('./util');

const ALLOWED_COMMANDS = [
    'add',
    'get',
    'getCount',
    'getMulti',
    'inc',
    'lookup',
    'remove',
    'set',
];

class Model {

    constructor(dataserve, dbTable, tableConfig, db, cache, log, lock) {
        this.dataserve = dataserve;

        this.dbTable = dbTable;
        
        this.tableConfig = tableConfig;
        
        this.db = db;
        
        this.cache = cache;

        this.log = log;

        this.lock = lock;

        this.dbName = null;
        
        this.tableName = null;
        
        this.model = null;
        
        this.middleware = [];

        this.setInsert = null;
        
        this.primaryKey = null;
        
        this.fields = {};
        
        this.relationships = {};
        
        this.fillable = [];
        
        this.unique = [];
        
        this.getMulti = [];

        this.timestamps = {
            created: {
                name: 'ctime',
                type: 'timestamp',
                fillable: false,
                autoSetTimestamp: true
            },
            modified: {
                name: 'mtime',
                type: 'timestamp',
                fillable: false,
                autoSetTimestamp: true,
                autoUpdateTimestamp: true
            },
        };
        
        this.debug = require('debug')('dataserve:model');

        this.parseConfig();
        
        if (!this.model) {
            this.model = this.tableName;
        }
    }

    parseConfig() {
        [ this.dbName, this.tableName ] = this.dbTable.split('.');
        
        if (!this.dbName || !this.tableName) {
            throw new Error('Missing db/table names');
        }

        if (!this.tableConfig.fields) {
            throw new Error('Missing fields information for table: ' + this.tableName);
        }
        
        for (let key in this.tableConfig.fields) {
            this.addField(key, this.tableConfig.fields[key]);
        }
        
        if (!this.primaryKey) {
            throw new Error('A primary key must be specified for table: ' + this.tableName);
        }
        
        if (typeof this.tableConfig.setInsert !== 'undefined') {
            this.setInsert = this.tableConfig.setInsert;
            
            if (this.setInsert && !this.isFillable(this.primaryKey)) {
                throw new Error('Primary key must be fillable when `setInsert` is set to true');
            }
        }

        if (this.tableConfig.middleware) {
            this.addMiddleware(this.tableConfig.middleware);
        }
        
        if (typeof this.tableConfig.timestamps !== 'undefined') {
            if (!this.tableConfig.timestamps) {
                this.timestamps = null;
            } else {
                if (typeof this.tableConfig.timestamps.created !== 'undefined') {
                    this.timestamps.created = this.tableConfig.timestamps.created;
                }
                
                if (typeof this.tableConfig.timestamps.modified !== 'undefined') {
                    this.timestamps.modified = this.tableConfig.timestamps.modified;
                }
            }
        }
        
        if (this.tableConfig.relationships) {
            for (let type in this.tableConfig.relationships) {
                for (let otherTable of this.tableConfig.relationships[type]) {
                    this.addRelationship(type, otherTable);
                }
            }
        }
    }

    getTableConfig(field) {
        if (field) {
            return this.tableConfig[field];
        }
        
        return this.tableConfig;
    }
   
    getField(field) {
        if (typeof this.fields[field] === 'undefined') {
            return null;
        }
        
        return this.fields[field];
    }

    getFieldValidateType(field) {
        if (typeof this.fields[field] === 'undefined') {
            return null;
        }
        
        return this.db.validateType(this.fields[field].type);
    }
    
    addField(field, attributes) {
        this.fields[field] = attributes;
        
        if (attributes.key) {
            switch (attributes.key) {
            case 'primary':
                this.primaryKey = field;
                
                break;
            case 'unique':
                this.addUnique(field);
                
                break;
            }
        }
        
        if (typeof attributes.fillable === 'undefined' || attributes.fillable) {
            this.addFillable(field);
        }
        
        if (attributes.multi) {
            this.addMulti(field);
        }
    }

    getPrimaryKey() {
        return this.primaryKey;
    }
    
    isPrimaryKey(field) {
        return this.primaryKey === field;
    }
    
    isFillable(field) {
        return this.fillable.indexOf(field) !== -1;
    }
    
    addFillable(arr) {
        if (!Array.isArray(arr)) {
            arr = [ arr ];
        }
        
        this.fillable = [ ...new Set(this.fillable.concat(arr)) ];
    }

    isUnique(field) {
        return this.unique.indexOf(field) !== -1;
    }
    
    addUnique(arr) {
        if (!Array.isArray(arr)) {
            arr = [ arr ];
        }
        
        this.unique = [ ...new Set(this.unique.concat(arr)) ];
    }

    isGetMulti(field) {
        return this.getMulti.indexOf(field) !== -1;
    }
    
    addGetMulti(arr) {
        if (!Array.isArray(arr)) {
            arr = [ arr ];
        }
        
        this.getMulti = [ ...new Set(this.getMulti.concat(arr)) ];
    }
    
    addRelationship(type, table) {
        type = camelize(type);
        
        if ([ 'belongsTo', 'hasOne' ].indexOf(type) == -1) {
            return;
        }
        
        if (!this.relationships[type]) {
            this.relationships[type] = {};
        }
        
        this.relationships[type][table] = true;
    }

    addMiddleware(arr) {
        if (!Array.isArray(arr)) {
            arr = [ arr ];
        }
        
        this.middleware = [ ...new Set(this.middleware.concat(arr)) ];
    }

    getMiddleware() {
        return this.middleware;
    }

    run({ command, query }) {
        if (ALLOWED_COMMANDS.indexOf(command) === -1) {
            return Promise.reject('invalid command: ' + command);
        }

        return this[command](query);
    }

    add(query) {
        if (!query.getFieldsCnt()) {
            return Promise.reject('missing fields');
        }
        
        var primaryKeyVal = null;

        let addFunc = 'add' + (1 < query.getFieldsCnt() ? 'Multi' : '');

        return this.log.add(`model,model:${addFunc}`, () => {
            return this.getDb()[addFunc](this, query);
        }).then(primaryKeyValTmp => {
            primaryKeyVal = primaryKeyValTmp;
            
            if (this.cache) {
                return this.getWriteLock(this.primaryKey, primaryKeyVal, () => {
                    return this.cacheDeletePrimary(primaryKeyVal);
                });
            }
        }).then(() => {
            if (query.isOutputStyle('RETURN_CHANGES')) {
                return this.run({
                    command: 'get',
                    input: {
                        [this.primaryKey]: primaryKeyVal,
                        fillin: query.fillin,
                        outputStyle: query.isOutputStyle('BY_ID') ? 'BY_ID' : null,
                    },
                });
            }
            
            return null;
        });
    }
    
    get(query) {
        if (!query.hasGet()) {
            return Promise.reject('missing param:'+JSON.stringify(query.input));
        }

        var cacheRows = {}, cachePromise = null;
        
        var getVals = query.get.vals;

        //cacheable
        if (this.cache && query.get.field == this.primaryKey) {
            cachePromise = this.cacheGetPrimary(getVals);
        } else {
            cachePromise = Promise.resolve([ {}, getVals ]);
        }
        
        return cachePromise.then(result => {
            [ cacheRows, getVals ] = result;
            
            if (!getVals.length) {
                return cacheRows;
            }
            
            if (!Array.isArray(getVals)) {
                getVals = [ getVals ];
            }

            return this.getReadLock(query.get.field, getVals, () => {
                return this.log.add('model,model:get', () => {
                    return this.getDb().get(this, query, getVals);
                }).then(rows => {
                    if (this.cache) {
                        //set cache to null for vals that didn't exist in DB
                        let cache = Object.assign(getVals.reduce((obj, val) => {
                            obj[val] = null;
                            
                            return obj;
                        }, {}), rows);
                        
                        return this.cacheSetPrimary(cache)
                            .then(() => rows);
                    }
                    
                    return rows;
                });
            });
        }).then(rows => {
            Object.keys(cacheRows).forEach(key => (cacheRows[key] === null) && delete cacheRows[key]);
            
            return Object.assign(cacheRows, rows);
        }).then(rows => {
            return this.fillin(query, rows)
        }).then(rows => {
            let extra = {
                dbName: this.dbName,
                tableName: this.tableName,
            };
            
            if (query.singleRowResult) {
                for (let id in rows) {
                    return [ rows[id], extra ];
                }
                
                return [ {}, extra ];
            }
            
            if (query.isOutputStyle('BY_ID')) {
                return [ rows, extra ];
            }

            
            return [ query.get.vals.map(key => rows[key]), extra];
        });
    }

    getCount(query) {
        query.setLimit(1, 1);
        
        query.setOutputStyle('FOUND_ONLY');
        
        return this.run({
            command: 'lookup',
            query: query,
        }).then(result => {
            return result.meta.found;
        });
    }

    getMulti(query) {
        if (!query.hasGetMulti()) {
            return Promise.reject('missing param');
        }

        return this.log.add('model,model:getMulti', () => {
            return this.getDb().getMulti(this, query);
        }).then(result => {
            let ids = [];
            
            for (let rows of result) {
                for (let a of rows) {
                    ids.push(a[this.primaryKey]);
                }
            }
            
            return this.run({
                command: 'get',
                input: {
                    id: ids,
                    fillin: query.fillin,
                    outputStyle: 'BY_ID',
                },
            });
        }).then(result => {
            let data = [];
            
            for (let id of query.getMulti.vals) {
                let rows = result.data.shift();
                
                let r = [];
                
                for (let row of rows) {
                    r.push(res.result[row['id']]);
                }
                
                data[id] = r;
            }
            
            return data;
        });
    }

    inc(query) {
        if (!query.primaryKey) {
            Promise.reject('missing primary field:'+JSON.stringify(query.input));
        }

        if (!query.getFieldsCnt()) {
            return Promise.reject('missing update fields');
        }
        
        return this.getWriteLock(this.primaryKey, query.primaryKey, () => {
            let incFunc = 'inc' + (1 < query.getFieldsCnt() ? 'Multi' : '');
            
            return this.log.add(`model,model:${incFunc}`, () => {
                return this.getDb()[incFunc](this, query, vals);
            }).then(() => {
                if (this.cache) {
                    return this.cacheDeletePrimary(vals);
                }
            });
        }).then(() => {
            if (query.isOutputStyle('RETURN_CHANGES')) {
                return this.run({
                    command: 'get',
                    input: {
                        [this.primaryKey]: query.primaryKey,
                        fillin: query.fillin,
                        outputStyle: query.isOutputStyle('BY_ID') ? 'BY_ID' : null,
                    },
                });
            }
            
            return null;
        });
    }

    lookup(query) {
        var meta = {};
        
        return this.log.add('model,model:lookup', () => {
            return this.getDb().lookup(this, query);
        }).then(args => {
            let [ rows, found ] = args;
            
            meta = {
                pages: found !== null ? Math.ceil(found / query.limit.limit) : null,
                found: found,
            };
            
            let ids = rows ? Object.keys(rows) : [];
                
            if (!ids.length) {
                if (query.isOutputStyle('BY_ID')) {
                    return Promise.reject(new Result(true, {}));
                }
                
                return Promise.reject(new Result(true, []));
            }
                
            if (query.isOutputStyle('LOOKUP_RAW')) {
                if (query.isOutputStyle('BY_ID')) {
                    return Promise.reject(new Result(true, rows));
                }
                
                return Promise.reject(new Result(true, Object.values(rows)));
            }
                
            return this.run({
                command: 'get',
                input: {
                    [this.primaryKey]: ids,
                    fillin: query.fillin,
                    outputStyle: query.isOutputStyle('BY_ID') ? 'BY_ID' : null,
                },
            });
        });
    }

    set(query) {
        if (!query.primaryKey) {
            return Promise.reject('missing primary key');
        }
        
        if (!query.getFieldsCnt()) {
            return Promise.reject('missing update fields');
        }

        return this.getWriteLock(this.primaryKey, query.primaryKey, () => {
            let setFunc = 'set' + (1 < query.getFieldsCnt() ? 'Multi' : '');

            return this.log.add(`model,model:${setFunc}`, () => {
                return this.getDb()[setFunc](this, query);
            }).then(() => {
                if (this.cache) {
                    return this.cacheDeletePrimary(query.primaryKey);
                }
            });
        }).then(() => {
            if (query.isOutputStyle('RETURN_CHANGES')) {
                return this.run({
                    command: 'get',
                    input: {
                        [this.primaryKey]: query.primaryKey,
                        fillin: query.fillin,
                        outputStyle: query.isOutputStyle('BY_ID') ? 'BY_ID' : null,
                    },
                });
            }
            
            return null;
        });
    }

    remove(query) {
        if (!query.primaryKey) {
            return Promise.reject('primary key value required');
        }
        
        return this.getWriteLock(this.primaryKey, query.primaryKey, () => {
            return this.log.add('model,model:remove', () => {
                return this.getDb().remove(this, query);
            }).then(() => {
                if (this.cache) {
                    return this.cacheDeletePrimary(query.primaryKey);
                }
            })
        }).then(() => null);
    }

    getTableName() {
        return this.tableName;
    }

    fillin(query, rows) {
        if (!query.hasFillin()) {
            return Promise.resolve(rows);
        }
        
        if (!this.relationships) {
            return Promise.resolve(rows);
        }

        let ids = rows ? Object.keys(rows) : [];

        let promises = [];
        
        let promiseMap = {};
        
        for (let type in this.relationships) {
            for (let table in this.relationships[type]) {
                if (!query.fillin[table]) {
                    continue;
                }
                
                let inp = {
                    fillin: query.fillin,
                    outputStyle: 'BY_ID',
                };
                
                if (this.relationships[type][table] && typeof this.relationships[type][table] == 'object') {
                    inp = Object.assign(opts, inp);
                }
                
                if (type == 'hasMany') {
                    inp[this.model + '_id'] = ids;
                    
                    promises.push(this.dataserve.run(
                        `${this.dbName}.${table}:getMulti`,
                        inp
                    ));
                } else {
                    if (type == 'hasOne') {
                        inp[this.model + '_id'] = ids;
                    } else if (type == 'belongsTo') {
                        inp['id'] = Object.keys(rows).map(key => rows[key][table+'_id']);
                    }
                    
                    promises.push(this.dataserve.run(
                        `${this.dbName}.${table}:get`,
                        inp
                    ));
                }
                
                promiseMap[table] = type;
            }
        }
        
        if (!promises.length) {
            return Promise.resolve(rows);
        }
        
        return Promise.all(promises).then(res => {
            let fillin = {};

            for (let promiseRes of res) {
                fillin[promiseRes.meta.tableName] = {
                    type: promiseMap[promiseRes.meta.tableName],
                    data: promiseRes.data,
                };
            }

            if (!fillin) {
                return rows;
            }

            for (let index in rows) {
                for (let table in fillin) {
                    if (!fillin[table].data) {
                        continue;
                    }
                    
                    if (['hasOne', 'hasMany'].indexOf(fillin[table].type) !== -1) {
                        rows[index][table] = paramFo(fillin[table].data, rows[index]['id']);
                    } else if (fillin[table].type == 'belongsTo') {
                        rows[index][table] = paramFo(fillin[table].data, rows[index][table + '_id']);
                    }
                }
            }
            
            return rows;
        });
    }

    flushCache() {
        return this.cache.delAll();
    }

    outputCache() {
        return this.cache.getAll();
    }

    getDb() {
        return this.db;
    }

    getCache() {
        return this.cache;
    }

    getLock(isWrite, field, val, func) {
        if (!Array.isArray(val)) {
            val = [ val ];
        }
        
        let lockKey = [];
        
        for (let v of val) {
            lockKey.push(field + ':' + v);
        }

        let fn = isWrite ? 'acquireWrite' : 'acquireRead';
        
        return this.lock[fn](lockKey, func);
    }
    
    getReadLock(field, val, func) {
        return this.getLock(false, field, val, func);
    }

    getWriteLock(field, val, func) {
        return this.getLock(true, field, val, func);
    }
    
    cacheGetPrimary(keys) {
        return this.cacheGet(this.primaryKey, keys);
    }

    cacheGet(field, keys) {
        if (!Array.isArray(keys)) {
            keys = [ keys ];
        }
        
        return this.cache.get(this.dbTable, field, keys).then(cacheRows => {
            let ids = [];
            
            for (let key of keys) {
                if (typeof cacheRows[key] === 'undefined') {
                    ids.push(key);
                }
            }
            
            return [ cacheRows, ids ];
        });
    }

    cacheSetPrimary(rows) {
        return this.cacheSet(this.primaryKey, rows);
    }

    cacheSet(field, rows) {
        return this.cache.set(this.dbTable, field, rows);
    }

    cacheDeletePrimary(keys) {
        return this.cacheDelete(this.primaryKey, keys);
    }

    cacheDelete(field, keys) {
        return this.cache.del(this.dbTable, field, keys);
    }

}

module.exports = Model;
