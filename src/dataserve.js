'use strict'

var _array = require('lodash/array');

function int_array(arr) {
    if (!arr || !Array.isArray(arr)) {
        return [];
    }
    arr = arr.map(function(val) {
        return parseInt(val, 10);
    });
    return _array.uniq(arr);
}

function r(success, output, result=null, extra={}){
    if (success) {
        let out = Object.assign(extra, {
            'status': true,
        });
        for (let key in out) {
            output[key] = out[key];
        }
        return result;
    }
    let out = Object.assign(extra, {
        'status': false,
        'error': result.error || result,
    });
    for (let key in out) {
        output[key] = out[key];
    }
    return null;
}

class DataServe {

    constructor(table){
        this._primary = 'id';

        this._table_name = table;
        this._model = null;
        this._type = null;
        this._media = null;

        this._fields = [];
        this._fillin = [];
        this._get = [];
        this._get_multi = [];

        this._timestamp = {
            created: 'ctime',
            modified: 'mtime',
        };
        this._set_insert = false;

        this._add_get({[this._primary]: 'int'});
        if (!this._model) {
            this._model = this._table_name;
        }
    }

    _add_get(obj){
        for (let key in obj) {
            this._get[key] = obj[key];
        }
    }
    
    get(input, output){
        console.log('INPUT:', input);
        var field = null;
        for (let key in this._get) {
            if (input[key]) {
                field = key;
                break;
            }
        }
        if (!field) {
            return r(false, output, 'missing param');
        }

        var single_row_result = false;
        var rows = {}, where = [], bind = {};

        if (this._get[field] == 'int') {
            if (Array.isArray(input[field])) {
                console.log('from:', input[field]);
                input[field] = int_array(input[field]);
                console.log('to:', input[field]);
                where.push(field + ' IN (' + input[field].join(',') + ')');
            } else {
                single_row_result = true;
                where.push(field + '=:' + field);
                bind[field] = parseInt(input[field], 10);
            }
        } else if (this._get[field] == 'string') {
            if (is_array(input[field])) {
                input[field] = [...new Set(input[field])];
                let wh = [];
                let cnt = 1;
                for (let index in input[field]) {
                    wh.push(field + '=:' + field+cnt);
                    bind[field+cnt] = input[field][index];
                    ++cnt;
                }
                where.push('(' + wh.join(" OR ") + ')');
            } else {
                single_row_result = true;
                where.push(field + '=:' + field);
                bind[field] = input[field];
            }
        }

        let sql = this._select();
        sql += this._from();
        sql += this._where(where);
        //this._master();

        console.log(sql);
        console.log(bind);

        rows = this._query(sql, bind, this._primary);
        this._fillin(input, rows);

        if (single_row_result) {
            return r(true, output, array_shift(rows));
        }
        if (input.return_by_id) {
            return r(true, output, rows);
        }
        let result = [];
        for (let id in input[this._primary]) {
            if (rows[id]) {
                result.push(rows[id]);
            }
        }

        return r(true, output, []);
    }

    set(input, output) {
        if (!input[this._primary]) {
            return r(false, output, "missing primary key");
        }

        let exist = this._get({[this._primary]: input[this._primary]});
        if (!exist && !this._set_insert) {
            return r(false, output, "Not Found");
        }

        if (table) {
            if (this._set_insert) {
                table[this._primary] = input[this._primary];
                let cols = [], vals = [], updates = [], bind = {};
                for (let key in table) {
                    cols.push(key);
                    vals.push(':' + key);
                    if (key != this._primary) {
                        updates.push(key + '=:' + key + ' ');
                    }
                    bind[key] = table[key];
                }
                let sql = 'INSERT INTO ' + this._table() + ' (' + cols.join(",") + ') VALUES (' + vals.join(",") + ') ON DUPLICATE KEY UPDATE ' + updates.join(",") + ' ';
                //this._query(sql, bind);
            } else {
                let updates = [], bind = {};
                let sql = 'UPDATE ' + this._table() + ' SET ';
                for (let key in table) {
                    updates.push(key + '=:' + key + ' ');
                    bind[key] = table[key];
                }
                sql += updates.join(",") + ' ';
                if (custom) {
                    if (updates) {
                        sql += ',';
                    }
                    sql += custom.join(",") + ' ';
                }
                sql += 'WHERE ' + this._primary + '=:' + this._primary;
                bind[this._primary] = parseInt(input[this._primary], 10);
                //this._query(sql, bind);
            }
        }
        return r(true, output);
    }

    add(input, output){
        let cols = [], vals = [], bind = [];
        foreach (table as key => val) {
            cols.push(key);
            vals.push(':' + key);
            bind[key] = val;
        }
        let sql = 'INSERT INTO ' + this._table() + ' (' + cols.join(",") + ') VALUES (' + vals.join(",") + ')';
        try {
            res = this._query(sql, bind);
        } catch (Exception e) {
            if (strpos(e.getMessage(), 'Duplicate entry') !== false) {
                return r(false, output, ['email' => 'Already in use']);
            }
            throw e;
        }
        let exist = this._get([this._primary => res.insert_id]);
        return r(true, output, exist);
    }

