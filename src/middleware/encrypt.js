'use strict';

const Promise = require('bluebird');

const { camelize } = require('../util');

module.exports = model => next => obj => {
    let encrypt = new Encrypt(model);

    return encrypt.run(obj).then(() => next(obj));
}

const ALLOWED_RULES = {
    'bcrypt': [
        'String',
    ],
};

const PROMISE_RULES = [
    'bcrypt',
];

const REASON = {
    '_invalidRule': 'Invalid rule :rule for field :field',
    '_invalidType': 'Invalid value type :type for field :field',
};

class Encrypt {

    constructor(model) {
        this.model = model;

        this.bcrypt = require('bcrypt');
    }

    run({ command, query }) {
        let errors = {}, promises = [];
        
        for (let fieldIndex = 0; fieldIndex < query.getFieldsCnt(); ++fieldIndex) {
            for (let field in query.getFields(fieldIndex)) {
                let rules = this.model.getField(field).encrypt || this.model.getTableConfig('encrypt');

                if (typeof rules === 'object') {
                    rules = rules[command];
                }

                if (typeof rules !== 'string' || !rules.length) {
                    continue;
                }

                let promise = this.encrypt(query, fieldIndex, field, rules, errors);
                
                if (promise.length) {
                    promises = promises.concat(promise);
                }
            }
        }
        
        if (!promises.length) {
            promises = Promise.resolve();
        } else {
            promises = Promise.all(promises);
        }
        
        return promises.then(() => {
            if (Object.keys(errors).length) {
                return Promise.reject('Encrypt failed', errors);
            }
        });
    }

    encrypt(query, fieldIndex, field, rules, errors) {
        let promiseRun = [];
        
        rules = rules.split('|');
        
        for (let split of rules) {
            let [rule, extra] = split.split(':');

            rule = camelize(rule);
            
            if (!ALLOWED_RULES[rule]) {
                this.addError('_invalidRule', rule, field, val, null, errors);
                
                continue;
            }
            
            let type = this.model.getFieldValidateType(field);
           
            if (ALLOWED_RULES[rule].indexOf(type) === -1) {
                //this.addError('_invalidType', rule, field, val, null, errors);
                
                continue;
            }

            let val = query.getField(fieldIndex, field);
            
            if (!val.length) {
                continue;
            }
            
            let handler = 'encrypt' + rule.charAt(0).toUpperCase() + rule.slice(1);
            
            if (PROMISE_RULES.indexOf(rule) !== -1) {
                promiseRun.push([this[handler], [extra, query, fieldIndex, field, val, type, errors]]);
            } else {
                if (this[handler](extra, query, fieldIndex, field, val, type) === false) {
                    this.addError(rule, extra, field, val, type, errors);
                }
            }
        }

        //don't run promise validations if errors already found
        if (promiseRun.length && Object.keys(errors).length) {
            return [];
        }

        let promises = [];

        for (let run of promiseRun) {
            promises.push(run[0].bind(this)(...run[1]));
        }
        
        return promises;
    }

    addError(rule, extra, field, val, type, errors){
        let reason = REASON[rule];

        reason = reason.replace(':field', field)
            .replace(':extra', extra);

        if (rule.substr(0, 1) === '_') {
            rule = extra;
        }
        
        errors[field] = {
            rule: rule,
            reason: reason,
        };
    }

    encryptBcrypt(extra, query, fieldIndex, field, val, type) {
        extra = parseInt(extra, 10);
        
        if (!extra) {
            extra = 10;
        }

        return new Promise((resolve, reject) => {
            this.bcrypt.hash(query.getField(fieldIndex, field), extra, function(err, hash) {
                if (err) {
                    reject(err);

                    return;
                }

                query.setField(fieldIndex, field, hash);

                resolve();
            });
        });
    }
    
}
