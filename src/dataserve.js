"use strict"

const _array = require("lodash/array");
const mysql = require("./mysql");
const config = require("../config/example.json");
const command = require('./command');

console.log("COMMAND", command);

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

class DataServe {

    constructor(db_table){
        this._primary = "id";

        this._db_name = null;
        this._table_name = null;
        this._model = null;
        this._type = null;
        this._media = null;

        this._fields = [];
        this._relationships = [];
        this._get = [];
        this._get_multi = [];

        this._mysql = new mysql;

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
        console.log("TABLE CONFIG", config, db_table);
        let table_config = config.db[this._db_name].table[this._table_name];
        if (!table_config) {
            throw new Error("Missing config information for db table: " + db_table);
        }
        if (typeof table_config.primary_key !== "undefined") {
            this._primary = table_config.primary_key;
        }
        if (typeof table_config.set_insert === "boolean") {
            this._set_insert = table_config.set_insert;
        }
        if (typeof table_config.timestamp !== "undefined") {
            if (!table_config.timestamp) {
                this._timestamp = null;
            } else {
                if (typeof table_config.timestamp.created !== "undefined") {
                    this._timestamp.created = table_config.timestamp.created;
                }
                if (typeof table_config.timestamp.modified !== "undefined") {
                    this._timestamp.modified = table_config.timestamp.modified;
                    
                }
            }
        }
        if (table_config.field) {
            for (let key in table_config.field) {
                this._add_field(table_config.field[key]);
            }
        }
        if (table_config.unique) {
            this._add_get(table_config.unique);
        }
        if (table_config.relationship) {
            if (table_config.relationship.has_one) {
                for (let key in table_config.relationship.has_one) {
                    this._add_relationship("has_one", table_config.relationship.has_one[key]);
                }
            }
        }
        console.log("PARSE CONFIG", config);
    }
    
