'use strict';

const { r } = require('./util');

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

    runPost(obj, result){
        let promises = [];
        
        for (let hook of this.post) {
            promises.push(hook(obj, result));
        }
        
        return Promise.all(promises)
            .then(results => {
                for (let result of results) {
                    if (result.isError()) {
                        return result;
                    }
                }
                
                return result;
            });
    }
}

module.exports = Hooks;
