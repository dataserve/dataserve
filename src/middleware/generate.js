'use strict';

const Promise = require('bluebird');

const { camelize, randomString } = require('../util');

module.exports = model => next => obj => {
    if (ALLOWED_COMMANDS.indexOf(obj.command) === -1) {
        return next(obj);
    }

    let generate = new Generate(model);

    return model.log.add(`generate,generate:${obj.command}`, () => generate.run(obj))
        .then(() => next(obj));
}

const ALLOWED_COMMANDS = [
    'add',
    'set',
];

const ALLOWED_RULES = {
    'slug': [
        'String',
    ],
    'slugUnique': [
        'String',
    ],
    'slugUniqueCensor': [
        'String',
    ],
    'uuid': [
        'String',
    ],
    'uuid64': [
        'String',
    ],
};

const PROMISE_RULES = [
    'slugUnique',
    'slugUniqueCensor',
];

const REASON = {
    '_invalidRule': 'Invalid rule :extra for field :field',
    '_invalidType': 'Invalid value type :type for field :field',
    'censorFail': 'Could not create slug for field :field',
    'missingField': 'Target field :extra is not populated for field :field',
    'slugUnique': 'Unable to generate unique value for :field',
    'slugUniqueCensor': 'Unable to generate unique value for :field',
};

const CENSOR = [
    'arab',
    'ass',
    'b(e|3)an(e|3)r',
    'b(i|1)tch',
    'b(l|1)(o|0)w',
    'b(o|0)n(e|3)r',
    'bu(t|7)(t|7)',
    '(c|k)h(i|1)nk',
    '(c|k)h(o|0)ad',
    '(c|k)l(i|1)t',
    '(c|k)(o|0)ck',
    '(c|k)(o|0)(o|0)n',
    '(c|k)(o|0)(o|0)t(e|3)r',
    '(c|k)(o|0)(o|0)ch',
    '(c|k)um',
    '(c|k)un(t|7)',
    'd(i|1)c(c|k)',
    'd(o|0)ng',
    'd(o|0)k(i|1)',
    'd(o|0)uch',
    'dyk(e|3)',
    'fag',
    'fany',
    'fanny',
    'f(e|3)lch',
    'fuck',
    'gay',
    'g(o|0)(o|0)c',
    'g(o|0)(o|0)k',
    'handj(o|0)',
    'h(o|0)m(o|0)',
    'h(o|0)le',
    'l(i|1)ck',
    'jack',
    'j(e|3)rk',
    'j(i|1)z',
    'l(e|3)sb(o|0)',
    'l(e|3)zz',
    'm(i|1)ng(e|3)',
    'muff',
    'n(i|1)g',
    'nut',
    'pak(i|1)',
    'pen(i|1)',
    'p(i|1)ss',
    'p(o|0)(o|0)(p|n)',
    'pr(i|1)ck',
    'puss',
    's(e|3)x',
    'shag',
    'sh(i|1)(t|7)',
    'slu(t|7)',
    'snatch',
    't(i|1)t',
    'twat',
    'va(g|j)',
    'wan(c|k)',
    'wh(o|0)r(e|3)',
];

class Generate {

    constructor(model) {
        this.model = model;

        this.uuid = require('uuid/v4');
    }

    run({ command, query }) {
        let errors = {}, promises = [];

        Object.keys(this.model.getFields()).forEach((field) => {
            let rules = this.model.getField(field).generate || this.model.getTableConfig('generate');

            if (typeof rules === 'object') {
                rules = rules[command];
            }

            if (typeof rules !== 'string' || !rules.length) {
                return;
            }

            for (let fieldIndex = 0, n = query.getFieldsCnt(); fieldIndex < n; ++fieldIndex) {
                let promise = this.generate(query, fieldIndex, field, rules, errors);
                
                if (promise.length) {
                    promises = promises.concat(promise);
                }
            }
        });
        
        if (!promises.length) {
            promises = Promise.resolve();
        } else {
            promises = Promise.all(promises);
        }
        
        return promises.then(() => {
            if (Object.keys(errors).length) {
                return Promise.reject([ 'generate', { generate: errors } ]);
            }
        });
    }

    generate(query, fieldIndex, field, rules, errors) {
        let promiseRun = [];
        
        rules = rules.split('|');

        rules.forEach((split) => {
            let [rule, extra] = split.split(':');

            rule = camelize(rule);
            
            if (!ALLOWED_RULES[rule]) {
                this.addError('_invalidRule', rule, field, null, errors);
                
                return;
            }
            
            let type = this.model.getFieldValidateType(field);
           
            if (ALLOWED_RULES[rule].indexOf(type) === -1) {
                //this.addError('_invalidType', rule, field, null, errors);
                
                return;
            }
            
            let handler = 'generate' + rule.charAt(0).toUpperCase() + rule.slice(1);

            if (PROMISE_RULES.indexOf(rule) !== -1) {
                promiseRun.push([this[handler], [extra, query, fieldIndex, field, type, errors]]);
            } else {
                if (this[handler](extra, query, fieldIndex, field, type, errors) === false) {
                    this.addError(rule, extra, field, type, errors);
                }
            }
        });

        //don't run promise validations if errors already found
        if (promiseRun.length && Object.keys(errors).length) {
            return [];
        }

        let promises = [];

        promiseRun.forEach((run) => {
            promises.push(run[0].bind(this)(...run[1]));
        });
        
        return promises;
    }

