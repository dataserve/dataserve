Dataserve is a fast and consistent interface to your data layer. It can be run as a server (via the Redis protocol), interacting with multiple services, or included in a standard NodeJS project. If you decide to change your frontend to a different language, Dataserve can still be used so you do not need to write your model logic all over in a new language. If you decide to spawn off different servers to handle different types of requests (web/api/admin/etc), Dataserve can be run independently, serving your applications data consistently across all frontends.

With caching built in, you can quickly setup apps for whatever the use case. Currently supports MySql with Redis, Memcache, or in-memory caching out of the box.

# Commands

## Add

Internal: `(dbName.)tableName:add <add object>`

Redis: `DS_ADD (dbName.)tableName {jsonified <add object>}`

Insert a row into a specified DB table.

## Get

Internal: `(dbName.)tableName:get <get input>`

Redis: `DS_GET (dbName.)tableName {jsonified <get input>)`

Get row(s) from a specified DB table queried off the primary key of the DB table. **Results from this command are always cached when caching is enabled**

Returns: <get output>

## Get Count

Internal: `(dbName.)tableName:getCount <lookup object>`

Redis: DS_GET_COUNT (dbName.)tableName {jsonified <lookup object>}`

Get the count of rows which match the specified input parameters.

Returns: 

## Get Multi

Internal: `(dbName.)tableName:getMulti <getMulti object>`

Redis: DS_GET_MULTI (dbName.)tableName {jsonified <getMulti object>}`

Return arrays of rows which are pivoted off of the unique key values passed in.

## Lookup

Internal: `(dbName.)tableName:lookup <lookup object>`

Redis: DS_LOOKUP (dbName.)tableName {jsonified <lookup object>}`

Return rows based upon the specified input parameters.

## Remove

Internal: `(dbName.)tableName:remove <remove input>`

Redis, DS_REMOVE (dbName.)tableName {jsonified <remove input>}`

Remove row(s) from a DB table queried off the primary key of the DB table.

## Set

Internal: `(dbName.)tableName:set <set object>`

