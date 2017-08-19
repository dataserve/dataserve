"use strict"

const AsyncLock = require("async-lock");
const Promise = require("bluebird");
const _object = require("lodash/object");

const Query = require("./query");
const {camelize, paramFo, r} = require("./util");

const ALLOWED_COMMANDS = [
    "add",
    "get",
    "getCount",
    "getMulti",
    "inc",
    "lookup",
    "remove",
    "set",
];

class Model {

    constructor(dataserve, config, dbContainer, cacheContainer, dbTable, log){
        this.dataserve = dataserve;
        this.dbContainer = dbContainer;
        this.cacheContainer = cacheContainer;
        this.log = log;

        this.lock = new AsyncLock();

        this.dbTable = dbTable;
        this.dbName = null;
        this.tableName = null;
        this.model = null;
        this.type = null;
        this.media = null;

        this.setInsert = null;
        this.primaryKey = null;
        this.fields = {};
        this.relationships = {};
        this.fillable = [];
        this.unique = [];
        this.getMulti = [];

        this.timestamps = {
            created: {
                name: "ctime",
                type: "timestamp",
                fillable: false,
                autoSetTimestamp: true
            },
            modified: {
                name: "mtime",
                type: "timestamp",
                fillable: false,
                autoSetTimestamp: true,
                autoUpdateTimestamp: true
            },
        };

        this.parseConfig(config);
        
        if (!this.model) {
            this.model = this.tableName;
        }
    }

