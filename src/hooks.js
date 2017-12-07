"use strict"

const {r} = require("./util");

class Hooks {

    constructor(){
        this.pre = [];
        
        this.post = [];
    }
    
    addPre(func) {
        this.pre.push(func);
    }
    
    runPre(query){
        let promises = [];
        
        for (let hook of this.pre) {
            promises.push(hook(query));
        }
        
        return Promise.all(promises)
            .then(results => {
                return;
            });
    }

    addPost(func) {
        this.post.push(func);
    }

    runPost(result, meta){
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
