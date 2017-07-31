"use strict"

class CacheJS {

    constructor(config) {
        this._size_limit = config.size;
        this._cache = {};
    }
    
    get(field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        let output = {};
        for (let key of keys) {
            let field_key = field + ":" + key;
            if (typeof this._cache[field_key] !== "undefined") {
                output[key] = this._cache[field_key];
            }
        }
        return Promise.resolve(output);
    }

    set(field, vals) {
        let new_cnt = Object.keys(vals).length;
        let current_size = Object.keys(this._cache).length;
        if (current_size) {
            let new_size = current_size + new_cnt;
            if (this._size_limit < new_size) {
                let reduce_by = new_size - this._size_limit;
                if (this._size_limit <= reduce_by) {
                    this._cache[key] = {};
                } else {
                    let keys = Object.keys(this._cache).slice(0, reduce_by);
                    this.del(field, keys);
                }
            }
        }
        for (let key in vals) {
            let field_key = field + ":" + key;
            this._cache[field_key] = vals[key];
            ++current_size;
            if (this._size_limit < current_size) {
                break;
            }
        }
        return Promise.resolve(vals);
    }

    del(field, keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        for (let key of keys) {
            let field_key = field + ":" + key;
            if (typeof this._cache[field_key] !== "undefined") {
                delete this._cache[field_key];
            }
        }
    }
    
}

module.exports = CacheJS;
