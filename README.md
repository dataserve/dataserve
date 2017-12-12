Dataserve is a fast and consistent interface to your data layer. It can be run as a server (via the Redis protocol), interacting with multiple services, or included in a standard (non clustered) NodeJS project. If you decide to change your frontend to a different language, Dataserve can still be used so you do not need to write your model logic all over in a new language. If you decide to spawn off different servers to handle different types of requests (web/api/admin/etc), Dataserve can be run independently, serving your applications data consistently across all frontends.

With caching built in, you can quickly setup apps for whatever the use case. Currently supports MySql with Redis, Memcache, or in-memory caching out of the box.

## Installation
```
npm install dataserve
```

# Commands

## Add

Internal: `(dbName.)tableName:add <add object>`

Redis: `DS_ADD (dbName.)tableName {jsonified <add object>}`

Insert a row into a specified DB table.

Returns:

```javascript
{
  status: <true|false>,
  result: <get output if <add object> contains {outputStyle:"RETURN_ADD"}>,
  meta: null
}
```

## Get

Internal: `(dbName.)tableName:get <get input>`

Redis: `DS_GET (dbName.)tableName {jsonified <get input>)`

Get row(s) from a specified DB table queried off the primary key of the DB table. **Results from this command are always cached when caching is enabled**

Returns:

```javascript
{
  "status": <true|false>,
  "result": <get output>,
  "meta": null
}
```

## Get Count

Internal: `(dbName.)tableName:getCount <lookup object>`

Redis: `DS_GET_COUNT (dbName.)tableName {jsonified <lookup object>}`

Get the count of rows which match the specified input parameters.

Returns:

```javascript
{
  "status": <true|false>,
  "result": <# found>,
  "meta": null
}
```

## Get Multi

Internal: `(dbName.)tableName:getMulti <getMulti object>`

Redis: `DS_GET_MULTI (dbName.)tableName {jsonified <getMulti object>}`

Return arrays of rows which are pivoted off of the unique key values passed in.

```javascript
{
  "status": <true|false>,
  "result": <getMulti object>,
  "meta": null
}
```

## Increment

Internal: `(dbName.)tableName:inc <inc object>`

Redis: `DS_INC (dbName.)tableName {jsonified <inc object>}`

Increment/decrement the value of a primary key id on a DB table.

```javascript
{
  "status": <true|false>,
  "result": null,
  "meta": null
}
```

## Lookup

Internal: `(dbName.)tableName:lookup <lookup object>`

Redis: `DS_LOOKUP (dbName.)tableName {jsonified <lookup object>}`

Return rows based upon the specified input parameters.

```javascript
{
  "status": <true|false>,
  "result": <get output>,
  "meta": {
    "pages": <pages found>,
    "found": <# found>
  }
}
```

## Remove

Internal: `(dbName.)tableName:remove <remove input>`

Redis, `DS_REMOVE (dbName.)tableName {jsonified <remove input>}`

Remove row(s) from a DB table queried off the primary key of the DB table.

```javascript
{
  "status": <true|false>,
  "result": null,
  "meta": null
}
```

## Set

Internal: `(dbName.)tableName:set <set object>`

Redis: `DS_SET (dbName.)tableName {jsonified <set object>}`

Set row(s) on a DB table queried off the primary key of the DB table.

```javascript
{
  "status": <true|false>,
  "result": null,
  "meta": null
}
```

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

```
[<primary key value array>], ex: [1, 22, 57]
<primary key value integer>, ex: 1
```

### `<getMulti object>`

```javascript
{
  "<getMultiField>": <getMultiFieldVal|[getMultiFieldVals]>
}
```

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
  },
  "limit": {
    "page": <page #>,
    "limit": <# per page>
  }
}
```

### `<remove input>`

```
[<primary key value array>], ex: [1, 22, 57]
<primary key value integer>, ex: 1
```

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
Dataserve uses [sql-schema-modulizer](https://github.com/dataserve/sql-schema-modulizer) for configuring you DB schema.

# Server Configurations

One of the main strengths of using dataserve is its built in caching support and consistency of data integrity. This is accomplished via async locking mechanisims which make sure that data in cache is always "clean". Due to this, dataserve does not currently support indiscriminate clustering since it's locks are process based. If you wish to scale horizontally, dataserve can split into processes to serve specific databases or tables individually.

## Single Frontend

Run dataserve as a single threaded or clustered process on the frontend and communicate via Redis protocol and UNIX sockets

## Multiple Frontends

Run dataserve as a clustered process on it's own box and communicate via Redis protocol and TCP sockets
