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
        let out = Object.assign({
            'status': true,
        },  extra);
        for (let key in out) {
            output[key] = out[key];
        }
        return result;
    }
    let out = Object.assign({
        'status': false,
        'error': result.error || result,
    }, extra);
    for (let key in out) {
        output[key] = out[key];
    }
    return null;
}

class DataServe {

    constructor(table){
        this._primary = 'id';

        this._table = table;
        this._model = null;
        this._type = null;
        this._media = null;

        this._fields = [];
        this._fillin = [];
        this._get = [];
        this._get_multi = [];

        this._timestamp = {'created': 'ctime'};
        this._set_insert = false;

        this._add_get({[this._primary]: 'int'});
        if (!this._model) {
            this._model = this._table;
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
                where.push(field+' IN ('+input[field].join(',')+')');
            } else {
                single_row_result = true;
                where.push(field+'=:'+field);
                bind[field] = parseInt(input[field], 10);
            }
        } else if (this._get[field] == 'string') {
            if (is_array(input[field])) {
                input[field] = [...new Set(input[field])];
                let wh = [];
                let cnt = 1;
                for (let index in input[field]) {
                    wh.push(field+'=:'+field+cnt);
                    bind[field+cnt] = input[field][index];
                    ++cnt;
                }
                where.push('('+wh.join(" OR ")+')');
            } else {
                single_row_result = true;
                where.push(field+'=:'+field);
                bind[field] = input[field];
            }
        }
        console.log(where);
        console.log(bind);

        return r(true, output, []);
    }
}

module.exports = DataServe;
