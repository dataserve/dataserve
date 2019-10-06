'use strict';

const Promise = require('bluebird');

const { createResult } = require('./result');
const { camelize, paramFn } = require('./util');

const ALLOWED_COMMANDS = [
    'add',
    'get',
    'getCount',
    'getMany',
    'inc',
    'lookup',
    'raw',
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

        Object.keys(this.tableConfig.fields).forEach((key) => {
            this.addField(key, this.tableConfig.fields[key]);
        });
        
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
            Object.keys(this.tableConfig.relationships).forEach((type) => {
                this.tableConfig.relationships[type].forEach((relatedTableConfig) => {
                    this.addRelationship(type, relatedTableConfig);
                });
            });
        }
    }

    getTableConfig(field) {
        if (field) {
            return this.tableConfig[field];
        }
        
        return this.tableConfig;
    }

    getFields() {
        return this.fields;
    }
    
    getField(field) {
        if (typeof this.fields[field] === 'undefined') {
            if (this.timestamps.created
                && this.timestamps.created.name === field) {
                return this.timestamps.created;
            } else if (this.timestamps.modified
                       && this.timestamps.modified.name === field) {
                return this.timestamps.modified;
            }
            
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
        
        if (attributes.many) {
            this.addMany(field);
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

    isGetMany(field) {
        if (!this.relationships || !this.relationships['belongsTo']) {
            return false;
        }
        
        return Object.keys(this.relationships['belongsTo']).some(tableName => {
            if (this.relationships['belongsTo'][tableName].localColumnName === field) {
                return true;
            }
            
            return false;
        });
    }
    
    addRelationship(type, relatedTableConfig) {
        type = camelize(type);
        
        if ([
            'belongsTo',
            'belongsToPolymorphic',
            'belongsToMany',
            'hasOne',
            'hasMany',
        ].indexOf(type) === -1) {
            return;
        }

        if (!this.relationships[type]) {
            this.relationships[type] = {};
        }

        let [ tableName, relatedConfig ] = relatedTableConfig.split(':');

        relatedConfig = relatedConfig || '';

        //byproduct of disabling foreign keys in sql-schema-modulizer
        if (relatedConfig === 'null') {
            relatedConfig = '';
        }
        
        let [ foreignColumnName, localColumnName, extra ] = relatedConfig.split(',');

        let poly = {};
        
        if (!foreignColumnName) {
            if ([ 'belongsTo', 'belongsToPolymorphic', 'belongsToMany' ].indexOf(type) !== -1) {
                foreignColumnName = 'id';
            } else {
                foreignColumnName = this.tableName + '_id';
            }
        }

        if (!localColumnName) {
            if ([ 'belongsTo', 'belongsToMany' ].indexOf(type) !== -1) {
                localColumnName = tableName + '_id';
            } else {
                localColumnName = 'id';
            }
        }

        let polymorphic = undefined, localColumnValName = undefined;
        
        if ([ 'belongsToPolymorphic' ].indexOf(type) !== -1 && extra) {
            localColumnValName = localColumnName;
            
            localColumnName = localColumnName + '_id';
            
            let newTableName = localColumnValName;
            
            if (this.relationships[type][newTableName]
                && this.relationships[type][newTableName].polymorphic) {
                polymorphic = this.relationships[type][newTableName].polymorphic;
            } else {
                polymorphic = {};
            }

            extra.split('-').forEach((val) => {
                polymorphic[val] = tableName;
            });

            tableName = newTableName;
        }
        
        this.relationships[type][tableName] = {
            foreignColumnName,
            localColumnName,
            localColumnValName,
            polymorphic,
        };
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
        }).then((primaryKeyValTmp) => {
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
                        fill: query.fill,
                        outputStyle: query.isOutputStyle('BY_ID') ? 'BY_ID' : null,
                    },
                });
            }
            
            return null;
        });
    }
    
    get(query) {
        if (!query.hasGet()) {
            return Promise.reject('missing `primaryKey` / `uniqueKey`:' + JSON.stringify(query.input));
        }

        var cacheRows = {}, cachePromise = null;
        
        var getVals = query.get.vals;

        //cacheable
        if (this.cache && query.get.field == this.primaryKey) {
            cachePromise = this.cacheGetPrimary(getVals);
        } else {
            cachePromise = Promise.resolve([ {}, getVals ]);
        }
        
        return cachePromise.then((result) => {
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
                }).then((rows) => {
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
        }).then((rows) => {
            Object.keys(cacheRows).forEach(key => (cacheRows[key] === null) && delete cacheRows[key]);
            
            return Object.assign(cacheRows, rows);
        }).then((rows) => {
            return this.fill(query, rows);
        }).then((rows) => {
            let meta = {
                dbName: this.dbName,
                tableName: this.tableName,
            };
            
            if (query.singleRowResult) {
                for (let id in rows) {
                    return [ rows[id], meta ];
                }
                
                return [ null, meta ];
            }
            
            if (query.isOutputStyle('BY_ID')) {
                return [ rows, meta ];
            }

            return [ query.get.vals.map(key => rows[key]), meta ];
        });
    }

    getCount(query) {
        query.setLimit(1, 1);
        
        query.setOutputStyle('FOUND_ONLY');
        
        return this.run({
            command: 'lookup',
            query: query,
        }).then((result) => {
            return result.meta.found;
        });
    }

    getMany(query) {
        if (!query.hasGetMany()) {
            return Promise.reject('missing `belongsTo` val');
        }

        return this.log.add('model,model:getMany', () => {
            return this.getDb().getMany(this, query);
        }).then((manyResult) => {
            let ids = [];

            manyResult.forEach((rows) => {
                rows.forEach((a) => {
                    ids.push(a[this.primaryKey]);
                });
            });
            
            return this.run({
                command: 'get',
                input: {
                    id: ids,
                    fill: query.fill,
                    outputStyle: 'BY_ID',
                },
            }).then((result) => {
                let data = {};

                query.getMany.vals.forEach((id) => {
                    let rows = manyResult.shift();
                    
                    let r = [];

                    rows.forEach((row) => {
                        r.push(result.data[row[this.primaryKey]]);
                    });
                    
                    data[id] = r;
                });

                let meta = {
                    dbName: this.dbName,
                    tableName: this.tableName,
                };

                return [ data, meta ];
            });
        });
    }

    inc(query) {
        if (!query.primaryKey) {
            return Promise.reject('missing `primaryKey` val:'+JSON.stringify(query.input));
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
                        fill: query.fill,
                        outputStyle: query.isOutputStyle('BY_ID') ? 'BY_ID' : null,
                    },
                });
            }
            
            return null;
        });
    }

    lookup(query) {
        let meta = {};
        
        return this.log.add('model,model:lookup', () => {
            return this.getDb().lookup(this, query);
        }).then((args) => {
            let [ rows, found ] = args;
            
            meta.pages = found !== null ? Math.ceil(found / query.limit.limit) : null;
            
            meta.found = found;

            let ids = rows.map((row) => row[this.primaryKey]);

            if (!ids.length) {
                return Promise.reject(createResult(true, [], meta));
            }
                
            if (query.isOutputStyle('LOOKUP_RAW')) {
                return Promise.reject(createResult(true, rows, meta));
            }

            return this.run({
                command: 'get',
                input: {
                    [this.primaryKey]: ids,
                    fill: query.fill,
                },
            }).then(res => {
                res.meta = Object.assign({}, res.meta, meta);

                return res;
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
                        fill: query.fill,
                        outputStyle: query.isOutputStyle('BY_ID') ? 'BY_ID' : null,
                    },
                });
            }
            
            return null;
        });
    }

    raw(query) {
        return this.getDb().raw(this, query).then((result) => {
            return [ result ];
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

    fill(query, rows) {
        if (!Object.keys(rows).length) {
            return rows;
        }
        
        if (!this.relationships) {
            return rows;
        }

        if (!query.hasFill()) {
            return rows;
        }
        
        let ids = Object.keys(rows);

        let promises = [];
        
        let promiseMap = {};

        Object.keys(this.relationships).forEach((type) => {
            Object.keys(this.relationships[type]).forEach((tableName) => {
                let foundFill = query.findFill(tableName);
                
                if (!foundFill) {
                    return;
                }

                let config = this.relationships[type][tableName];

                if (config.polymorphic) {
                    let polymorphicVals = Object.values(rows).reduce((acc, row) => {
                        let polymorphicVal = row[config.localColumnValName];

                        let polymorphicId = row[config.localColumnName];

                        if (!acc[polymorphicVal]) {
                            acc[polymorphicVal] = [];
                        }

                        acc[polymorphicVal].push(polymorphicId);

                        return acc;
                    }, {});

                    Object.keys(polymorphicVals).forEach((polymorphicVal) => {
                        let idsTmp = polymorphicVals[polymorphicVal];

                        if (!idsTmp.length) {
                            return;
                        }

                        let tblName = config.polymorphic[polymorphicVal];

                        let input = {
                            [config.foreignColumnName]: idsTmp,
                            fill: query.fill[foundFill.fill],
                            outputStyle: 'BY_ID',
                        };

                        if ([ 'hasManyPolymorphic', 'belongsToManyPolymorphic' ].indexOf(type) !== -1) {
                            promises.push(this.dataserve.run(
                                `${this.dbName}.${tblName}:getMany`,
                                input
                            ));
                        } else {
                            promises.push(this.dataserve.run(
                                `${this.dbName}.${tblName}:get`,
                                input
                            ));
                        }
                        
                        promiseMap[tblName] = {
                            type,
                            aliasNameArr: foundFill.aliasNameArr,
                            configTableName: tableName,
                            polymorphicVal,
                        };
                    });
                } else {
                    let idsTmp = ids;

                    if (config.localColumnName !== 'id') {
                        idsTmp = Object.values(rows).reduce((acc, row) => {
                            if (typeof row[config.localColumnName] !== 'undefined' && row[config.localColumnName] !== null) {
                                acc.push(row[config.localColumnName]);
                            }

                            return acc;
                        }, []);
                    }

                    if (!idsTmp.length) {
                        return;
                    }

                    let input = {
                        [config.foreignColumnName]: idsTmp,
                        fill: query.fill[foundFill.fill],
                        outputStyle: 'BY_ID',
                    };
                    
                    if ([ 'hasMany', 'belongsToMany' ].indexOf(type) !== -1) {
                        promises.push(this.dataserve.run(
                            `${this.dbName}.${tableName}:getMany`,
                            input
                        ));
                    } else {
                        promises.push(this.dataserve.run(
                            `${this.dbName}.${tableName}:get`,
                            input
                        ));
                    }
                
                    promiseMap[tableName] = {
                        type,
                        aliasNameArr: foundFill.aliasNameArr,
                    };
                }
            });
        });

        if (!promises.length) {
            return rows;
        }
        
        return Promise.all(promises).then((res) => {
            let fill = {}, found = false;

            let errored = res.find((promiseRes) => {
                return promiseRes.isError();
            });

            if (errored) {
                return Promise.reject(errored);
            }
            
            res.forEach((promiseRes) => {
                fill[promiseRes.meta.tableName] = {
                    type: promiseMap[promiseRes.meta.tableName].type,
                    aliasNameArr: promiseMap[promiseRes.meta.tableName].aliasNameArr,
                    data: promiseRes.data,
                    polymorphicVal: promiseMap[promiseRes.meta.tableName].polymorphicVal || undefined,
                    configTableName: promiseMap[promiseRes.meta.tableName].configTableName || undefined,
                };
            });

            Object.keys(fill).forEach((tableName) => {
                let configTableName = fill[tableName].configTableName || tableName;
                
                let config = this.relationships[fill[tableName].type][configTableName];

                if (fill[tableName].polymorphicVal) {
                    Object.keys(rows).forEach((rowIndex) => {
                        if (rows[rowIndex][config.localColumnValName] === fill[tableName].polymorphicVal) {
                            fill[tableName].aliasNameArr.forEach((aliasName) => {
                                rows[rowIndex][aliasName] = paramFn(fill[tableName].data, rows[rowIndex][config.localColumnName]);
                            });
                        }
                    });
                } else {
                    Object.keys(rows).forEach((rowIndex) => {
                        fill[tableName].aliasNameArr.forEach((aliasName) => {
                            rows[rowIndex][aliasName] = paramFn(fill[tableName].data, rows[rowIndex][config.localColumnName]);
                        });
                    });
                }
            });

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

        val.forEach((v) => {
            lockKey.push(field + ':' + v);
        });

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
        
        return this.cache.get(this.dbTable, field, keys).then((cacheRows) => {
            let ids = [];

            keys.forEach((key) => {
                if (typeof cacheRows[key] === 'undefined') {
                    ids.push(key);
                }
            });
            
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