    remove(input, output){
        if (!input[this._primary]) {
            return r(false, output, "primary key value required");
        }

        sql = 'DELETE ';
        sql += this._from();
        sql += 'WHERE '.this._primary.'=:'.this._primary;
        this._query(sql, {[this._primary]: parseInt(this._primary, 10)});

        return r(true, output);
    }

    lookup(input, output) {
        this._fillin_limit(input);

        let cnt = '';
        if (input.return_found) {
            cnt = 'SQL_CALC_FOUND_ROWS';
        }
        let sql = 'SELECT ' + cnt + ' ' + prefix + '.' + this._primary + ' ';
        sql += this._from(prefix);
        if (input.join) {
            for (let table in input.join) {
                sql += 'INNER JOIN ' + table + ' ON (' + input.join[table] + ') ';
            }
        }
        if (input.left_join) {
            for (let table in input.left_join) {
                sql += 'LEFT JOIN ' + table + ' ON (' + input.left_table[table] + ') ';
            }
        }
        sql += this._where(where);
        sql += this._order(order);
        sql += this._limit(input);
        let rows = this._query(sql, bind, this._primary);
        
        if (input.return_found) {
            let sql = 'SELECT FOUND_ROWS() as fnd';
            var found = this._query(sql, [], true);
            found = found['fnd'];
        } else {
            found = 0;
        }
        
        let ids = rows?array_keys(rows):[];
        if (ids) {
            let in = {
                [this._primary]: ids,
                fillin: params::fa(input, 'fillin')
            };
            rows = this._get(in);
        }
        let extra = {
            pages: ceil(found/input.limit),
            found: found,
        };
        if (input.return_by_id) {
            return r(true, output, rows, extra);
        }
        return r(true, output, array_values(rows), extra);
    }

    get_count(input, output) {
        let in = Object.assign(input, {
            page: 1,
            limit: 1,
            return_raw: true,
            return_found: true,
        });
        res = this._lookup(in, out);
        if (!out.status) {
            return r(false, output, out.error);
        }
        return r(true, output, out.found);
    }
    
    
    _table(){
        return this._table_name;
    }
    
    
    _select(raw=''){
        if (raw) {
            return 'SELECT ' + raw + ' ';
        }
        return 'SELECT '
            + this._fields.join(",")
            + (this._timestamp.created?',UNIX_TIMESTAMP(' + this._timestamp.created + ') AS ' + this._timestamp.created:'') + ' ';
    }

    _from(alias='') {
        return 'FROM ' + this._table() + ' ' + (alias?alias + ' ':'');
    }

    _where(where){
        if (!where) {
            return '';
        }
        if (Array.isArray(where)) {
            where = where.join(" AND ") + ' ';
        } else {
            where += ' ';
        }
        return 'WHERE ' + where;
    }

    _group(group){
        if (!group) {
            return '';
        }
        if (Array.isArray(group)) {
            group = group.join(",") + ' ';
        } else {
            group += ' ';
        }
        return 'GROUP BY ' + group;
    }

    _order(order){
        if (!order) {
            return '';
        }
        let out = 'ORDER BY ';
        if (!Array.isArray(order)) {
            out += order;
        } else {
            out += order.join(",");
        }
        return out + ' ';
    }

    _limit(input){
        if (!input.page || !input.limit) {
            return '';
        }
        let page = parseInt(input.page, 10) - 1;
        let offset = page * parseInt(input.limit, 10);
        return 'LIMIT ' + offset + ',' + page;
    }

    /*
    _fillin(input, rows) {
        if (!input.fillin) {
            return;
        }
        if (!this._fillin) {
            return;
        }
        ids = rows.length?array_keys(rows):[];
        fillin = [];
        foreach (this._fillin as type => names) {
            foreach (names as name => opts) {
                if (!input.fillin.name) {
                    continue;
                }
                in = {
                fillin: params::fa(input['fillin'], name),
                       return_by_id: true,
                       };
                if (is_array(opts)) {
                    in += opts;
                }
                if (type == 'has_many') {
                    in[this._model.'_id'] = ids;
                    res = m(name.'.get_multi', in, out);
                } else {
                    if (type == 'has_one') {
                        in[this._model.'_id'] = ids;
                    } else if (type == 'belongs_to') {
                        in['id'] = array_column(rows, name.'_id');
                    }
                    res = m(name.'.get', in, out);
                }
                fillin[name] = ['type' => type,
                                  'result' => res];
            }
        }
        if (empty(fillin)) {
            return;
        }
        foreach (rows as index => &r) {
            foreach (fillin as name => arr) {
                if (!arr['result']) {
                    continue;
                }
                if (in_array(arr['type'], ['has_one', 'has_many'])) {
                    r[name] = params::fa(arr['result'], r['id']);
                } else if (arr['type'] == 'belongs_to') {
                    r[name] = params::fa(arr['result'], r[name.'_id']);
                }
            }
        }
        return;
    }
    */

    _query(sql, bind={}, ret_type=null, force_master=false, db_override='') {
        if (this._master) {
            force_master = true;
            this._master = false;
        }
        //return Database::q(sql, bind, ret_type, force_master, !empty(db_override)?db_override:this._db);
        return [];
    }
    
}

module.exports = DataServe;
