"use strict"

const _array = require("lodash/array");

function int_array(arr) {
    if (!arr || !Array.isArray(arr)) {
        return [];
    }
    arr = arr.map(val => parseInt(val, 10));
    return _array.uniq(arr);
}

function r(success, result=null, extra={}){
    if (success) {
        return Object.assign(extra, {
            status: true,
            result: result,
        });
    }
    return Object.assign(extra, {
        status: false,
        error: result.error || result,
    });
}

function param_f(arr, param, def) {
    return arr[param] ? arr[param] : def;
}

function param_fo(arr, param) {
    return param_f(arr, param, {});
}

class Model {

    constructor(dataserve, config, db_container, cache_container, db_table){
        this._primary = "id";

        this._dataserve = dataserve;
        this._db_container = db_container;
        this._cache_container = cache_container;

        this._db_name = null;
        this._table_name = null;
        this._model = null;
        this._type = null;
        this._media = null;

        this._fields = [];
        this._relationships = [];
        this._get = [];
        this._get_multi = {};

        this._timestamp = {
            created: "ctime",
            modified: "mtime",
        };
        this._set_insert = false;

        this._parse_config(db_table, config);

        this._add_get({[this._primary]: "int"});
        this._add_field(this._primary);

        if (this._timestamp) {
            if (this._timestamp.created) {
                this._add_field(this._timestamp.created);
            }
            if (this._timestamp.modified) {
                this._add_field(this._timestamp.modified);
            }
        }
        
        if (!this._model) {
            this._model = this._table_name;
        }
    }

    _parse_config(db_table, config){
        [this._db_name, this._table_name] = db_table.split(".");
        if (!this._db_name || !this._table_name) {
            throw new Error("Missing db/table names");
        }
        this._db_config = config.db[this._db_name];
        if (!this._db_config) {
            throw new Error("Configuration missing for db: " + this._db_name);
        }
        this._table_config = this._db_config.table[this._table_name];
        if (!this._table_config) {
            throw new Error("Missing config information for table: " + this._table_name);
        }
        this._db = this._db_container.get_db(this._db_name, this._db_config);
        if (this._db_config.cache) {
            this._cache = this._cache_container.get_cache(this._db_name, this._db_config);
        } else {
            this._cache = this._cache_container.get_cache(this._db_name, this._table_config);
        }
        
        if (typeof this._table_config.primary_key !== "undefined") {
            this._primary = this._table_config.primary_key;
        }
        if (typeof this._table_config.set_insert === "boolean") {
            this._set_insert = this._table_config.set_insert;
        }
        if (typeof this._table_config.timestamp !== "undefined") {
            if (!this._table_config.timestamp) {
                this._timestamp = null;
            } else {
                if (typeof this._table_config.timestamp.created !== "undefined") {
                    this._timestamp.created = this._table_config.timestamp.created;
                }
                if (typeof this._table_config.timestamp.modified !== "undefined") {
                    this._timestamp.modified = this._table_config.timestamp.modified;
                    
                }
            }
        }
        if (this._table_config.field) {
            for (let key in this._table_config.field) {
                this._add_field(this._table_config.field[key]);
            }
        }
        if (this._table_config.unique) {
            this._add_get(this._table_config.unique);
        }
        if (this._table_config.multi) {
            this._add_get_multi(this._table_config.multi);
        }
        if (this._table_config.relationship) {
            if (this._table_config.relationship.has_one) {
                for (let other_table of this._table_config.relationship.has_one) {
                    this._add_relationship("has_one", other_table);
                }
            }
            if (this._table_config.relationship.belongs_to) {
                for (let other_table of this._table_config.relationship.belongs_to) {
                    this._add_relationship("belongs_to", other_table);
                }
            }
        }
    }
    
    _add_get(obj){
        for (let key in obj) {
            this._get[key] = obj[key];
        }
    }

