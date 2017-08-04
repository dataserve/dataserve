"use strict"

const _object = require("lodash/object");
const AsyncLock = require('async-lock');
const Query = require("./query");
const {camelize, intArray, paramFo, r} = require("./util");

const ALLOWED_COMMANDS = [
    "add",
    "get",
    "getCount",
    "getMulti",
    "lookup",
    "remove",
    "set",
];

class Model {

    constructor(dataserve, config, dbContainer, cacheContainer, dbTable){
        this.dataserve = dataserve;
        this.dbContainer = dbContainer;
        this.cacheContainer = cacheContainer;

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
            },
            modified: {
                name: "mtime",
                type: "timestamp",
                fillable: false,
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
        this.dbConfig = config.db[this.dbName];
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
                this.timestamp = null;
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
        command = camelize(command);
        
        if (command == "outputCache") {
            return this[command]();
        }

        if (ALLOWED_COMMANDS.indexOf(command) === -1) {
            return Promise.resolve(r(false, "invalid command: " + command));
        }
        
        let query = new Query(input, command, this), module = null;
        
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
                let cols = [], vals = [], bind = [];
                for (let field in query.fields) {
                    cols.push(field);
                    if (this.getField(field).type == "int") {
                        vals.push(parseInt(query.fields[field], 10));
                    } else {
                        vals.push(":" + field);
                        bind[field] = query.fields[field];
                    }
                }
                if (!this.getField(this.primaryKey).autoinc) {
                    if (typeof query.fields[this.primaryKey] === "undefined") {
                        return Promise.reject(r(false, "primary key required"));
                    }
                    primaryKeyVal = query.fields[this.primaryKey];
                }
                let sql = "INSERT INTO " + this.getTable() + " (" + cols.join(",") + ") VALUES (" + vals.join(",") + ")";
                return this.query(sql, bind);
            })
            .then(res => {
                if (!primaryKeyVal) {
                    primaryKeyVal = res.insertId;
                }
                if (this.cache) {
                    return this.getLock(this.primaryKey, primaryKeyVal, () => {
                        return this.cacheDeletePrimary(primaryKeyVal)
                            .then (() => {
                                return res;
                            });
                    });
                }
                return res;
            })
            .then(res => {
                return this.run("get", {
                    [this.primaryKey]: primaryKeyVal,
                    fillin: query.fillin,
                });
            })
            .catch(output => {
                if (!output || typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }
    
    get(query){
        if (!query.hasGet()) {
            return Promise.resolve(r(false, "missing param:"+JSON.stringify(query.input)));
        }

        var cacheRows = {}, where = [], bind = {}, cachePromise = null;
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
                if (this.getField(query.get.field).type == "int") {
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
                let sql = this.select();
                sql += this.from();
                sql += this.where(where);

                return this.getLock(query.get.field, getVals, () => {
                    return this.query(sql, bind, this.primaryKey)
                        .then(rows => {
                            if (this.cache) {
                                //set cache to null for vals that didn't exist in DB
                                let cache = Object.assign(getVals.reduce((obj, val) => {
                                    obj[val] = null;
                                    return obj;
                                }, {}), rows);
                                return this.cacheSetPrimary(cache);
                            }
                            return rows;
                        });
                });
            })
            .then(rows => {
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
            .catch(output => {
                if (!output || typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }

    getCount(query) {
        query.setLimit(1, 1);
        query.setOutputStyle("FOUND_ONLY");
        return this.lookup(query)
            .then(output => output.status ? r(true, output.found) : output)
            .catch(output => {
                if (!output || typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }

    getMulti(query){
        if (!query.hasGetMulti()) {
            return Promise.resolve(r(false, "missing param"));
        }

        var queries = [];
        if (this.getField(query.getMulti.field) == 'int') {
            query[query.getMulti.field] = intArray(query.getMulti.vals);
            for (let id of query.getMulti.vals) {
                let sql = 'SELECT ' + this.primaryKey.name + ' ';
                sql += this.from();
                sql += 'WHERE ' + field + '=' + id;
                queries.push(sql);
            }
        } else if (this.getField(query.getMulti.field) == 'string') {
            //TODO
        } else {
            return Promise.resolve(r(false, "invalid field type for multi get:" + this.getField(query.getMulti.field)));
        }
        return this.queryMulti(queries)
            .then(result => {
                let ids = [];
                for (let rows of result) {
                    for (let a of rows) {
                        ids.push(a[this.primaryKey.name]);
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
            .catch(output => {
                if (!output || typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }

    inc(query) {
        if (!query.primaryKey) {
            Promise.resolve(r(false, "missing primary field:"+JSON.stringify(query.input)));
        }
        let vals = query.primaryKey;
        if (!Array.isArray(vals)) {
            vals = [vals];
        }
        vals = intArray(vals);
        if (!query.hasFields()) {
            return Promise.resolve(r(false, "missing update fields"));
        }

        sql = "UPDATE " + this.getTable() + " SET ";
        for (let key in query.fields) {
            updates.push(key + "=" + key + " + " + parseInt(query.fields[key], 10));
        }
        sql += "WHERE " + this.primaryKey + " IN (" + vals.join(",") + ")";
        
        return this.getLock(this.primaryKey, query.primaryKey, () => {
            return this.query(sql)
                .then(rows => {
                    if (this.cache) {
                        return this.cacheDeletePrimary(vals);
                    }
                    return rows;
                });
        })
            .then(rows => r(true))
            .catch(output => {
                if (!output || typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }

    lookup(query, hooks) {
        var meta = {};
        
        return hooks.runPre(query)
            .then(() => {
                let sqlSelect = "SELECT " + query.alias + "." + this.primaryKey + " "
                let sql = this.from(query.alias);
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
                    return this.query(sqlCnt, query.bind, true).then(found => {
                        let meta = {
                            pages: query.limit.limit ? Math.ceil(found/query.limit.limit) : null,
                            found: found,
                        };
                        return Promise.reject(r(true, [], meta));
                    });
                }
                
                return this.query(sqlRows, query.bind, this.primaryKey)
            })
            .then(rows => {
                if (query.isOutputStyle("INCLUDE_FOUND")) {
                    return this.query(sqlCnt, query.bind, true).then(found => [rows, found["cnt"]]);
                } else {
                    return [rows, null];
                }
            })
            .then(args => {
                let [rows, found] = args;
                meta = {
                    pages: query.limit.limit ? Math.ceil(found / query.limit.limit) : null,
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
            .catch(output => {
                if (!output || typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }

    set(query) {
        if (!query.primaryKey) {
            return Promise.resolve(r(false, "missing primary key"));
        }
        if (!query.fields) {
            return Promise.resolve(r(false, "missing update fields"));
        }

        var sql = "", updates = [], bind = {};
        if (this.primaryKey.setInsert) {
            query.fields[this.primaryKey] = query.primaryKey;
            let cols = [], vals = [];
            for (let field in query.fields) {
                cols.push(field);
                if (this.getField(field).type == "int") {
                    vals.push(parseInt(query.fields[field], 10));
                    if (field != this.primaryKey) {
                        updates.push(field + "=" + parseInt(query.fields[field], 10) + " ");
                    }
                } else {
                    vals.push(":" + field);
                    if (field != this.primaryKey) {
                        updates.push(field + "=:" + field + " ");
                    }
                    bind[field] = query.fields[field];
                }
            }
            sql = "INSERT INTO " + this.getTable() + " (" + cols.join(",") + ") VALUES (" + vals.join(",") + ") ON DUPLICATE KEY UPDATE " + updates.join(",") + " ";
        } else {
            sql = "UPDATE " + this.getTable() + " SET ";
            for (let field in query.fields) {
                if (this.getField(field).type == "int") {
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
            if (this.getField(this.primaryKey).type == "int") {
                sql += "WHERE " + this.primaryKey + "=" + parseInt(query.primaryKey, 10);
            } else {
                sql += "WHERE " + this.primaryKey + "=:" + this.primaryKey;
                bind[this.primaryKey] = query.primaryKey;
            }
        }
        return this.getLock(this.primaryKey, query.primaryKey, () => {
            return this.query(sql, bind)
                .then(rows => {
                    if (this.cache) {
                        return this.cacheDeletePrimary(query.primaryKey);
                    }
                    return rows;
                })
        })
            .then(rows => r(true))
            .catch(output => {
                if (!output || typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }

    remove(query){
        if (!query.primaryKey) {
            return Promise.resolve(r(false, "primary key value required"));
        }
        let vals = query.primaryKey;
        if (!Array.isArray(vals)) {
            vals = [vals];
        }
        let bind = {};
        let sql = "DELETE ";
        sql += this.from();
        if (this.getField(this.primaryKey).type == "int") {
            vals = intArray(vals);
            sql += "WHERE " + this.primaryKey + " IN (" + vals.join(",") + ")";
        } else {
            vals = [...new Set(vals)];
            let wh = [], cnt = 1;
            for (let key in vals) {
                wh.push(":" + this.primaryKey + cnt);
                bind[this.primaryKey + cnt] = vals[key];
                ++cnt;
            }
            sql += "WHERE " + this.primaryKey + " IN (" + wh.join(",") + ")";
        }
        return this.getLock(this.primaryKey, query.primaryKey, () => {
            return this.query(sql, bind)
                .then(res => {
                    if (this.cache) {
                        return this.cacheDeletePrimary(vals);
                    }
                })
        })
            .then(() => r(true))
            .catch(output => {
                if (!output || typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }

    getTable(){
        return this.tableName;
    }

    select(raw=""){
        if (raw) {
            return "SELECT " + raw + " ";
        }
        return "SELECT "
            + Object.keys(this.fields).join(",")
            + (this.timestamps && this.timestamps.created ? ",UNIX_TIMESTAMP(" + this.timestamps.created.name + ") AS " + this.timestamps.created.name : "")
            + (this.timestamps && this.timestamps.modified ? ",UNIX_TIMESTAMP(" + this.timestamps.modified.name + ") AS " + this.timestamps.modified.name : "")
            + " ";
    }

    from(alias="") {
        return "FROM " + this.getTable() + " " + (alias?alias + " ":"");
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

    outputCache() {
        return this.cache().getAll()
            .then(result => r(true, result));
    }

    getDb() {
        return this.db;
    }

    getCache() {
        return this.cache;
    }
    
    query(...args) {
        return this.getDb().query(...args);
    }

    queryMulti(...args) {
        return this.getDb().queryMulti(...args);
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
