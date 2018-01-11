'use strict';

const microtime = require('microtime');

class Log {

    constructor(opt) {
        this.opt = opt || {};
        
        this.log = {};
    }

    add(types, func) {
        if (this.opt.disabled) {
            return func();
        }
        
        types = types.split(',');
        
        let timeStart = microtime.now();
        
        return func().then((res) => {
            let timeRun = (microtime.now() - timeStart) / 1000000;
            
            for (let type of types) {
                if (typeof this.log[type] === 'undefined') {
                    this.log[type] = {
                        entries: [],
                    };
                }

                if (!this.opt.maxEntries || this.log[type].entries.length < this.opt.maxEntries) {
                    this.log[type].entries.push(timeRun);
                }
            };

            return res;
        });
    }

    get(types) {
        types = types.split(',');
        
        if (types.indexOf('*') !== -1) {
            return this.getAll();
        }
        
        let res = {};
        
        for (let type of types) {
            if (!this.log[type]) {
                continue;
            }

            this.log[type].max = Math.max(...this.log[type].entries);

            this.log[type].min = Math.min(...this.log[type].entries);
            
            this.log[type].sum = this.log[type].entries.reduce((sum, val) => {
                return sum + val;
            }, 0);
            
            this.log[type].cnt = this.log[type].entries.length;
            
            if (!this.log[type].cnt) {
                this.log[type].avg = 0;
            } else {
                this.log[type].avg = this.log[type].sum / this.log[type].cnt;
            }
            
            res[type] = this.log[type];
        }
        
        return res;
    }
    
    getAll() {
        return this.get(Object.keys(this.log).sort().join(','));
    }
    
}

module.exports = Log;
