"use strict"

class Config {
    constructor(path) {
        this.config = require(path);

        if (this.config.db) {
            this.db = this.config.db;
        }
        if (process.env.DB_DEFAULT) {
            this.db["_default_"] = process.env.DB_DEFAULT;
        }
        let db_list = [];
        if (process.env.DB_LIST) {
            db_list = process.env.DB_LIST.split(",");
        }
        if (db_list.length) {
            for (let db of db_list) {
                if (!process.env["DB_" + db]) {
                    continue;
                }
                let db_param = process.env["DB_" + db].split(",");
                //type
                if (db_param[0].length) {
                    this.db[db].db.type = db_param[0];
                }
                //hostname
                if (db_param[1].length) {
                    this.db[db].db.hostname = db_param[1];
                }
                //user
                if (db_param[2].length) {
                    this.db[db].db.user = db_param[2];
                }
                //password
                if (db_param[3].length) {
                    this.db[db].db.password = db_param[3];
                }
            }
        }
    }
}

module.exports = Config;
