"use strict";

const Promise = require("bluebird");

class Lookup {

    constructor(model) {
        this.model = model;
    }

    populate(addPre, addPost) {
        addPre(({ command, query }) => {
            if (command !== 'lookup') {
                return Promise.resolve();
            }
            
            return new Promise((resolve, reject) => {
                let tableConfig = this.model.getTableConfig();

                let where = [], bind = {}, input = null;

                if (input = query.raw('=')) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }

                        let vals = input[field];

                        if (!Array.isArray(vals)) {
                            vals = [vals];
                        }

                        if (this.model.getField(field).type == 'int') {
                            vals = intArray(vals);

                            where.push(query.alias + '.' + field + ' IN (' + vals.join(',') + ') ');
                        } else {
                            vals = [...new Set(vals)];

                            let wh = [], cnt = 1;

                            for (let val of vals) {
                                wh.push(':' + field + cnt);

                                bind[field + cnt] = val;

                                ++cnt;
                            }

                            where.push(field + ' IN (' + wh.join(',') + ')');
                        }
                    }
                }

                if (input = query.raw('%search')) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }

                        where.push(query.alias + '.' + field + ' LIKE :' + field);

                        bind[field] = '%' + input[field];
                    }
                }

                if (input = query.raw('search%')) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }

                        where.push(query.alias + '.' + field + ' LIKE :' + field);

                        bind[field] = input[field] + '%';
                    }
                }

                if (input = query.raw('%search%')) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }

                        where.push(query.alias + '.' + field + ' LIKE :' + field);

                        bind[field] = '%' + input[field] + '%';
                    }
                }

                if (input = query.raw('>')) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }

                        where.push(':' + field + '_greater < ' + query.alias + '.' + field);

                        bind[field + '_greater'] = parseInt(input[field], 10);
                    }
                }

                if (input = query.raw('>=')) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }

                        where.push(':' + field + '_greater_equal <= ' + query.alias + '.' + field);

                        bind[field + '_greater_equal'] = parseInt(input[field], 10);
                    }
                }

                if (input = query.raw('<')) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }

                        where.push(query.alias + '.' + field + ' < :' + field + '_less');

                        bind[field + '_less'] = parseInt(input[field], 10);
                    }
                }

                if (input = query.raw('<=')) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }

                        where.push(query.alias + '.' + field + '. <= :' + field + '_less_equal');

                        bind[field + '_less_equal'] = parseInt(input[field], 10);
                    }
                }

                if (input = query.raw('modulo')) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }

                        where.push(query.alias + '.' + field + ' % :' + field + '_modulo_mod = :' + field + '_modulo_val');

                        bind[field + '_modulo_mod'] = parseInt(input[field]['mod'], 10);

                        bind[field + '_modulo_val'] = parseInt(input[field]['val'], 10);
                    }
                }

                query.addWhere(where, bind);

                resolve();
            });
        });
    }

}

module.exports = Lookup;
