"use strict"

const _object = require("lodash/object");
const Query = require("./query");
const {r, int_array, param_fo} = require("./util");

const ALLOWED_COMMANDS = [
    "add",
    "get",
    "get_count",
    "get_multi",
    "lookup",
    "remove",
    "set",
];

class Model {

    constructor(dataserve, config, db_container, cache_container, db_table){
        this._dataserve = dataserve;
        this._db_container = db_container;
        this._cache_container = cache_container;

        this._db_table = db_table;
        this._db_name = null;
        this._table_name = null;
        this._model = null;
        this._type = null;
        this._media = null;

        this._set_insert = null;
        this._primary_key = null;
        this._fields = {};
        this._relationships = {};
        this._fillable = [];
        this._unique = [];
        this._get_multi = [];

        this._timestamps = {
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

        this._parse_config(config);
        
        if (!this._model) {
            this._model = this._table_name;
        }
    }

    _parse_config(config){
        [this._db_name, this._table_name] = this._db_table.split(".");
        if (!this._db_name || !this._table_name) {
            throw new Error("Missing db/table names");
        }
        this._db_config = config.db[this._db_name];
        if (!this._db_config) {
            throw new Error("Configuration missing for db: " + this._db_name);
        }
        this._table_config = this._db_config.tables[this._table_name];
        if (!this._table_config) {
            throw new Error("Missing config information for table: " + this._table_name);
        }
        
        this._db = this._db_container.get_db(this._db_name, this._db_config);
        if (this._db_config.cache) {
            this._cache = this._cache_container.get_cache(this._db_name, this._db_config);
        } else {
            this._cache = this._cache_container.get_cache(this._db_name, this._table_config);
        }

        if (!this._table_config.fields) {
            throw new Error("Missing fields information for table: " + this._table_name);
        }
        for (let key in this._table_config.fields) {
            this._add_field(key, this._table_config.fields[key]);
        }
        if (!this._primary_key) {
            throw new Error("A primary key must be specified for table: " + this._table_name);
        }
        if (typeof this._table_config.set_insert !== "undefined") {
            this._set_insert = this._table_config.set_insert;
            if (this._set_insert && !this._fields[this._primary_key].fillable) {
                throw new Error("Primary key must be fillable when `set_insert` is set to true");
            }
        }
        if (typeof this._table_config.timestamps !== "undefined") {
            if (!this._table_config.timestamps) {
                this._timestamp = null;
            } else {
                if (typeof this._table_config.timestamps.created !== "undefined") {
                    this._timestamps.created = this._table_config.timestamps.created;
                }
                if (typeof this._table_config.timestamp.modified !== "undefined") {
                    this._timestamps.modified = this._table_config.timestamps.modified;
                }
            }
        }
        if (this._table_config.relationships) {
            for (let type in this._table_config.relationships) {
                for (let other_table of this._table_config.relationships[type]) {
                    this._add_relationship(type, other_table);
                }
            }
        }
    }

    db_config() {
        return this._db_config;
    }

    table_config() {
        return this._table_config;
    }

    run(command, input) {
        if (command == "output_cache") {
            return this[command]();
        }
        
        let query = new Query(input, command, this), module = null;
        
        if (module = this.table_config().module) {
            module = new (require("./module/" + module))(this);
        } else {
            module = new (require("./module"))(this);
        }
        
        let hooks = module.get_hooks(command);

        if (ALLOWED_COMMANDS.indexOf(command) === -1) {
            throw new Error("invalid command: " + command);
        }
        return this[command](query, hooks);
    }
    
    get_field(field) {
        if (typeof this._fields[field] === "undefined") {
            return null;
        }
        return this._fields[field];
    }
    
    _add_field(field, attributes){
        this._fields[field] = attributes;
        if (attributes.key) {
            switch (attributes.key) {
            case "primary":
                this._primary_key = field;
                break;
            case "unique":
                this._add_unique(field);
                break;
            }
        }
        if (attributes.fillable) {
            this._add_fillable(field);
        }
        if (attributes.multi) {
            this._add_multi(field);
        }
    }

    get_primary_key() {
        return this._primary_key;
    }
    
    is_primary_key(field) {
        return this._primary_key === field;
    }
    
    is_fillable(field) {
        return this._fillable.indexOf(field) !== -1;
    }
    
    _add_fillable(arr){
        if (!Array.isArray(arr)) {
            arr = [arr];
        }
        this._fillable = [...new Set(this._fillable.concat(arr))];
    }

    is_unique(field) {
        return this._unique.indexOf(field) !== -1;
    }
    
    _add_unique(arr){
        if (!Array.isArray(arr)) {
            arr = [arr];
        }
        this._unique = [...new Set(this._unique.concat(arr))];
    }

    is_get_multi(field) {
        return this._get_multi.indexOf(field) !== -1;
    }
    
    _add_get_multi(arr){
        if (!Array.isArray(arr)) {
            arr = [arr];
        }
        this._get_multi = [...new Set(this._get_multi.concat(arr))];
    }
    
    _add_relationship(type, table){
        if (["belongs_to", "has_one"].indexOf(type) == -1) {
            return;
        }
        if (!this._relationships[type]) {
            this._relationships[type] = {};
        }
        this._relationships[type][table] = true;
    }

    add(query, hooks){
        if (!query.has_fields()) {
            return Promise.resolve(r(false, "missing fields"));
        }
        var primary_key_val = null;
        return hooks.run_pre(query)
            .then(() => {
                let cols = [], vals = [], bind = [];
                for (let field in query.fields) {
                    cols.push(field);
                    if (this.get_field(field).type == "int") {
                        vals.push(parseInt(query.fields[field], 10));
                    } else {
                        vals.push(":" + field);
                        bind[field] = query.fields[field];
                    }
                }
                if (!this.get_field(this._primary_key).autoinc) {
                    if (typeof query.fields[this._primary_key] === "undefined") {
                        return Promise.reject(r(false, "primary key required"));
                    }
                    primary_key_val = query.fields[this._primary_key];
                }
                let sql = "INSERT INTO " + this._table() + " (" + cols.join(",") + ") VALUES (" + vals.join(",") + ")";
                return this.query(sql, bind);
            })
            .then(res => {
                if (!primary_key_val) {
                    primary_key_val = res.insertId;
                }
                if (this._cache) {
                    this._cache_delete_primary(primary_key_val);
                }
                return res;
            })
            .then(res => {
                return this.run("get", {
                    [this._primary_key]: primary_key_val,
                    fillin: query.fillin,
                });
            })
            .catch(output => {
                if (typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }
    
    get(query){
        if (!query.has_get()) {
            return Promise.resolve(r(false, "missing param:"+JSON.stringify(query)));
        }

        var cache_rows = {}, where = [], bind = {}, cache_promise = null;
        var get_vals = query.get.vals;

        //cacheable
        if (this._cache && query.get.field == this._primary_key) {
            cache_promise = this._cache_get_primary(get_vals);
        } else {
            cache_promise = Promise.resolve([{}, get_vals]);
        }
        return cache_promise
            .then(result => {
                [cache_rows, get_vals] = result;
                if (!get_vals.length) {
                    return cache_rows;
                }
                if (!Array.isArray(get_vals)) {
                    get_vals = [get_vals];
                }
                if (this.get_field(query.get.field).type == "int") {
                    get_vals = int_array(get_vals);
                    where.push(query.get.field + " IN (" + get_vals.join(",") + ")");
                } else {
                    get_vals = [...new Set(get_vals)];
                    let wh = [], cnt = 1;
                    for (let index in get_vals) {
                        wh.push(":" + query.get.field + cnt);
                        bind[query.get.field + cnt] = get_vals[index];
                        ++cnt;
                    }
                    where.push(query.get.field + " IN (" + wh.join(",") + ")");
                }
                let sql = this._select();
                sql += this._from();
                sql += this._where(where);

                return this.query(sql, bind, this._primary_key).then(rows => {
                    var cache_promise = Promise.resolve(rows);
                    if (this._cache) {
                        //set cache to null for vals that didn't exist in DB
                        let cache = Object.assign(get_vals.reduce((obj, val) => {
                            obj[val] = null;
                            return obj;
                        }, {}), rows);
                        cache_promise = this._cache_set_primary(cache);
                    }
                    return cache_promise.then(ignore => rows);
                });
            })
            .then(rows => {
                return Object.assign(cache_rows, rows);
            })
            .then(rows => {
                return this._fillin(query, rows)
            })
            .then(rows => {
                let extra = {
                    db_name: this._db_name,
                    table_name: this._table_name,
                };
                if (query.single_row_result) {
                    for (let id in rows) {
                        return r(true, rows[id], extra);
                    }
                    return r(true, {});
                }
                if (query.is_output_style("BY_ID")) {
                    return r(true, rows, extra);
                }
                return r(true, _object.pick(rows, query.get.vals), extra);
            })
            .catch(output => {
                if (typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }

    get_count(query) {
        query.set_limit(1, 1);
        query.set_output_style("FOUND_ONLY");
        return this.lookup(query)
            .then(output => output.status ? r(true, output.found) : output)
            .catch(output => {
                if (typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }

    get_multi(query){
        if (!query.has_get_multi()) {
            return Promise.resolve(r(false, "missing param"));
        }
        //this._fillin_limit(query);

        var queries = [];
        if (this.get_field(query.get_multi.field) == 'int') {
            query[query.get_multi.field] = int_array(query.get_multi.vals);
            for (let id of query.get_multi.vals) {
                let sql = 'SELECT ' + this._primary_key.name + ' ';
                sql += this._from();
                sql += 'WHERE ' + field + '=' + id;
                queries.push(sql);
            }
        } else if (this.get_field(query.get_multi.field) == 'string') {
            //TODO
        } else {
            return Promise.resolve(r(false, "invalid field type for multi get:" + this.get_field(query.get_multi.field)));
        }
        return this.query_multi(queries)
            .then(result => {
                let ids = [];
                for (let rows of result) {
                    for (let a of rows) {
                        ids.push(a[this._primary_key.name]);
                    }
                }
                let q = new Query({
                    id: ids,
                    fillin: query.fillin,
                    output_style: "BY_ID",
                }, "get", this);
                return this.get(q);
            })
            .then(res => {
                if (!res.status) {
                    return Promise.reject(res);
                }
                let output = [];
                for (let id of query.get_multi.vals) {
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
                if (typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }

    inc(query) {
        if (!query.primary_key) {
            Promise.resolve(r(false, "missing primary field:"+JSON.stringify(query)));
        }
        let vals = query.primary_key;
        if (!Array.isArray(vals)) {
            vals = [vals];
        }
        vals = int_array(vals);
        if (!query.has_fields()) {
            return Promise.resolve(r(false, "missing update fields"));
        }

        sql = "UPDATE " + this._table() + " SET ";
        for (let key in query.fields) {
            updates.push(key + "=" + key + " + " + parseInt(query.fields[key], 10));
        }
        sql += "WHERE " + this._primary_key + " IN (" + vals.join(",") + ")";
        return this.query(sql)
            .then(rows => {
                if (this._cache) {
                    return this._cache_delete_primary(vals);
                }
                return rows;
            })
            .then(rows => r(true))
            .catch(output => {
                if (typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }

    lookup(query, hooks) {
        var meta = {};
        
        return hooks.run_pre(query)
            .then(() => {
                let sql_select = "SELECT " + query.alias + "." + this._primary_key + " "
                let sql = this._from(query.alias);
                if (query.join && Array.isArray(query.join) && query.join.length) {
                    for (let table in query.join) {
                        sql += "INNER JOIN " + table + " ON (" + query.join[table] + ") ";
                    }
                }
                if (query.left_join && Array.isArray(query.left_join) && query.left_join.length) {
                    for (let table in query.left_join) {
                        sql += "LEFT JOIN " + table + " ON (" + query.left_table[table] + ") ";
                    }
                }
                
                sql += this._where(query.where);
                let sql_group = this._group(query.group);
                sql += sql_group;
                sql += this._order(query.order);

                let sql_limit = this._limit(query);
                
                let sql_rows = sql_select + sql + sql_limit;

                let sql_cnt = "SELECT COUNT(*) AS cnt " + sql;
                if (sql_group.length) {
                    sql_cnt = "SELECT COUNT(*) AS cnt FROM (" + sql_select + sql + ") AS t";
                }

                if (query.is_output_style("FOUND_ONLY")) {
                    return this.query(sql_cnt, query.bind, true).then(found => {
                        let meta = {
                            pages: query.limit.limit ? Math.ceil(found/query.limit.limit) : null,
                            found: found,
                        };
                        return Promise.reject(r(true, [], meta));
                    });
                }
                
                return this.query(sql_rows, query.bind, this._primary_key)
            })
            .then(rows => {
                if (query.is_output_style("INCLUDE_FOUND")) {
                    return this.query(sql_cnt, query.bind, true).then(found => [rows, found["cnt"]]);
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
                    if (query.is_output_style("BY_ID")) {
                        return Promise.reject(r(true, {}));
                    }
                    return Promise.reject(r(true, []));
                }
                if (query.is_output_style("LOOKUP_RAW")) {
                    if (query.is_output_style("BY_ID")) {
                        return Promise.reject(r(true, rows));
                    }
                    return Promise.reject(r(true, Object.values(rows)));
                }
                return this.run("get", {
                    [this._primary_key]: ids,
                    fillin: query.fillin,
                });
            })
            .then(result => {
                if (!result.status) {
                    return Promise.reject(result);
                }
                if (query.is_output_style("BY_ID")) {
                    return result.result;
                }
                return Object.values(result.result);
            })
            .then(result => {
                return hooks.run_post(result);
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
        if (!query.primary_key) {
            return Promise.resolve(r(false, "missing primary key"));
        }
        if (!query.fields) {
            return Promise.resolve(r(false, "missing update fields"));
        }

        var sql = "", updates = [], bind = {};
        if (this._primary_key.set_insert) {
            query.fields[this._primary_key] = query.primary_key;
            let cols = [], vals = [];
            for (let field in query.fields) {
                cols.push(field);
                if (this.get_field(field).type == "int") {
                    vals.push(parseInt(query.fields[field], 10));
                    if (field != this._primary_key) {
                        updates.push(field + "=" + parseInt(query.fields[field], 10) + " ");
                    }
                } else {
                    vals.push(":" + field);
                    if (field != this._primary_key) {
                        updates.push(field + "=:" + field + " ");
                    }
                    bind[field] = query.fields[field];
                }
            }
            sql = "INSERT INTO " + this._table() + " (" + cols.join(",") + ") VALUES (" + vals.join(",") + ") ON DUPLICATE KEY UPDATE " + updates.join(",") + " ";
        } else {
            sql = "UPDATE " + this._table() + " SET ";
            for (let field in query.fields) {
                if (this.get_field(field).type == "int") {
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
            if (this.get_field(this._primary_key).type == "int") {
                sql += "WHERE " + this._primary_key + "=" + parseInt(this._primary_key, 10);
            } else {
                sql += "WHERE " + this._primary_key + "=:" + this._primary_key;
                bind[this._primary_key] = query.primary_key;
            }
        }
        return this.query(sql, bind)
            .then(rows => {
                if (this._cache) {
                    return this._cache_delete_primary(query.primary_key);
                }
                return rows;
            })
            .then(rows => r(true))
            .catch(output => {
                if (typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }

    remove(query){
        if (!query.primary_key) {
            return Promise.resolve(r(false, "primary key value required"));
        }
        let vals = query.primary_key;
        if (!Array.isArray(vals)) {
            vals = [vals];
        }
        let bind = {};
        let sql = "DELETE ";
        sql += this._from();
        if (this.get_fields(this._primary_key).type == "int") {
            vals = int_array(vals);
            sql += "WHERE " + this._primary_key + " IN (" + vals.join(",") + ")";
        } else {
            vals = [...new Set(vals)];
            let wh = [], cnt = 1;
            for (let key in vals) {
                wh.push(":" + this._primary_key + cnt);
                bind[this._primary_key + cnt] = vals[key];
                ++cnt;
            }
            sql += "WHERE " + this._primary_key + " IN (" + wh.join(",") + ")";
        }
        return this.query(sql, bind)
            .then(res => {
                if (this._cache) {
                    this._cache_delete_primary(vals);
                }
            })
            .then(() => r(true))
            .catch(output => {
                if (typeof output.status === "undefined") {
                    return r(false, output);
                }
                return output;
            });
    }

    _table(){
        return this._table_name;
    }

    _select(raw=""){
        if (raw) {
            return "SELECT " + raw + " ";
        }
        return "SELECT "
            + Object.keys(this._fields).join(",")
            + (this._timestamps && this._timestamps.created ? ",UNIX_TIMESTAMP(" + this._timestamps.created.name + ") AS " + this._timestamps.created.name : "")
            + (this._timestamps && this._timestamps.modified ? ",UNIX_TIMESTAMP(" + this._timestamps.modified.name + ") AS " + this._timestamps.modified.name : "")
            + " ";
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

    _limit(query){
        if (!query.limit.page || !query.limit.limit) {
            return "";
        }
        let page = parseInt(query.limit.page, 10) - 1;
        let limit = parseInt(query.limit.limit, 10);
        let offset = page * limit;
        return "LIMIT " + offset + "," + limit;
    }

    _fillin(query, rows) {
        if (!query.has_fillin()) {
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
                if (!query.fillin[table]) {
                    continue;
                }
                let inp = {
                    fillin: query.fillin,
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
            });
    }

    output_cache() {
        return this.cache().get_all()
            .then(result => r(true, result));
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
        return this._cache_get(this._primary_key, keys);
    }

    _cache_get(field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        return this._cache.get(this._db_table, field, keys).then(cache_rows => {
            let ids = [];
            for (let key of keys) {
                if (typeof cache_rows[key] === "undefined") {
                    ids.push(key);
                }
            }
            return [cache_rows, ids];
        });
    }

    _cache_set_primary(rows) {
        return this._cache_set(this._primary_key, rows);
    }

    _cache_set(field, rows) {
        return this._cache.set(this._db_table, field, rows);
    }

    _cache_delete_primary(keys) {
        return this._cache_delete(this._primary_key, keys);
    }

    _cache_delete(field, keys) {
        return this._cache.del(this._db_table, field, keys);
    }

    _unique_input_field(query) {
        if (typeof query[this._primary_key] !== "undefined") {
            return this._primary_key;
        }
        var field = null;
        for (let key in this._unique) {
            if (typeof query[key] !== "undefined") {
                field = key;
                break;
            }
        }
        return field;
    }

}

module.exports = Model;