    parseConfig(config){
        [this.dbName, this.tableName] = this.dbTable.split(".");
        if (!this.dbName || !this.tableName) {
            throw new Error("Missing db/table names");
        }
        this.dbConfig = config.dbs[this.dbName];
        if (!this.dbConfig) {
            throw new Error("Configuration missing for db: " + this.dbName);
        }
        this.tableConfig = this.dbConfig.tables[this.tableName];
        if (!this.tableConfig) {
            throw new Error("Missing config information for table: " + this.tableName);
        }
        
        this.db = this.dbContainer.getDb(this.dbName, this.dbConfig);
        if (this.dbConfig.cache) {
            this.cache = this.cacheContainer.getCache(this.dbName, this.dbConfig);
        } else {
            this.cache = this.cacheContainer.getCache(this.dbName, this.tableConfig);
        }

        if (!this.tableConfig.fields) {
            throw new Error("Missing fields information for table: " + this.tableName);
        }
        for (let key in this.tableConfig.fields) {
            this.addField(key, this.tableConfig.fields[key]);
        }
        if (!this.primaryKey) {
            throw new Error("A primary key must be specified for table: " + this.tableName);
        }
        if (typeof this.tableConfig.setInsert !== "undefined") {
            this.setInsert = this.tableConfig.setInsert;
            if (this.setInsert && !this.fields[this.primaryKey].fillable) {
                throw new Error("Primary key must be fillable when `setInsert` is set to true");
            }
        }
        if (typeof this.tableConfig.timestamps !== "undefined") {
            if (!this.tableConfig.timestamps) {
                this.timestamps = null;
            } else {
                if (typeof this.tableConfig.timestamps.created !== "undefined") {
                    this.timestamps.created = this.tableConfig.timestamps.created;
                }
                if (typeof this.tableConfig.timestamp.modified !== "undefined") {
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

    getDbConfig() {
        return this.dbConfig;
    }

    getTableConfig() {
        return this.tableConfig;
    }

    run(command, input) {        
        if (["flushCache", "outputCache"].indexOf(command) !== -1) {
            return this[command]();
        }

        if (command === "outputDbSchema") {
            return this.getDb().outputDbSchema(this.dbName, this.dbConfig, this.dataserve);
        }

        if (command == "outputTableSchema") {
            return this.getDb().outputTableSchema(this.tableName, this.tableConfig, this.timestamps);
        }

        if (ALLOWED_COMMANDS.indexOf(command) === -1) {
            return Promise.resolve(r(false, "invalid command: " + command));
        }

        let query = null;
        if (input instanceof Query) {
            query = input;
        } else {
            try {
                query = new Query(input, command, this);
            } catch (error) {
                return Promise.resolve(r(false, error.toString()));
            }
        }

        let module = null;
        if (module = this.getTableConfig().module) {
            module = new (require("./module/" + module))(this);
        } else {
            module = new (require("./module"))(this);
        }
               
        let hooks = module.getHooks(command);

        return this[command](query, hooks);
    }
    
    getField(field) {
        if (typeof this.fields[field] === "undefined") {
            return null;
        }
        return this.fields[field];
    }
    
    addField(field, attributes){
        this.fields[field] = attributes;
        if (attributes.key) {
            switch (attributes.key) {
            case "primary":
                this.primaryKey = field;
                break;
            case "unique":
                this.addUnique(field);
                break;
            }
        }
        if (attributes.fillable) {
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
    
    addFillable(arr){
        if (!Array.isArray(arr)) {
            arr = [arr];
        }
        this.fillable = [...new Set(this.fillable.concat(arr))];
    }

    isUnique(field) {
        return this.unique.indexOf(field) !== -1;
    }
    
    addUnique(arr){
        if (!Array.isArray(arr)) {
            arr = [arr];
        }
        this.unique = [...new Set(this.unique.concat(arr))];
    }

    isGetMulti(field) {
        return this.getMulti.indexOf(field) !== -1;
    }
    
    addGetMulti(arr){
        if (!Array.isArray(arr)) {
            arr = [arr];
        }
        this.getMulti = [...new Set(this.getMulti.concat(arr))];
    }
    
    addRelationship(type, table){
        type = camelize(type);
        if (["belongsTo", "hasOne"].indexOf(type) == -1) {
            return;
        }
        if (!this.relationships[type]) {
            this.relationships[type] = {};
        }
        this.relationships[type][table] = true;
    }

    add(query, hooks){
        if (!query.hasFields()) {
            return Promise.resolve(r(false, "missing fields"));
        }
        var primaryKeyVal = null;
        return hooks.runPre(query)
            .then(() => {
                return this.log.add("db,db:add", () => {
                    return this.getDb().add(this, query);
                });
            })
            .then(primaryKeyValTmp => {
                primaryKeyVal = primaryKeyValTmp;
                if (this.cache) {
                    return this.getLock(this.primaryKey, primaryKeyVal, () => {
                        return this.cacheDeletePrimary(primaryKeyVal);
                    });
                }
            })
            .then(res => {
                if (query.isOutputStyle("RETURN_ADD")) {
                    return this.run("get", {
                        [this.primaryKey]: primaryKeyVal,
                        fillin: query.fillin,
                    });
                }
                return null;
            })
            .catch(this.catchDefault);
    }
    
    get(query, hooks){
        if (!query.hasGet()) {
            return Promise.resolve(r(false, "missing param:"+JSON.stringify(query.input)));
        }

        var cacheRows = {}, cachePromise = null;
        var getVals = query.get.vals;

        //cacheable
        if (this.cache && query.get.field == this.primaryKey) {
            cachePromise = this.cacheGetPrimary(getVals);
        } else {
            cachePromise = Promise.resolve([{}, getVals]);
        }
        return cachePromise
            .then(result => {
                [cacheRows, getVals] = result;
                if (!getVals.length) {
                    return cacheRows;
                }
                if (!Array.isArray(getVals)) {
                    getVals = [getVals];
                }
                return this.getLock(query.get.field, getVals, () => {
                    return this.getDb().get(this, query, getVals)
                        .then(rows => {
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
            })
            .then(rows => {
                Object.keys(cacheRows).forEach((key) => (cacheRows[key] === null) && delete cacheRows[key]);
                return Object.assign(cacheRows, rows);
            })
            .then(rows => {
                return this.fillin(query, rows)
            })
            .then(rows => {
                let extra = {
                    dbName: this.dbName,
                    tableName: this.tableName,
                };
                if (query.singleRowResult) {
                    for (let id in rows) {
                        return r(true, rows[id], extra);
                    }
                    return r(true, {});
                }
                if (query.isOutputStyle("BY_ID")) {
                    return r(true, rows, extra);
                }
                return r(true, _object.pick(rows, query.get.vals), extra);
            })
            .catch(this.catchDefault);
    }

    getCount(query, hooks) {
        query.setLimit(1, 1);
        query.setOutputStyle("FOUND_ONLY");
        return this.run("lookup", query)
            .then(output => {
                return output.status ? r(true, output.meta.found) : output;
            })
            .catch(this.catchDefault);
    }

    getMulti(query, hooks){
        if (!query.hasGetMulti()) {
            return Promise.resolve(r(false, "missing param"));
        }

        return this.getDb().getMulti(this, query)
            .then(result => {
                let ids = [];
                for (let rows of result) {
                    for (let a of rows) {
                        ids.push(a[this.primaryKey]);
                    }
                }
                let q = new Query({
                    id: ids,
                    fillin: query.fillin,
                    outputStyle: "BY_ID",
                }, "get", this);
                return this.get(q);
            })
            .then(res => {
                if (!res.status) {
                    return Promise.reject(res);
                }
                let output = [];
                for (let id of query.getMulti.vals) {
                    let rows = result.shift();
                    let r = [];
                    for (let row of rows) {
                        r.push(res.result[row['id']]);
                    }
                    output[id] = r;
                }
                return r(true, output);
            })
            .catch(this.catchDefault);
    }

    inc(query, hooks) {
        if (!query.primaryKey) {
            Promise.resolve(r(false, "missing primary field:"+JSON.stringify(query.input)));
        }
        if (!query.hasFields()) {
            return Promise.resolve(r(false, "missing update fields"));
        }
        return this.getLock(this.primaryKey, query.primaryKey, () => {
            return this.getDb().inc(this, query, vals)
                .then(rows => {
                    if (this.cache) {
                        return this.cacheDeletePrimary(vals);
                    }
                    return rows;
                });
        })
            .then(rows => r(true))
            .catch(this.catchDefault);
    }

    lookup(query, hooks) {
        var meta = {};
        
        return hooks.runPre(query)
            .then(() => {
                return this.getDb().lookup(this, query);
            })
            .then(args => {
                let [rows, found] = args;
                meta = {
                    pages: found !== null ? Math.ceil(found / query.limit.limit) : null,
                    found: found,
                };
                let ids = rows ? Object.keys(rows) : [];
                if (!ids.length) {
                    if (query.isOutputStyle("BY_ID")) {
                        return Promise.reject(r(true, {}));
                    }
                    return Promise.reject(r(true, []));
                }
                if (query.isOutputStyle("LOOKUP_RAW")) {
                    if (query.isOutputStyle("BY_ID")) {
                        return Promise.reject(r(true, rows));
                    }
                    return Promise.reject(r(true, Object.values(rows)));
                }
                return this.run("get", {
                    [this.primaryKey]: ids,
                    fillin: query.fillin,
                });
            })
            .then(result => {
                if (!result.status) {
                    return Promise.reject(result);
                }
                if (query.isOutputStyle("BY_ID")) {
                    return result.result;
                }
                return Object.values(result.result);
            })
            .then(result => {
                return hooks.runPost(result);
            })
            .then(result => r(true, result, meta))
            .catch(this.catchDefault);
    }

    set(query, hooks) {
        if (!query.primaryKey) {
            return Promise.resolve(r(false, "missing primary key"));
        }
        if (!query.fields) {
            return Promise.resolve(r(false, "missing update fields"));
        }

        return this.getLock(this.primaryKey, query.primaryKey, () => {
            return this.getDb().set(this, query)
                .then(rows => {
                    if (this.cache) {
                        return this.cacheDeletePrimary(query.primaryKey);
                    }
                    return rows;
                })
        })
            .then(rows => r(true))
            .catch(this.catchDefault);
    }

    remove(query, hooks){
        if (!query.primaryKey) {
            return Promise.resolve(r(false, "primary key value required"));
        }
        return this.getLock(this.primaryKey, query.primaryKey, () => {
            return this.getDb().remove(this, query)
                .then(res => {
                    if (this.cache) {
                        return this.cacheDeletePrimary(vals);
                    }
                })
        })
            .then(() => r(true))
            .catch(this.catchDefault);
    }

    catchDefault(output) {
        if (!output || typeof output.status === "undefined") {
            return r(false, output);
        }
        return output;
    }

    getTable(){
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
                    outputStyle: "BY_ID",
                };
                if (this.relationships[type][table] && typeof this.relationships[type][table] == "object") {
                    inp = Object.assign(opts, inp);
                }
                if (type == "hasMany") {
                    inp[this.model + "_id"] = ids;
                    promises.push(this.dataserve.run(this.dbName + "." + table + ":getMulti", inp));
                } else {
                    if (type == "hasOne") {
                        inp[this.model + "_id"] = ids;
                    } else if (type == "belongsTo") {
                        inp["id"] = Object.keys(rows).map(key => rows[key][table+"_id"]);
                    }
                    promises.push(this.dataserve.run(this.dbName + "." + table + ":get", inp));
                }
                promiseMap[table] = type;
            }
        }
        if (!promises.length) {
            return Promise.resolve(rows);
        }
        return Promise.all(promises)
            .then(res => {
                let fillin = {};

                for (let promiseRes of res) {
                    if (!promiseRes.status) {
                        throw new Error('Fillin call failed: ' + promiseRes.error);
                    }
                    fillin[promiseRes.tableName] = {
                        type: promiseMap[promiseRes.tableName],
                        result: promiseRes.result,
                    };
                }
                
                if (!fillin) {
                    return rows;
                }

                for (let index in rows) {
                    for (let table in fillin) {
                        if (!fillin[table].result) {
                            continue;
                        }
                        if (["hasOne", "hasMany"].indexOf(fillin[table].type) !== -1) {
                            rows[index][table] = paramFo(fillin[table].result, rows[index]["id"]);
                        } else if (fillin[table].type == "belongsTo") {
                            rows[index][table] = paramFo(fillin[table].result, rows[index][table + "_id"]);
                        }
                    }
                }
                return rows;
            });
    }

    flushCache() {
        return this.cache.delAll()
            .then(result => r(true, result));
    }

    outputCache() {
        return this.cache.getAll()
            .then(result => r(true, result));
    }

    getDb() {
        return this.db;
    }

    getCache() {
        return this.cache;
    }
    
    getLock(field, val, func) {
        if (!Array.isArray(val)) {
            val = [val];
        }
        let lockKey = [];
        for (let v of val) {
            lockKey.push(field + ":" + v);
        }
        return this.lock.acquire(lockKey, func);
    }
    
    cacheGetPrimary(keys) {
        return this.cacheGet(this.primaryKey, keys);
    }

    cacheGet(field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        return this.cache.get(this.dbTable, field, keys).then(cacheRows => {
            let ids = [];
            for (let key of keys) {
                if (typeof cacheRows[key] === "undefined") {
                    ids.push(key);
                }
            }
            return [cacheRows, ids];
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