    addError(rule, extra, field, type, errors){
        let reason = REASON[rule];

        reason = reason.replace(':field', field)
            .replace(':extra', extra)
            .replace(':type', type)
            .replace(':rule', rule);

        if (rule.substr(0, 1) === '_') {
            rule = extra;
        }
        
        errors[field] = {
            rule: rule,
            reason: reason,
        };
    }

    buildSlug(extra, query, fieldIndex, field, type, errors, cnt, censor=false) {
        let [ slugType, slugOpt, ...slugOptExtra ] = extra.split(',');

        let skipWhenPopulated = slugOptExtra.indexOf('skipWhenPopulated') !== -1;

        if (skipWhenPopulated && query.getField(fieldIndex, field) !== undefined) {
            return null;
        }

        if (slugType === 'alpha' || slugType === 'alphaNum') {
            let gen = slugType === 'alpha' ? 'A' : 'A#';

            let slug;
            
            if (censor) {
                let valid = false;
                
                for (let i = 0; i < 5000; ++i) {
                    slug = randomString(slugOpt, gen);

                    let reg = new RegExp(CENSOR.join('|'), 'gi');

                    if (slug.match(reg)) {
                        continue;
                    }

                    valid = true;

                    break;
                }

                if (!valid) {
                    this.addError('censorFail', extra, field, type, errors);
                    
                    return null;
                }
            } else {
                slug = randomString(slugOpt, gen);
            }
            
            return slug;
        }

        if (slugType === 'field') {
            let otherField = slugOpt || field;

            let requireExist = slugOptExtra.indexOf('requireExist') !== -1;

            if (requireExist && typeof query.getField(fieldIndex, otherField) === 'undefined') {
                return null;
            }
            
            if (!query.getField(fieldIndex, otherField)) {
                this.addError('missingField', extra, field, type, errors);
                
                return null;
            }

            let val = query.getField(fieldIndex, otherField);

            if (cnt && 1 < cnt) {
                val += ' ' + (cnt - 1);
            }
        
            let slug = val
                .toString()
                .toLowerCase()
                .replace(/\s+/g, '-') // Replace spaces with -
                .replace(/[^\w\-]+/g, '') // Remove all non-word chars
                .replace(/\-\-+/g, '-') // Replace multiple - with single -
                .replace(/^-+/, '') // Trim - from start of text
                .replace(/-+$/, ''); // Trim - from end of text

            return slug;
        }
    }
    
    generateSlug(extra, query, fieldIndex, field, type, errors) {
        let slug = this.buildSlug(extra, query, fieldIndex, field, type, errors);

        if (typeof slug !== 'undefined' && typeof slug !== null) {
            query.setField(fieldIndex, field, slug);
        }
    }

    generateSlugUnique(extra, query, fieldIndex, field, type, errors, cnt=0) {
        let val = this.buildSlug(extra, query, fieldIndex, field, type, errors, cnt);

        if (val === null) {
            return;
        }
        
        let input = {
            '=': {
                [field]: val,
            },
            outputStyle: 'LOOKUP_RAW',
            page: 1,
            limit: 1
        };

        return this.model.run({ command: 'lookup', input }).then(res => {
            if (res.data.length) {
                if (100 <= cnt) {
                    this.addError('slugUnique', extra, field, type, errors);
                    
                    return;
                }
                
                return this.generateSlugUnique(extra, query, fieldIndex, field, type, errors, cnt + 1);
            }
            
            query.setField(fieldIndex, field, val);
        });
    }

    generateSlugUniqueCensor(extra, query, fieldIndex, field, type, errors, cnt=0) {
        let val = this.buildSlug(extra, query, fieldIndex, field, type, errors, cnt, true);

        if (val === null) {
            return;
        }
        
        let input = {
            '=': {
                [field]: val,
            },
            outputStyle: 'LOOKUP_RAW',
            page: 1,
            limit: 1
        };

        return this.model.run({ command: 'lookup', input }).then(res => {
            if (res.data.length) {
                if (100 <= cnt) {
                    this.addError('slugUniqueCensor', extra, field, type, errors);
                    
                    return;
                }
                
                return this.generateSlugUniqueCensor(extra, query, fieldIndex, field, type, errors, cnt + 1);
            }
            
            query.setField(fieldIndex, field, val);
        });
    }
    
    generateUuid(extra, query, fieldIndex, field, type, errors) {
        query.setField(fieldIndex, field, this.uuid());
    }

    generateUuid64(extra, query, fieldIndex, field, type, errors) {
        let uuid = Buffer.from(this.uuid().replace(/-/g, ''), 'hex').toString('base64');

        if (extra.length) {
            uuid = uuid.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        }
        
        query.setField(fieldIndex, field, uuid);
    }
    
}
