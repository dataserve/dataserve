"use strict"

const _array = require("lodash/array");
const mysql = require("./mysql");
const config = require("../config/example.json");
console.log(config);

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

    constructor(table){
        this._primary = "id";

        this._table_name = table;
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

        this._add_get({[this._primary]: "int"});
        this._add_field(this._primary);
        if (this._timestamp.created) {
            this._add_field(this._timestamp.created);
        }
        if (this._timestamp.modified) {
            this._add_field(this._timestamp.modified);
        }
        
        if (!this._model) {
            this._model = this._table_name;
        }
    }

    _add_get(obj){
        for (let key in obj) {
            this._get[key] = obj[key];
        }
    }

    _add_field(field){
        if (field == this._timestamp.created || field == this._timestamp.modified) {
            return;
        }
        this._fields.push(field);
        this._fields = [...new Set(this._fields)];
    }
    
    get(input){
        var field = null;
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
                return Promise.resolve(r(false, "missing param"));
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
                this._fillin(input, rows);
                
                if (single_row_result) {
                    for (let id in rows) {
                        return r(true, rows[id]);
                    }
                    return r(true, {});
                }
                if (input.return_by_id) {
                    return r(true, rows);
                }
                let result = [];
                for (let id of input[this._primary]) {
                    if (rows[id]) {
                        result.push(rows[id]);
                    }
                }
                return r(true, result);
            }).catch(error => r(false, error));
    }

    set(input) {
        if (!input[this._primary]) {
            return Promise.resolve(r(false, "missing primary key"));
        }

        let exist = this.get({[this._primary]: input[this._primary]});
        if (!exist && !this._set_insert) {
            return Promise.resolve(r(false, "Not Found"));
        }

        if (table) {
            if (this._set_insert) {
                table[this._primary] = input[this._primary];
                let cols = [], vals = [], updates = [], bind = {};
                for (let key in table) {
                    cols.push(key);
                    vals.push(":" + key);
                    if (key != this._primary) {
                        updates.push(key + "=:" + key + " ");
                    }
                    bind[key] = table[key];
                }
                let sql = "INSERT INTO " + this._table() + " (" + cols.join(",") + ") VALUES (" + vals.join(",") + ") ON DUPLICATE KEY UPDATE " + updates.join(",") + " ";
                //this._query(sql, bind);
            } else {
                let updates = [], bind = {};
                let sql = "UPDATE " + this._table() + " SET ";
                for (let key in table) {
                    updates.push(key + "=:" + key + " ");
                    bind[key] = table[key];
                }
                sql += updates.join(",") + " ";
                if (custom) {
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
        sql += this._where(where);
        sql += this._order(order);
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
                let ids = rows?array_keys(rows):[];
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
            });
    }

    get_count(input) {
        let inp = Object.assign(input, {
            page: 1,
            limit: 1,
            return_raw: true,
            return_found: true,
        });
        this._lookup(inp, out).then(output => output.status ? r(true, output.found) : output);
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
            + (this._timestamp.created?",UNIX_TIMESTAMP(" + this._timestamp.created + ") AS " + this._timestamp.created:"") + " "
            + (this._timestamp.modified?",UNIX_TIMESTAMP(" + this._timestamp.modified + ") AS " + this._timestamp.modified:"") + " ";
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
        if (!input.fillin) {
            return;
        }
        if (!this._relationships) {
            return;
        }
        ids = rows.length ? array_keys(rows) : [];
        fillin = [];
        for (let type in this._relationships) {
            for (let name in this._relationships[type]) {
                if (!input.fillin.name) {
                    continue;
                }
                let inp = {
                    fillin: param_fo(input.fillin, name),
                    return_by_id: true,
                };
                if (is_array(opts)) {
                    inp = Object.assign(opts, inp);
                }
                let res;
                if (type == "has_many") {
                    inp[this._model + "_id"] = ids;
                    res = m(name + ".get_multi", inp, out);
                } else {
                    if (type == "has_one") {
                        inp[this._model + "_id"] = ids;
                    } else if (type == "belongs_to") {
                        inp["id"] = array_column(rows, name + "_id");
                    }
                    res = m(name + ".get", inp, out);
                }
                fillin[name] = {
                    type: type,
                    result: res,
                };
            }
        }
        if (!fillin) {
            return;
        }
        for (let index in rows) {
            for (let name in fillin) {
                if (!fillin[name].result) {
                    continue;
                }
                if (in_array(fillin[name].type, ["has_one", "has_many"])) {
                    rows[index][name] = param_fo(fillin[name].result, rows[index]["id"]);
                } else if (fillin[name].type == "belongs_to") {
                    rows[index][name] = param_fo(fillin[name].result, rows[index][name + "_id"]);
                }
            }
        }
        return;
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
                    return {insertId: results.insertId};
                }
                if (query_type == "DELETE") {
                    return {affectedRows: results.affectedRows};
                }
                return null;
            });
    }
}

module.exports = DataServe;
