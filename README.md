# Mapwize Node API

Mapwize node API is a library to simplify the development of Node.JS scripts accessing the Mapwize server API.

## Initializing

The library instance is initialized with an API key and an organization ID as follows:

```javascript
var MapwizeApi = require("mapwize-node-api");
var mapwizeApi = new MapwizeApi(YOUR_API_KEY, YOUR_ORGANIZATION_ID);
```

If you have your own server instance of Mapwize, you can use an `options` object with the key `serverUrl` to specify the server url.

```javascript
var MapwizeApi = require("mapwize-node-api");
var mapwizeApi = new MapwizeApi(YOUR_API_KEY, YOUR_ORGANIZATION_ID, {serverUrl: YOUR_SERVER_URL});
```

## Authenticating

To authenticate to the Mapwize API, the best is to use an API key with write permissions. You can create an API key with write permission in Mapwize Studio.

If you are using an API key without write permission, then you'll need to use

```javascript
mapwizeApi.signIn(YOUR_USER_EMAIL, YOUR_USER_PASSWORD);
```

to sign in with a registered Mapwize user. The signin method returns a Promise.

## CRUD

You can get, create, update and delete all objects linked to your organization using the associated methods, in particular venues, places, layers, sources, directions, ...

## Syncing venue data

If you are looking to synchronize venue places, layers, placeLists or beacons, you can also use the `syncVenueLayers`, `syncVenuePlaces`, `syncVenuePlaceLists`, `syncVenueBeacons` methods. Those methods take the list objects you would like to have on the server and will take care of comparing the new with the existing content to make the operation as efficient as possible.

The `options.filter` parameter can be used to specify a method to exclude objects that will not be part of the sync. It takes a function as parameter where the only argument is the object and that should return true or false. All objects on the server for which the response is false will not be modified by the operation.

The `options.dryRun` parameter can be used to test the operation. If dryRun is true, no modification will be sent to the server. Only the number of expected operations will be displayed.

## Contribute

License: MIT

Contributions are welcome.

### Generate documentation:
To generate a documentation for mapwize-node-api, run

```npm run docs```

This will generate a folder called 'docs' which contains all files.