    _add_get_multi(obj){
        for (let key in obj) {
            this._get_multi[key] = obj[key];
        }
    }
    
    _add_field(field){
        if (this._timestamp && (field == this._timestamp.created || field == this._timestamp.modified)) {
            return;
        }
        this._fields.push(field);
        this._fields = [...new Set(this._fields)];
    }

    _add_relationship(type, table){
        if (!this._relationships[type]) {
            this._relationships[type] = {};
        }
        this._relationships[type][table] = true;
    }
    
    get(input){
        var field = null;
        if (input[this._primary]) {
            field = this._primary;
        } else {
            for (let key in this._get) {
                if (typeof input[key] !== "undefined") {
                    field = key;
                    break;
                }
            }
            if (!field) {
                return Promise.resolve(r(false, "missing param:"+JSON.stringify(input)));
            }
        }

        var single_row_result = !Array.isArray(input[field]);
        var cache_rows = {}, where = [], bind = {}, cache_promise = null;

        //cacheable
        if (this._cache && field == this._primary) {
            cache_promise = this._cache_get_primary(input[field]);
        } else {
            cache_promise = Promise.resolve([{}, input[field]]);
        }
        return cache_promise
            .then(result => {
                [cache_rows, input[field]] = result;
                if (!input[field].length) {
                    return cache_rows;
                }
                if (!Array.isArray(input[field])) {
                    input[field] = [input[field]];
                }
                if (this._get[field] == "int") {
                    input[field] = int_array(input[field]);
                    where.push(field + " IN (" + input[field].join(",") + ")");
                } else if (this._get[field] == "string") {
                    input[field] = [...new Set(input[field])];
                    let wh = [], cnt = 1;
                    for (let index in input[field]) {
                        wh.push(field + "=:" + field+cnt);
                        bind[field+cnt] = input[field][index];
                        ++cnt;
                    }
                    where.push("(" + wh.join(" OR ") + ")");
                }
                let sql = this._select();
                sql += this._from();
                sql += this._where(where);
                //this._master();

                return this.query(sql, bind, this._primary);
            })
            .then(rows => {
                if (this._cache) {
                    return this._cache_set_primary(rows);
                }
                return rows;
            })
            .then(rows => this._fillin(input, rows))
            .then(rows => {
                let extra = {
                    db_name: this._db_name,
                    table_name: this._table_name,
                };
                if (single_row_result) {
                    for (let id in rows) {
                        return r(true, rows[id], extra);
                    }
                    return r(true, {});
                }
                if (input.return_by_id) {
                    return r(true, rows, extra);
                }
                let result = [];
                for (let id of input[this._primary]) {
                    if (rows[id]) {
                        result.push(rows[id]);
                    }
                }
                return r(true, result, extra);
            })
            .catch(error => r(false, error));
    }

    get_multi(input){
        var field = null;
        for (let key in this._get_multi) {
            if (input[key]) {
                field = key;
                break;
            }
        }
        if (!field) {
            return Promise.resolve(r(false, "missing param"));
        }
        //this._fillin_limit(input);

        var queries = [];
        if (this._get_multi[field] == 'int') {
            input[field] = int_array(input[field]);
            for (let id of input[field]) {
                let sql = 'SELECT ' + this._primary + ' ';
                sql += this._from();
                sql += 'WHERE ' + field + '=' + id;
                queries.push(sql);
            }
        } else if (this._get_multi[field] == 'string') {
            //TODO
        } else {
            throw new Error("invalid field type for multi get:" + this._get_multi[field]);
        }
        return this.query_multi(queries)
            .then(result => {
                let ids = [];
                for (let rows of result) {
                    for (let a of rows) {
                        ids.push(a[this._primary]);
                    }
                }
                let inp = {
                    id: ids,
                    fillin: param_fo(input, 'fillin'),
                    return_by_id: true,
                };
                return this.get(inp).then(res => {
                    if (!res.status) {
                        return res;
                    }
                    let output = [];
                    for (let id of input[field]) {
                        let rows = result.shift();
                        let r = [];
                        for (let row of rows) {
                            r.push(res.result[row['id']]);
                        }
                        output[id] = r;
                    }
                    return r(true, output);
                });
            }).catch(error => r(false, error));
    }

