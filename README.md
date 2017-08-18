Dataserve is a fast and consistent interface to your data layer. It can be run as a server (via the Redis protocol), interacting with multiple services, or included in a standard NodeJS project. If you decide to change your frontend to a different language, Dataserve can still be used so you do not need to write your model logic all over in a new language. If you decide to spawn off different servers to handle different types of requests (web/api/admin/etc), Dataserve can be run independently, serving your applications data consistently across all frontends.

With caching built in, you can quickly setup apps for whatever the use case. Currently supports MySql with Redis, Memcache, or in-memory caching out of the box.

# Getting Started

## Environment Variables
Several environment variables need to be specified in order for dataserve to know which DBs you intend to communicate with. If you are running dataserve via [src/server.js](https://github.com/dataserve/dataserve/blob/master/src/server.js), I recommend you pass in a .env file via `node src/server.js --env <path to .env file>`. View the example [.env file](https://github.com/dataserve/dataserve/blob/master/.env) for reference

## DB Configuration JSON Files
There are two types of configuration styles. One defines all your tables directly, the other uses modules to extend common functionality via "sub-systems". If you are running dataserve via [src/server.js](https://github.com/dataserve/dataserve/blob/master/src/server.js), I recommend you pass in the config file via `node src/server.js --config <path to config json file>`

### Syntax

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
  "<moduleName>:<optionalPrependName>": <tables object>
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
  "timestamp": <undefined for default or define custom <timestamp object> or null to disable timestamps for table>,
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
```

#### `<keys object>`
```javascript
```

### `<relationships object>`
```javascript
```

### Define tables directly
View the example [config/example.json](https://github.com/dataserve/dataserve/blob/master/config/example.json) file for reference.

### Define tables using modules
View the example [config/exampleBlogModules.json](https://github.com/dataserve/dataserve/blob/master/config/exampleBlogModules.json) which generates the entire model layer for a blog using common modules. The [`mobuleBlog`](https://github.com/dataserve/dataserve/blob/master/config/moduleBlog.json) module extends and requires: [`moduleComment`](https://github.com/dataserve/dataserve/blob/master/config/moduleComment.json), [`moduleCategory`](https://github.com/dataserve/dataserve/blob/master/config/moduleCategory.json), [`moduleMedia`](https://github.com/dataserve/dataserve/blob/master/config/moduleMedia.json), and [`moduleUser`](https://github.com/dataserve/dataserve/blob/master/config/moduleUser.json). Some are used more than once for different reasons. For example the [`moduleMedia`](https://github.com/dataserve/dataserve/blob/master/config/moduleMedia.json) module is built into three separate tables which are used for different cases: media inside blog posts, media inside comments to the blog, and user profile images for blog post authors and blog post commenters.
