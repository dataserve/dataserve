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
            if (typeof this._cache[field] !== "undefined" && typeof this._cache[field][key] !== "undefined") {
                output[key] = this._cache[field][key];
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
                    for (let i = 0; i < reduce_by; ++i) {
                        for (let key in this._cache) {
                            delete this._cache[key];
                            break;
                        }
                    }
                }
            }
        }
        if (typeof this._cache[field] == "undefined") {
            this._cache[field] = {};
        }
        for (let key in vals) {
            this._cache[field][key] = vals[key];
            ++current_size;
            if (this._size_limit < current_size) {
                break;
            }
        }
    }
    
}

module.exports = CacheJS;