    set(input) {
        if (!input[this._primary]) {
            return Promise.resolve(r(false, "missing primary key"));
        }
        if (!input.fields) {
            return Promise.resolve(r(false, "missing update fields"));
        }

        return this.get({[this._primary]: input[this._primary]}).then(exist => {
            if (!exist && !this._set_insert) {
                return Promise.resolve(r(false, "Not Found"));
            }
            if (input.fields) {
                var sql = "", updates = [], bind = {};
                if (this._set_insert) {
                    input.fields[this._primary] = input[this._primary];
                    let cols = [], vals = [];
                    for (let key in fields) {
                        cols.push(key);
                        vals.push(":" + key);
                        if (key != this._primary) {
                            updates.push(key + "=:" + key + " ");
                        }
                        bind[key] = input.fields[key];
                    }
                    sql = "INSERT INTO " + this._table() + " (" + cols.join(",") + ") VALUES (" + vals.join(",") + ") ON DUPLICATE KEY UPDATE " + updates.join(",") + " ";
                } else {
                    sql = "UPDATE " + this._table() + " SET ";
                    for (let key in input.fields) {
                        updates.push(key + "=:" + key + " ");
                        bind[key] = input.fields[key];
                    }
                    sql += updates.join(",") + " ";
                    if (input.custom) {
                        if (updates) {
                            sql += ",";
                        }
                        sql += custom.join(",") + " ";
                    }
                    sql += "WHERE " + this._primary + "=:" + this._primary;
                    bind[this._primary] = parseInt(input[this._primary], 10);
                }
                return this.query(sql, bind)
                    .then(rows => {
                        if (this._cache) {
                            return this._cache_delete_primary(input[this._primary]);
                        }
                        return rows;
                    })
                    .then(rows => r(true));
            }
            return Promise.resolve(r(false));
        }).catch(error => r(false, error));
    }

    inc(input) {
        if (!input[this._primary]) {
            return Promise.resolve(r(false, "missing primary key"));
        }
        if (!Array.isArray(input[this._primary])) {
            input[this._primary] = [input[this._primary]];
        }
        input[field] = int_array(input[field]);
        if (!input.fields) {
            return Promise.resolve(r(false, "missing update fields"));
        }

        sql = "UPDATE " + this._table() + " SET ";
        for (let key in input.fields) {
            updates.push(key + "=" + key + " + " + parseInt(input[fields], 10));
        }
        sql += "WHERE " + this._primary + " IN (" + input[this._primary].join(",") + ")";
        return this.query(sql)
            .then(rows => {
                if (this._cache) {
                    return this._cache_delete_primary(input[this._primary]);
                }
                return rows;
            })
            .then(rows => r(true))
            .catch(error => r(false, error));
    }

    add(input){
        if (!input.fields) {
            return Promise.resolve(r(false, "missing fields"));
        }
        let cols = [], vals = [], bind = [];
        for (let key in input.fields) {
            cols.push(key);
            vals.push(":" + key);
            bind[key] = input.fields[key];
        }
        let sql = "INSERT INTO " + this._table() + " (" + cols.join(",") + ") VALUES (" + vals.join(",") + ")";
        return this.query(sql, bind)
            .then(res => {
                if (this._cache) {
                    this._cache_delete_primary(res.insertId);
                }
                return res;
            })
            .then(res => this.get({[this._primary]: res.insertId}))
            .catch(error => r(false, error));
    }