Redis: DS_SET (dbName.)tableName {jsonified <set object>}`

Set row(s) on a DB table queried off the primary key of the DB table.

## **Commands Input**

### `<add object>`

```javascript
{
  "<fillableField1>": <field1Val>,
  "<fillableField2>": <field2Val>,
  ...
}
```

### `<get input>`

[<primary key value array>], ex: [1, 22, 57]
<primary key value integer>, ex: 1

### `<getMulti object>`

### `<lookup object>`

All are optional, and `<lookup object>` can be extended via the [module.js](https://github.com/dataserve/dataserve/blob/master/src/module.js) class.

```javascript
{
  "=": {
    "<field1>": <field1Val|[field1Vals]>,
    "<field2>": <field2Val|[field2Vals]>,
    ...
  },
  "%search": {
    "<field1>": <field1Val|[field1Vals]>,
    "<field2>": <field2Val|[field2Vals]>,
    ...
  },
  "search%": {
    "<field1>": <field1Val|[field1Vals]>,
    "<field2>": <field2Val|[field2Vals]>,
    ...
  },
  "%search%": {
    "<field1>": <field1Val|[field1Vals]>,
    "<field2>": <field2Val|[field2Vals]>,
    ...
  },
  ">": {
    "<field1>": <field1Val|[field1Vals]>,
    "<field2>": <field2Val|[field2Vals]>,
    ...
  },
  "<": {
    "<field1>": <field1Val|[field1Vals]>,
    "<field2>": <field2Val|[field2Vals]>,
    ...
  },
  ">=": {
    "<field1>": <field1Val|[field1Vals]>,
    "<field2>": <field2Val|[field2Vals]>,
    ...
  },
  "<=": {
    "<field1>": <field1Val|[field1Vals]>,
    "<field2>": <field2Val|[field2Vals]>,
    ...
  },
  "modulo": {
    "<field1>": {
      "mod": <field1Val % [mod] = [val]>,
      "val": <field1Val % [mod] = [val]>
    },
    "<field2>": {
      "mod": <field2Val % [mod] = [val]>,
      "val": <field2Val % [mod] = [val]>
    },
    ...
  }
}
```

### `<remove input>`

[<primary key value array>], ex: [1, 22, 57]
<primary key value integer>, ex: 1

### `<set object>`

```javascript
{
  "<primaryKey>": <primaryKeyVal>,
  "<fillableField1>": <field1Val>,
  "<fillableField2>": <field2Val>,
  ...
}
```

# Running Dataserve

## Environment Variables
Several environment variables need to be specified in order for dataserve to know which DBs you intend to communicate with. If you are running dataserve via [src/server.js](https://github.com/dataserve/dataserve/blob/master/src/server.js), I recommend you pass in a .env file via `node src/server.js --env <path to .env file>`. View the example [.env file](https://github.com/dataserve/dataserve/blob/master/.env) for reference

## Configuration JSON Files

### Define data tables directly
View the example [config/example.json](https://github.com/dataserve/dataserve/blob/master/config/example.json) file for reference.

### Define data tables using pre-defined modules
View the example [config/exampleBlogModules.json](https://github.com/dataserve/dataserve/blob/master/config/exampleBlogModules.json) which generates the entire model layer for a blog using common modules. The [`mobuleBlog`](https://github.com/dataserve/dataserve/blob/master/config/moduleBlog.json) module extends and requires: [`moduleComment`](https://github.com/dataserve/dataserve/blob/master/config/moduleComment.json), [`moduleCategory`](https://github.com/dataserve/dataserve/blob/master/config/moduleCategory.json), [`moduleMedia`](https://github.com/dataserve/dataserve/blob/master/config/moduleMedia.json), and [`moduleUser`](https://github.com/dataserve/dataserve/blob/master/config/moduleUser.json). Some are used more than once for different reasons. For example the [`moduleMedia`](https://github.com/dataserve/dataserve/blob/master/config/moduleMedia.json) module is built into three separate tables which are used for different cases: media inside blog posts, media inside comments to the blog, and user profile images for blog post authors and blog post commenters.

## Configuration JSON Syntax
There are two types of configuration styles. One defines all your tables directly, the other uses modules to extend common functionality via "sub-systems". If you are running dataserve via [src/server.js](https://github.com/dataserve/dataserve/blob/master/src/server.js), I recommend you pass in the config file via `node src/server.js --config <path to config json file>`

#### Top Level
```javascript
{
  dbDefault: <string>,
  dbs: <dbs object>
}
```
#### `<dbs object>`
```javascript
{
  "dbName1": <db object>,
  "dbName2": <db object>,
  ...
}
```

#### `<db object>`
```javascript
{
  "cache": <cache object>,
  "extends": <extends object>,
  "requires": <requires object>,
  "tables": <tables object>
}
```

#### `<cache object>`
```javascript
{
  "type": <"redis"|"memcache"|"js">
}
```

#### `<extends object>`
```javascript
{
  "<parentModuleName>:<optionalPrependName|default:currentModuleName>": 
    "enableModules": [array of sub modules],
    "enableTables": [array of sub tables],
    "tables": <tables object>
}
```

#### `<requires object>`
```javascript
{
  "<moduleName>": {
    "enableModules": <array of sub modules>
    "enableTables": <array of sub tables>
  }
}
```

#### `<tables object>`
```javascript
{
  "<tableName1>": <table object>,
  "<tableName2>": <table object>,
  ...
}
```

#### `<table object>`
```javascript
{
  "enabled": <true|false|default:true>,
  "timestamp": <undefined for default|define custom <timestamp object>|null to disable timestamps for table>,
  "fields": <fields object>,
  "keys": <keys object>,
  "relationships": <relationships object>
}
```

#### default `<timestamp object>`
```javascript
{
  created: {
    name: "ctime",
    type: "timestamp",
    fillable: false,
    autoSetTimestamp: true
  },
  modified:{
    name: "mtime",
    type: "timestamp",
    fillable: false,
    autoSetTimestamp: true,
    autoUpdateTimestamp: true
  }
}
```

#### `<fields object>`
```javascript
{
  <"fieldName1">: <field object>,
  <"fieldName2">: <field object>,
  ...
}
```

#### `<field object>`
```javascript
{
  "type": <int|string|string:length|timestamp|tinyint|smallint|mediumint|bigint>,
  "fillable": <true|false|default:false>,
  "key": <primary|unique|true|default:false>,
  "nullable": <true|false|default:false>,
  "autoInc": <true|false|default:false>,
  "autoSetTimestamp": <true|false|default:false>,
  "autoUpdateTimestamp": <true|false|default:false>,
  "validate": {
    "add": <validate string>,
    "set": <validate string>
  }
}
```

#### `<keys object>`
```javascript
{
  <"keyName1">: <key object>,
  <"keyName2">: <key object>,
  ...
}
```

#### `<key object>`
```javascript
{
  "type": <unique|true|default:true>,
  "fields": <array of fieldNames>
}
```

#### `<relationships object>`
```javascript
{
  "belongsTo": [array of tableNames],
  "hasOne": [array of tableNames],
  "hasMany": [array of tableNames]
}
```