    _add_get(obj){
        for (let key in obj) {
            this._get[key] = obj[key];
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
        console.log("CHECK INPUT PRIMARY", this._primary);
        if (input[this._primary]) {
            field = this._primary;
        } else {
            for (let key in this._get) {
                if (input[key]) {
                    field = key;
                    break;
                }
            }
            if (!field) {
                return Promise.resolve(r(false, "missing param:"+JSON.stringify(input)));
            }
        }

        var single_row_result = false;
        var rows = {}, where = [], bind = {};

        if (this._get[field] == "int") {
            if (Array.isArray(input[field])) {
                input[field] = int_array(input[field]);
                where.push(field + " IN (" + input[field].join(",") + ")");
            } else {
                single_row_result = true;
                where.push(field + "=:" + field);
                bind[field] = parseInt(input[field], 10);
            }
        } else if (this._get[field] == "string") {
            if (is_array(input[field])) {
                input[field] = [...new Set(input[field])];
                let wh = [];
                let cnt = 1;
                for (let index in input[field]) {
                    wh.push(field + "=:" + field+cnt);
                    bind[field+cnt] = input[field][index];
                    ++cnt;
                }
                where.push("(" + wh.join(" OR ") + ")");
            } else {
                single_row_result = true;
                where.push(field + "=:" + field);
                bind[field] = input[field];
            }
        }

        let sql = this._select();
        sql += this._from();
        sql += this._where(where);
        //this._master();

        return this._query(sql, bind, this._primary)
            .then(rows => {
                return this._fillin(input, rows);
            })
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
            .catch(error => {
                return r(false, error);
            });
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
        } else {}
        rows = this._query_multi(queries);

        let ids = [];
        for (let r of rows) {
            for (let a of r) {
                ids.push(a[this._primary]);
            }
        }
        let inp = {
            id: ids,
            fillin: param_fo(input, 'fillin'),
            return_by_id: true
        };
        ret = this._m('get', inp);
        res = [];
        for (let id of input[field]) {
            arr = array_shift(rows);
            let r = [];
            for (let a of arr) {
                r.push(ret[a['id']]);
            }
            res[id] = r;
        }
        return r(true, output, res);
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
                return this._query(sql, bind)
                    .then(rows => r(true));
            }
            return Promise.resolve(r(false));
        });
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
        return this._query(sql, bind)
            .then(res => this.get({[this._primary]: res.insertId}))
            .catch(error => r(false, error));
        /*
          } catch (e) {
          if (e.indexOf("Duplicate entry") !== -1) {
          return r(false, output, {email: "Already in use"});
          }
          throw e;
          }
        */
    }

    remove(input){
        if (!input[this._primary]) {
            return Promise.resolve(r(false, "primary key value required"));
        }

        let sql = "DELETE ";
        sql += this._from();
        sql += "WHERE " + this._primary + "=:" + this._primary;
        return this._query(sql, {[this._primary]: parseInt(input[this._primary], 10)})
            .then(() => r(true))
            .catch (error => r(false, error));
    }

    lookup(input) {
        this._fillin_limit(input);

        if (!input.prefix) {
            input.prefix = this._table().substring(0, 1);
        }
        
        let cnt = "";
        if (input.return_found) {
            cnt = "SQL_CALC_FOUND_ROWS";
        }
        
        let sql = "SELECT " + cnt + " " + input.prefix + "." + this._primary + " ";
        sql += this._from(prefix);
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
        sql += this._group(input.group);
        sql += this._limit(input);

        return this._query(sql, bind, this._primary)
            .then(rows => {
                if (input.return_found) {
                    let sql = "SELECT FOUND_ROWS() as fnd";
                    return this._query(sql, [], true).then(found => [rows, found["fnd"]]);
                } else {
                    return [rows, 0];
                }
            }).then((...args) => {
                let ids = rows ? Object.keys(rows) : [];
                if (ids) {
                    let inp = {
                        [this._primary]: ids,
                        fillin: param_fo(input, "fillin")
                    };
                    rows = this.get(inp);
                }
                let extra = {
                    pages: ceil(found/input.limit),
                    found: found,
                };
                if (input.return_by_id) {
                    return r(true, rows, extra);
                }
                return r(true, array_values(rows), extra);
            }).catch(error => r(false, error));
    }

    get_count(input) {
        let inp = Object.assign(input, {
            page: 1,
            limit: 1,
            return_raw: true,
            return_found: true,
        });
        this._lookup(inp, out)
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
        if (!where) {
            return "";
        }
        if (Array.isArray(where)) {
            where = where.join(" AND ") + " ";
        } else {
            where += " ";
        }
        return "WHERE " + where;
    }

    _group(group){
        if (!group) {
            return "";
        }
        if (Array.isArray(group)) {
            group = group.join(",") + " ";
        } else {
            group += " ";
        }
        return "GROUP BY " + group;
    }

    _order(order){
        if (!order) {
            return "";
        }
        let out = "ORDER BY ";
        if (!Array.isArray(order)) {
            out += order;
        } else {
            out += order.join(",");
        }
        return out + " ";
    }

    _limit(input){
        if (!input.page || !input.limit) {
            return "";
        }
        let page = parseInt(input.page, 10) - 1;
        let offset = page * parseInt(input.limit, 10);
        return "LIMIT " + offset + "," + page;
    }

    _fillin(input, rows) {
        console.log("HELLO", input);
        if (!input.fillin || typeof input.fillin !== "object") {
            console.log("RETURN", rows);
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
                    promises.push(command.run_internal("get_multi", this._db_name + "." + table, inp));
                } else {
                    if (type == "has_one") {
                        inp[this._model + "_id"] = ids;
                    } else if (type == "belongs_to") {
                        inp["id"] = rows.map(obj => obj[table + "_id"]);
                    }
                    promises.push(command.run_internal("get", this._db_name + "." + table, inp));
                }
                promise_map[table] = type;
            }
        }
        console.log("PROMISES", promises);
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

    _query(sql, bind={}, ret_type=null) {
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

        return this._mysql.query(sql, bind, force_master)
            .then(results => {
                if (query_type == "SELECT") {
                    if (typeof(ret_type) === "boolean" && ret_type) {
                        if (results.length) {
                            return results[0];
                        }
                        return results;
                    }
                    if (typeof(ret_type) === "string") {
                        if (!results.length) {
                            return {};
                        }
                        let res = {};
                        for (let row in results) {
                            res[results[row][ret_type]] = results[row];
                        }
                        return res;
                    }
                    return results;
                }
                if (query_type == "INSERT") {
                    return {
                        insertId: results.insertId,
                    };
                }
                if (query_type == "DELETE") {
                    return {
                        affectedRows: results.affectedRows,
                    };
                }
                if (query_type == "UPDATE" || query_type == "REPLACE") {
                    return {
                        affectedRows: results.affectedRows,
                        changedRows: results.changedRows,
                    };
                }
                return null;
            });
    }
}

module.exports = DataServe;