    remove(input){
        if (!input[this._primary]) {
            return Promise.resolve(r(false, "primary key value required"));
        }
        if (!Array.isArray(input[this._primary])) {
            input[this._primary] = [input[this._primary]];
        }
        input[field] = int_array(input[field]);

        let sql = "DELETE ";
        sql += this._from();
        sql += "WHERE " + this._primary + " IN (" + input[this._primary].join(",") + ")";
        return this.query(sql, {[this._primary]: parseInt(input[this._primary], 10)})
            .then(res => {
                if (this._cache) {
                    this._cache_delete_primary(input[this._primary]);
                }
            })
            .then(() => r(true))
            .catch (error => r(false, error));
    }

    lookup(input) {
        //this._fillin_limit(input);

        if (!input.prefix) {
            input.prefix = this._table().substring(0, 1);
        }
        if (!input.bind || typeof input.fillin !== "object") {
            input.bind = {};
        }

        let sql_select = "SELECT " + input.prefix + "." + this._primary + " "
        let sql = this._from(input.prefix);
        if (input.join) {
            for (let table in input.join) {
                sql += "INNER JOIN " + table + " ON (" + input.join[table] + ") ";
            }
        }
        if (input.left_join) {
            for (let table in input.left_join) {
                sql += "LEFT JOIN " + table + " ON (" + input.left_table[table] + ") ";
            }
        }
        sql += this._where(input.where);
        sql += this._order(input.order);

        let sql_group = this._group(input.group);
        sql += sql_group;

        let sql_limit = this._limit(input);
        
        let sql_rows = sql_select + sql + sql_limit;

        let sql_cnt = "SELECT COUNT(*) AS cnt " + sql;
        if (sql_group.length) {
            sql_cnt = "SELECT COUNT(*) AS cnt FROM (" + sql_select + sql + ") AS t";
        }

        if (input.return_found_only) {
            return this.query(sql_cnt, input.bind, true).then(found => {
                let extra = {
                    pages: input.limit ? Math.ceil(found/input.limit) : null,
                    found: found,
                };
                return r(true, [], extra);
            }).catch(error => r(false, error));
        }

        return this.query(sql_rows, input.bind, this._primary)
            .then(rows => {
                if (input.return_found) {
                    return this.query(sql_cnt, input.bind, true).then(found => [rows, found["cnt"]]);
                } else {
                    input.limit = null;
                    return [rows, null];
                }
            }).then(args => {
                let [rows, found] = args;
                let ids = rows ? Object.keys(rows) : [];
                if (!ids.length) {
                    let extra = {
                        pages: input.limit ? Math.ceil(found/input.limit) : null,
                        found: found,
                    };
                    if (input.return_by_id) {
                        return r(true, {}, extra);
                    }
                    return r(true, [], extra);
                }
                let inp = {
                    [this._primary]: ids,
                    fillin: param_fo(input, "fillin")
                };
                return this.get(inp).then(rows => {
                    let extra = {
                        pages: input.limit ? Math.ceil(found/input.limit) : null,
                        found: found,
                    };
                    if (input.return_by_id) {
                        return r(true, rows, extra);
                    }
                    return r(true, Object.values(rows), extra);
                });
            }).catch(error => r(false, error));
    }

    get_count(input) {
        let inp = Object.assign(input, {
            page: 1,
            limit: 1,
            return_found_only: true,
        });
        return this.lookup(inp)
            .then(output => output.status ? r(true, output.found) : output)
            .catch(error => r(false, error));
    }

    _table(){
        return this._table_name;
    }

    _select(raw=""){
        if (raw) {
            return "SELECT " + raw + " ";
        }
        return "SELECT "
            + this._fields.join(",")
            + (this._timestamp && this._timestamp.created?",UNIX_TIMESTAMP(" + this._timestamp.created + ") AS " + this._timestamp.created:"") + " "
            + (this._timestamp && this._timestamp.modified?",UNIX_TIMESTAMP(" + this._timestamp.modified + ") AS " + this._timestamp.modified:"") + " ";
    }

