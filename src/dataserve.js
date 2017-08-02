"use strict"

const Query = require("./query");
const util = require("util");
const {r} = require("./util");

class DataServe {

    constructor(model_class, config, db, cache){
        this._model_class = model_class;
        this._config = config;
        
        this._model = {};
        this._db = db;
        this._cache = cache;
        this._db_default = null;
        if (config.db._default_) {
            this._db_default = config.db._default_;
        }
    }

    db_table(db_table) {
        if (db_table.split(".").length == 1) {
            if (!this._db_default) {
                throw new Error("No DB specified & config missing default DB");
            }
            return this._db_default + "." + db_table;
        }
        return db_table;
    }
    
    get_model(db_table) {
        if (!this._model[db_table]) {
            this._model[db_table] = new this._model_class(this, this._config, this._db, this._cache, db_table);
            console.log("CREATED", db_table);
        }
        return this._model[db_table];
    }
    
    run(db_table_command, input){
        let [db_table, command] = db_table_command.split(":");
        db_table = this.db_table(db_table);
        
        let model = this.get_model(db_table);
        let query = new Query(input, command, model);
        
        //POPULATE HOOKS
        var hooks = {
            pre: [],
            post: [],
        };
        switch (command) {
        case "add":
        case "lookup":
        case "set":
            this["hooks_" + command](db_table, hooks);
            break;
        }
        //RUN COMMAND
        switch (command) {
        case "add":
        case "get":
        case "get_count":
        case "get_multi":
        case "lookup":
        case "remove":
        case "remove_multi":
        case "set":
            return model[command](query, hooks);
        case "output_cache":
            return model[command]();
        }
        throw new Error("invalid command: " + command);
    }

    hooks_add(db_table, hooks) {
        hooks.pre.push(query => {
            console.log("WHATS UP");
        });
    }
    
    hooks_lookup(db_table, hooks) {
        hooks.pre.push(query => {
            let model = this.get_model(db_table);
            let table_config = model.table_config();
            /*
            if (input['=']) {
                for (let field in input["="]) {
                    if (!model.get_field(field)) {
                        continue;
                    }
                    if (!is_array($val)) {
                        $val = [$val];
                    }
                    if ($this->_config_table['fields'][$field]['type'] == 'int') {
                        $this->_int_array($val);
                        $where[] = $this->alias . '.' . $field . ' IN (' . implode(',', $val) . ') ';
                    } else {
                        $val = array_unique($val);
                        $wh = []; $cnt = 1;
                        foreach ($val as $v) {
                            $wh[] = ':' . $field . $cnt;
                            $bind[$field . $cnt] = $v;
                            ++$cnt;
                        }
                        $where[] = $field . ' IN (' . implode(',', $wh) . ')';
                    }
                }
            }
            if (!empty($input['%search'])) {
                foreach ($input['search'] as $field => $val) {
                    $where[] = $this->alias . '.' . $field . ' LIKE :' . $field;
                    $bind[$field] = '%' . $val;
                }
            }
            if (!empty($input['search%'])) {
                foreach ($input['search'] as $field => $val) {
                    $where[] = $this->alias . '.' . $field . ' LIKE :' . $field;
                    $bind[$field] = $val . '%';
                }
            }
            if (!empty($input['%search%'])) {
                foreach ($input['search'] as $field => $val) {
                    $where[] = $this->alias . '.' . $field . ' LIKE :' . $field;
                    $bind[$field] = '%' . $val . '%';
                }
            }
            if (!empty($input['>'])) {
                foreach ($input['>'] as $field => $val) {
                    $where[] = ':' . $key . '_greater < ' . $this->alias . '.' . $key;
                    $bind[$field . '_greater'] = (integer)$val;
                }
            }
            if (!empty($input['>='])) {
                foreach ($input['>='] as $field => $val) {
                    $where[] = ':' . $field . '_greater_equal <= ' . $this->alias . '.' . $field;
                    $bind[$field . '_greater_equal'] = (integer)$val;
                }
            }
            if (!empty($input['<'])) {
                foreach ($input['<'] as $field => $val) {
                    $where[] = $this->alias . '.' . $field . ' < :' . $field . '_less';
                    $bind[$field . '_less'] = (integer)$val;
                }
            }
            if (!empty($input['<='])) {
                foreach ($input['<='] as $field => $val) {
                    $where[] = $this->alias . '.' . $field . '. <= :' . $field . '_less_equal';
                    $bind[$field . '_less_equal'] = (integer)$val;
                }
            }
            if (isset($input['modulo'])) {
                foreach ($input['modulo'] as $field => $modulo) {
                    $where[] = $this->alias . '.' . $field . ' % :' . $field . '_modulo_mod = :' . $field . '_modulo_val';
                    $bind[$field . '_modulo_mod'] = (integer)$modulo['mod'];
                    $bind[$field . '_modulo_val'] = (integer)$modulo['val'];
                }
            }
*/
        });
        hooks.post.push(result => {
            console.log("WHATS UP OUT");
            return result;
        });
    }

    hooks_set(db_table, hooks) {
        hooks.pre.push(query => {
            console.log("WHATS UP");
        });
    }
    
}

module.exports = DataServe;
