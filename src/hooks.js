"use strict"

const {r} = require("./util");

class Hooks {

    constructor(){
        this.pre = [];
        this.post = [];
    }
    
    add_pre(func) {
        this.pre.push(func);
    }
    
    run_pre(query){
        let promises = [];
        for (let hook of this.pre) {
            promises.push(hook(query));
        }
        return Promise.all(promises)
            .then(results => {
                return;
            });
    }

    add_post(func) {
        this.post.push(func);
    }

    run_post(result, meta){
        let promises = [];
        for (let hook of this.post) {
            promises.push(hook(result));
        }
        return Promise.all(promises)
            .then(output => {
                for (let out of output) {
                    if (out && typeof out.status !== "undefined" && !out.status) {
                        return out;
                    }
                }
                return result;
            });
    }
}

module.exports = Hooks;