    _from(alias="") {
        return "FROM " + this._table() + " " + (alias?alias + " ":"");
    }

    _where(where){
        if (!where || !Array.isArray(where) || !where.length) {
            return "";
        }
        return "WHERE " + where.join(" AND ") + " ";
    }

    _group(group){
        if (!group || !Array.isArray(group) || !group.length) {
            return "";
        }
        return "GROUP BY " + group.join(",") + " ";
    }

    _order(order){
        if (!order || !Array.isArray(order) || !order.length) {
            return "";
        }
        return "ORDER BY " + order.join(",") + " ";
    }

    _limit(input){
        if (!input.page || !input.limit) {
            return "";
        }
        let page = parseInt(input.page, 10) - 1;
        let limit = parseInt(input.limit, 10);
        let offset = page * limit;
        return "LIMIT " + offset + "," + limit;
    }

    _fillin(input, rows) {
        if (!input.fillin || typeof input.fillin !== "object") {
            return Promise.resolve(rows);
        }
        if (!this._relationships) {
            return Promise.resolve(rows);
        }
        let ids = rows ? Object.keys(rows) : [];

        let promises = [];
        let promise_map = {};
        for (let type in this._relationships) {
            for (let table in this._relationships[type]) {
                if (!input.fillin[table]) {
                    continue;
                }
                let inp = {
                    fillin: param_fo(input.fillin, table),
                    return_by_id: true,
                };
                if (this._relationships[type][table] && typeof this._relationships[type][table] == "object") {
                    inp = Object.assign(opts, inp);
                }
                if (type == "has_many") {
                    inp[this._model + "_id"] = ids;
                    promises.push(this._dataserve.run(this._db_name + "." + table + ":get_multi", inp));
                } else {
                    if (type == "has_one") {
                        inp[this._model + "_id"] = ids;
                    } else if (type == "belongs_to") {
                        inp["id"] = Object.keys(rows).map(key => rows[key][table+"_id"]);
                    }
                    promises.push(this._dataserve.run(this._db_name + "." + table + ":get", inp));
                }
                promise_map[table] = type;
            }
        }
        if (!promises.length) {
            return Promise.resolve(rows);
        }
        return Promise.all(promises)
            .then(res => {
                let fillin = {};

                for (let promise_res of res) {
                    if (!promise_res.status) {
                        throw new Error('Fillin call failed: ' + promise_res.error);
                    }
                    fillin[promise_res.table_name] = {
                        type: promise_map[promise_res.table_name],
                        result: promise_res.result,
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
                        if (["has_one", "has_many"].indexOf(fillin[table].type) !== -1) {
                            rows[index][table] = param_fo(fillin[table].result, rows[index]["id"]);
                        } else if (fillin[table].type == "belongs_to") {
                            rows[index][table] = param_fo(fillin[table].result, rows[index][table + "_id"]);
                        }
                    }
                }
                return rows;
            })
            .catch(error => {
                console.log("FILLIN ERR", error);
            });
    }

    db() {
        return this._db;
    }

    cache() {
        return this._cache;
    }
    
    query(...args) {
        return this.db().query(...args);
    }

    query_multi(...args) {
        return this.db().query_multi(...args);
    }

    _cache_get_primary(keys) {
        return this._cache_get(this._primary, keys);
    }

    _cache_get(field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        return this._cache.get(field, keys).then(cache_rows => {
            let ids = [];
            for (let key of keys) {
                if (typeof cache_rows[key] == "undefined") {
                    ids.push(key);
                }
            }
            return [cache_rows, ids];
        });
    }

    _cache_set_primary(rows) {
        return this._cache_set(this._primary, rows);
    }

    _cache_set(field, rows) {
        return this._cache.set(field, rows);
    }

    _cache_delete_primary(keys) {
        return this._cache_delete(this._primary, keys);
    }

    _cache_delete(field, keys) {
        return this._cache.del(field, keys);
    }

}

module.exports = Model;
