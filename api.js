var request = require('request-promise');
var _ = require('lodash');
var async = require('async');

module.exports = MapwizeApi;

function getComparableLayer(layer) {
    var comparableLayer = _.pick(layer, ['owner', 'venueId', 'name', 'alias', 'floor', 'isPublished', 'universes']);
    _.defaults(comparableLayer, {
        alias: layer.name.replace(/\W+/g, '_').toLowerCase(),
        isPublished: false,
        universes: []
    });
    comparableLayer.universes = _.zipObject(comparableLayer.universes, _.times(comparableLayer.universes.length, _.constant(true)));
    return comparableLayer;
};

function getComparablePlace(place) {
    var comparablePlace = _.pick(place, ['owner', 'venueId', 'placeTypeId', 'name', 'alias', 'floor', 'geometry', 'marker', 'entrance', 'order', 'isPublished', 'isSearchable', 'isVisible', 'isClickable', 'style', 'data', 'universes']);
    _.defaults(comparablePlace, {
        alias: place.name.replace(/\W+/g, '_').toLowerCase(),
        order: 0,
        isPublished: false,
        isSearchable: true,
        isVisible: true,
        isClickable: true,
        style: {},
        data: {},
        universes: []
    });
    comparablePlace.universes = _.zipObject(comparablePlace.universes, _.times(comparablePlace.universes.length, _.constant(true)));
    comparablePlace.translations = _.keyBy(_.map(place.translations, function (translation) {    //Makes the translations comparable by removing the order in the array and the _id field
        return _.omit(translation, ['_id', 'hasDetails']);
    }), 'language');
    return comparablePlace;
};

function getComparablePlaceList(placeList) {
    var comparablePlaceList = _.pick(placeList, ['owner', 'venueId', 'name', 'alias', 'placeIds', 'isPublished', 'isSearchable', 'data', 'icon', 'universes']);
    _.defaults(comparablePlaceList, {
        alias: placeList.name.replace(/\W+/g, '_').toLowerCase(),
        isPublished: false,
        isSearchable: true,
        data: {},
        universes: []
    });
    comparablePlaceList.universes = _.zipObject(comparablePlaceList.universes, _.times(comparablePlaceList.universes.length, _.constant(true)));
    comparablePlaceList.translations = _.keyBy(_.map(placeList.translations, function (translation) {    //Makes the translations comparable by removing the order in the array and the _id field
        return _.omit(translation, ['_id']);
    }), 'language');
    return comparablePlaceList;
};

function getComparableConnector(connector) {
    var comparableConnector = _.pick(connector, ['owner', 'venueId', 'name', 'type', 'direction', 'isAccessible', 'waitTime', 'timePerFloor', 'isActive', 'icon']);
    _.defaults(comparableConnector, {
        isAccessible: true,
        waitTime: 0,
        timePerFloor: 0,
        isActive: true,
        icon: null
    });
    return comparableConnector;
};

function getComparableBeacon(beacon) {
    var comparableBeacon = _.pick(beacon, ['name', 'owner', 'venueId', 'type', 'location', 'floor', 'isPublished', 'properties']);
    _.defaults(beacon, {
        isPublished: false,
        properties: {}
    })
    return comparableBeacon;
}

function getComparableTemplate(template) {
    var comparableTemplate = _.pick(template, ['name', 'owner', 'venueId', 'description', 'url', 'placeTypeId', 'isPublished', 'isSearchable', 'isVisible', 'isClickable', 'style', 'tags', 'searchKeywords', 'data']);
    _.defaults(comparableTemplate, {
        isPublished: false,
        isSearchable: true,
        isVisible: true,
        isClickable: true,
        style: {},
        data: {},
        universes: [],
        tags: [],
    });
    comparableTemplate.universes = _.zipObject(comparableTemplate.universes, _.times(comparableTemplate.universes.length, _.constant(true)));
    comparableTemplate.translations = _.keyBy(_.map(template.translations, function (translation) {    //Makes the translations comparable by removing the order in the array and the _id field
        return _.omit(translation, ['_id']);
    }), 'language');
    return comparableTemplate;
}

function syncVenueObjects(objectClass, objectClassCapSingular, objectClassCapPlural, isEqualFunction, MapwizeApiClient, venueId, objects, options) {
    var serverObjects;
    var objectsToUpdate = [];
    var objectsToCreate = [];
    var objectsToDelete = [];

    return new Promise (async (resolve, reject) => {
        try {
            let allServerObjects = await MapwizeApiClient['getVenue' + objectClassCapPlural](venueId)
            if (options.filter) {
                serverObjects = _.filter(allServerObjects, options.filter);
            } else {
                serverObjects = allServerObjects;
            }

            // Comparing all the objects to know which ones to create/update/delete

            // Remove spaces in begin and end name of object if exist
            _.forEach(objects, function (data) {
                data.name = data.name.trim();
            })

            // Creating maps by name as the matching is done on the name
            objectsByName = _.keyBy(objects, 'name');
            serverObjectsByName = _.keyBy(serverObjects, 'name');

            objectNames = _.map(objects, 'name');
            serverObjectNames = _.map(serverObjects, 'name');
            // Compare the objects with similar names
            _.forEach(_.intersection(objectNames, serverObjectNames), function (name) {
                objectsByName[name]._id = serverObjectsByName[name]._id; // We add the _id in the place if found
                objectsByName[name]._syncAction = 'update';
                if (!isEqualFunction(objectsByName[name], serverObjectsByName[name])) {
                    objectsToUpdate.push(objectsByName[name]);
                }
            });

            // Add the objects that are not on the server
            _.forEach(_.difference(objectNames, serverObjectNames), function (name) {
                objectsByName[name]._syncAction = 'create';
                objectsToCreate.push(objectsByName[name]);
            });

            // Delete all the objects that are on the server but not in objects
            _.forEach(_.difference(serverObjectNames, objectNames), function (name) {
                serverObjectsByName[name]._syncAction = 'delete';
                objectsToDelete.push(serverObjectsByName[name]);
            });

            console.log('Server objects: ' + serverObjects.length);
            console.log('Objects to create: ' + objectsToCreate.length);
            console.log('Objects to delete: ' + objectsToDelete.length);
            console.log('Objects to update: ' + objectsToUpdate.length);

            // Delete objects
            if (!options.dryRun) {
                var cmpt = 1;
                if (objectsToDelete.length != 0) {
                    console.log("\ndelete:")
                }

                for(const object of objectsToDelete) {
                    try {
                        await MapwizeApiClient['delete' + objectClassCapSingular](object._id);
                        console.log(cmpt + "/" + objectsToDelete.length)
                        cmpt++;
                    } catch (error) {
                        throw Error('DELETE ERR', error.message)
                    }                    
                };
            }

            // Update objects
            if (!options.dryRun) {
                var cmpt = 1;
                if (objectsToUpdate.length != 0) {
                    console.log("\nupdate:")
                }
                for(const object of objectsToUpdate) {
                    try {
                        await MapwizeApiClient['update' + objectClassCapSingular](object);
                        console.log(cmpt + "/" + objectsToUpdate.length)
                        cmpt++;
                    } catch (error) {
                        throw Error('UPDATE ERR', error.message)
                    }
                };
            } 

            // Create objects
            if (!options.dryRun) {
                var cmpt = 1;
                if (objectsToCreate.length != 0) {
                    console.log("\ncreate:")
                }
                for(const object of objectsToCreate) {
                    try {
                        let createdObject = await MapwizeApiClient['create' + objectClassCapSingular](object)
                        object._id = createdObject._id;
                        console.log(cmpt + "/" + objectsToCreate.length);
                        cmpt++; 
                    } catch (error) {
                        throw Error('CREATE ERR', error.message)                        
                    }
                };
            }

            resolve([serverObjects, objectsToCreate, objectsToDelete, objectsToUpdate])

        } catch (err) {
            reject(err)
        }
    });

};

/**
 * Create a MapwizeApi client
 *
 * @param apiKey {String} the Mapwize API key to use. API keys can be found in the Mapwize admin interface under the Application menu
 * @param organizationId {String} the id of your organization. For now, the use of the API is limited to your organization.
 * @param opts {Object} an object with optional parameters
 *  serverUrl the server url to use. Default to production server at https://api.mapwize.io
 * @constructor
 */
function MapwizeApi(apiKey, organizationId, opts) {

    if (!apiKey) {
        throw new Error('Please provide an API key.');
    }
    if (!organizationId) {
        throw new Error('Please provide an organization ID.');
    }
    if (!opts) {
        opts = {};
    }

    var cookie = request.jar();
    this.request = request.defaults({ jar: cookie });

    this.serverUrl = opts.serverUrl || 'https://api.mapwize.io';
    this.apiKey = apiKey;
    this.organizationId = organizationId;
}

MapwizeApi.prototype = {

    /**
     * Sign in to the API
     *
     * @param email {String}
     * @param password {String}
     * @returns {Object} the user object if signing in was successful
     */

    signIn: function (email, password) {
        var credentials = {
            email: email,
            password: password
        };
        //console.log(this.serverUrl + '/auth/signin');
        return new Promise ((resolve, reject) => {
            this.request.post(this.serverUrl + '/v1/auth/signin?api_key=' + this.apiKey, { form: credentials, json: true })
            .then(resolve).catch(e => { reject(e.message) });
        })
    },

    /**
     * Get all accessGroups of organization
     *
     * @returns {Array} the list of access groups if signing in was successful
     */
    getAccessGroups: function () {
        var url = this.serverUrl + '/v1/accessGroups?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {             
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });         
        });
    },

    /**
     * Create an accessGroup
     * The owner need to be specified in the accessGroup object
     *
     * @param accessGroup {Object}         
     * @returns {Object} the created accessGroup
     */
    createAccessGroup: function (accessGroup) {
        var url = this.serverUrl + '/v1/accessGroups?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => { 
            this.request.post(url, {
                body: accessGroup,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Get all api key of organization
     *
          
     * @returns the list of universes if signing in was successful
     */

    getApiKeys: function () {
        var url = this.serverUrl + '/v1/applications?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Create an api key
     *
     * @param apiKey
          
     * @returns the created accessGroups
     */
    createApiKey: function (apiKey) {
        var url = this.serverUrl + '/v1/applications?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.post(url, {
                body: apiKey,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Get all universes of organization
     *
          
     * @returns the list of universes if signing in was successful
     */
    getUniverses: function () {
        var url = this.serverUrl + '/v1/universes?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Create a universe
     * The owner need to be specified in the universe object
     *
     * @param universe
     * @returns the created universe
     */
    createUniverse: function (universe) {
        return new Promise ((resolve, reject) => {
            this.request.post(this.serverUrl + '/v1/universes?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: universe,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Update a universe
     * The universe object needs to contain a valid _id
     *
     * @param universe
     * @returns the updated universe
     */

    updateUniverse: function (universe) {
        return new Promise ((resolve, reject) => {
            this.request.put(this.serverUrl + '/v1/universes/' + universe._id + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: universe,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Get all venues of organization (including unpublished)
     *
          
     * @returns the list of venues if signing in was successful
     */
    getVenues: function () {
        var url = this.serverUrl + '/v1/venues?organizationId=' + this.organizationId + '&api_key=' + this.apiKey + '&isPublished=all';
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });        
    },

    /**
     * Get a venue by id
     *
          
     * @returns the venue if signing in was successful
     */
    getVenue: function (venueId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Create a venue
     * The owner need to be specified in the venue object
     *
     * @param venue
     * @returns the created venue
     */
    createVenue: function (venue) {
        return new Promise ((resolve, reject) => {
            this.request.post(this.serverUrl + '/v1/venues?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: venue,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Update a venue
     * The venue object needs to contain a valid _id
     *
     * @param venue
     * @returns the updated venue
     */
    updateVenue: function (venue) {
        return new Promise ((resolve, reject) => {
            this.request.put(this.serverUrl + '/v1/venues/' + venue._id + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: venue,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Get all places of a venue (including the unpublished places)
     *
     * @param venueId {String}
          
     * @returns the places
     */
    getVenuePlaces: function (venueId) {
        var self = this;

        var emptyResponse = false;
        var page = 0;
        var places = [];

        return new Promise((resolve, reject) => {
            async.until(
                () => emptyResponse,
                nextPage => {
                    page++;
    
                    var url = self.serverUrl + '/v1/places?organizationId=' + self.organizationId + '&api_key=' + self.apiKey + '&venueId=' + venueId + '&isPublished=all&page=' + page;
    
                    self.request.get(url, { json: true })
                    .then((body) => {
                        var serverPlacesPage =  body;
                        
                        if (serverPlacesPage.length) {
                            places = _.concat(places, serverPlacesPage);
                        }
                        emptyResponse = serverPlacesPage.length === 0;
                        nextPage();
                    }).catch(e => {
                        nextPage(e);                   
                    });
            },
            err => {
                if(err) {
                    reject(err.message);
                }
                else {
                    resolve(places);
                }
            });
        });        
    },

    /**
     * Delete a place by id
     *
     * @param placeId
     */
    deletePlace: function (placeId) {
        return new Promise ((resolve, reject) => {
            this.request.delete(this.serverUrl + '/v1/places/' + placeId + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId)
            .then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Create a place
     * The venueId and the owner need to be specified in the place object
     *
     * @param place
     * @returns the created place
     */
    createPlace: function (place) {
        return new Promise ((resolve, reject) => {
            this.request.post(this.serverUrl + '/v1/places?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: place,
                json: true
            }).then(resolve).catch(e => { console.log(e); reject(e.message) });
        });
    },

    /**
     * Update a place
     * The place object needs to contain a valid _id
     *
     * @param place
     * @returns the updated place
     */
    updatePlace: function (place) {
        return new Promise ((resolve, reject) => {
            this.request.put(this.serverUrl + '/v1/places/' + place._id + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: place,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Get all placeLists of a venue (including the unpublished placeLists)
     *
     * @param venueId {String}
          
     * @returns the placeLists
     */
    getVenuePlaceLists: function (venueId) {
        var url = this.serverUrl + '/v1/placeLists?organizationId=' + this.organizationId + '&api_key=' + this.apiKey + '&venueId=' + venueId + '&isPublished=all';
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Delete a placeList by id
     *
     * @param placeListId
     */
    deletePlaceList: function (placeListId) {
        return new Promise ((resolve, reject) => {
            this.request.delete(this.serverUrl + '/v1/placeLists/' + placeListId + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId)
            .then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Create a placeList
     * The venueId and the owner need to be specified in the placeList object
     *
     * @param placeList
     * @returns the created placeList
     */
    createPlaceList: function (placeList) {
        return new Promise ((resolve, reject) => {
            this.request.post(this.serverUrl + '/v1/placeLists?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: placeList,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Update a placeList
     * The placeList object needs to contain a valid _id
     *
     * @param placeList
     * @returns the updated placeList
     */
    updatePlaceList: function (placeList) {
        return new Promise ((resolve, reject) => {
            this.request.put(this.serverUrl + '/v1/placeLists/' + placeList._id + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: placeList,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Get all beacons of a venue (including the unpublished beacons)
     *
     * @param venueId {String}
          
     * @returns the beacons
     */
    getVenueBeacons: function (venueId) {
        var url = this.serverUrl + '/v1/beacons?organizationId=' + this.organizationId + '&api_key=' + this.apiKey + '&venueId=' + venueId + '&isPublished=all';
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Create a Beacon
     * The venueId and the owner need to be specified in the beacon object
     *
     * @param beacon
     * @returns the created beacon
     */
    createBeacon: function (beacon) {
        var url = this.serverUrl + '/v1/beacons?api_key=' + this.apiKey + '&organizationId=' + this.organizationId;
        return new Promise ((resolve, reject) => {
            this.request.post(url, {
                body: beacon,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * update a Beacon
     *
     * @param beacon
     * @returns the updated beacon
     */
    updateBeacon: function (beacon) {
        var url = this.serverUrl + '/v1/beacons/' + beacon._id + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId;
        return new Promise ((resolve, reject) => {        
            this.request.put(url, {
                body: beacon,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Delete a Beacon
     *
     * @param beaconId
          * the result callback called with one arguments
     
     */
    deleteBeacon: function (beaconId) {
        return new Promise ((resolve, reject) => {
            this.request.delete(this.serverUrl + '/v1/beacons/' + beaconId + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId)
            .then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Get all templates of a venue
     *
     * @param venueId {String}
          
     * @returns the templates
     */
    getVenueTemplates: function (venueId) {
        var url = this.serverUrl + '/v1/placeTemplates?organizationId=' + this.organizationId + '&api_key=' + this.apiKey + '&venueId=' + venueId;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Create a template
     * The name, venueId and the owner need to be specified in the template object
     *
     * @param template
     * @returns the created template
     */
    createTemplate: function (template) {
        return new Promise ((resolve, reject) => {
            this.request.post(this.serverUrl + '/v1/placeTemplates?api_key=' + this.apiKey, {
                body: template,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Update a template
     * The template object needs to contain a valid _id
     *
     * @param template
     * @returns the updated template
     */
    updateTemplate: function (template) {
        return new Promise ((resolve, reject) => {
            this.request.put(this.serverUrl + '/v1/placeTemplates/' + template._id + '?api_key=' + this.apiKey, {
                body: template,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Delete a template by id
     *
     * @param templateId
     */
    deleteTemplate: function (templateId) {
        return new Promise ((resolve, reject) => {
            this.request.delete(this.serverUrl + '/v1/placeTemplates/' + templateId + '?api_key=' + this.apiKey)
            .then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Get all layers of a venue (including the unpublished layers)
     *
     * @param venueId {String}
          
     * @returns the layers
     */
    getVenueLayers: function (venueId) {
        var url = this.serverUrl + '/v1/layers?organizationId=' + this.organizationId + '&api_key=' + this.apiKey + '&venueId=' + venueId + '&isPublished=all';
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Delete a layer by id
     *
     * @param layerId
     */
    deleteLayer: function (layerId) {
        return new Promise ((resolve, reject) => {
        this.request.delete(this.serverUrl + '/v1/layers/' + layerId + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId)
        .then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Create a layer
     * The venueId and the owner need to be specified in the layer object
     *
     * @param layer
     * @returns the created layer
     */
    createLayer: function (layer) {
        return new Promise ((resolve, reject) => {
            this.request.post(this.serverUrl + '/v1/layers?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: layer,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Update a layer
     * The layer object needs to contain a valid _id
     *
     * @param layer
     * @returns the updated layer
     */
    updateLayer: function (layer) {
        return new Promise ((resolve, reject) => {
            this.request.put(this.serverUrl + '/v1/layers/' + layer._id + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: layer,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Get all connectors of a venue
     *
     * @param venueId {String}
          
     * @returns the connectors
     */
    getVenueConnectors: function (venueId) {
        var url = this.serverUrl + '/v1/connectors?organizationId=' + this.organizationId + '&api_key=' + this.apiKey + '&venueId=' + venueId;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Delete a connector by id
     *
     * @param connectorId
     */
    deleteConnector: function (connectorId) {
        return new Promise ((resolve, reject) => {
            this.request.delete(this.serverUrl + '/v1/connectors/' + connectorId + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId)
            .then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Create a connector
     * The venueId and the owner need to be specified in the connector object
     *
     * @param connector
     * @returns the created connector
     */
    createConnector: function (connector) {
        return new Promise ((resolve, reject) => {
            this.request.post(this.serverUrl + '/v1/connectors?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: connector,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Update a connector
     * The connector object needs to contain a valid _id
     *
     * @param connector
     * @returns the updated connector
     */
    updateConnector: function (connector) {
        return new Promise ((resolve, reject) => {
            this.request.put(this.serverUrl + '/v1/connectors/' + connector._id + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: connector,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Uploads an image to be imported for the layer
     *
     * @param layerId
     * @param imageStream the read stream with the image content
     * @param topLeft {Object} {latitude longitude} for the top left corner
     * @param topRight {Object} {latitude longitude} for the top right corner
     * @param bottomLeft {Object} {latitude longitude} for the bottom left corner
     * @param bottomRight {Object} {latitude longitude} for the bottom right corner
     */
    uploadLayerImage: function (layerId, imageStream, topLeft, topRight, bottomLeft, bottomRight) {
        var formData = {
            importJob: JSON.stringify({
                corners: [
                    { lat: topLeft.latitude, lng: topLeft.longitude },
                    { lat: topRight.latitude, lng: topRight.longitude },
                    { lat: bottomLeft.latitude, lng: bottomLeft.longitude },
                    { lat: bottomRight.latitude, lng: bottomRight.longitude },
                ]
            }),
            file: {
                value: imageStream,
                options: {
                    filename: 'image.png',
                    contentType: 'image/png'
                }
            }
        };
        var self = this;
        return new Promise ((resolve, reject) => {
            self.request.post({
                url: self.serverUrl + '/v1/layers/' + layerId + '/image?api_key=' + self.apiKey + '&organizationId=' + self.organizationId,
                formData: formData
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Get all routeGraphs of a venue
     *
     * @param venueId {String}          
     * @returns the routeGraphs
     */
    getVenueRouteGraphs: function (venueId) {
        var url = this.serverUrl + '/v1/routegraphs?organizationId=' + this.organizationId + '&api_key=' + this.apiKey + '&venueId=' + venueId;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Delete a routeGraph by id
     *
     * @param routeGraphId
     */
    deleteRouteGraph: function (routeGraphId) {
        return new Promise ((resolve, reject) => {
            this.request.delete(this.serverUrl + '/v1/routegraphs/' + routeGraphId + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId)
            .then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Create a routeGraph
     * The venueId and the owner need to be specified in the routeGraphs object
     *
     * @param routeGraph
     * @returns the created routeGraph
     */
    createRouteGraph: function (routeGraph) {
        return new Promise ((resolve, reject) => {
            this.request.post(this.serverUrl + '/v1/routegraphs?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: routeGraph,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Update a routeGraph.
     * The routeGraph object needs to contain a valid _id
     *
     * @param routeGraph
     * @returns the updated routeGraph
     */
    updateRouteGraph: function (routeGraph) {
        return new Promise ((resolve, reject) => {
            this.request.put(this.serverUrl + '/v1/routegraphs/' + routeGraph._id + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: routeGraph,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Creates or update the routeGraph for a given floor of a venue
     *
     * @param venueId {String}
     * @param floor
     * @param routeGraph
     * @returns the updated routeGraph
     */
    updateRouteGraphForFloor: function (venueId, floor, routeGraph) {
        var self = this;
        
        return new Promise ((resolve, reject) => {
            self.request.get(self.serverUrl + '/v1/routegraphs?organizationId=' + self.organizationId + '&api_key=' + self.apiKey + '&venueId=' + venueId + '&floor=' + floor)
            .then(body => {
                var routeGraphs = JSON.parse(body);
                if (routeGraphs.length > 0) {
                    self.request.put(self.serverUrl + '/v1/routegraphs/' + routeGraphs[0]._id + '?organizationId=' + self.organizationId + '&api_key=' + self.apiKey, {
                        body: routeGraph,
                        json: true
                    }).then(resolve).catch(e => { reject(e.message) });
                } else {
                    self.request.post(self.serverUrl + '/v1/routegraphs?organizationId=' + self.organizationId + '&api_key=' + self.apiKey, {
                        body: routeGraph,
                        json: true
                    }).then(resolve).catch(e => { reject(e.message) });
                }
            }).catch(e => { reject(e.message) });
        });
    },

    /**
     * Returns true if both layers have equal content (_id excluded)
     *
     * @param layer1
     * @param layer2
     * @returns {boolean}
     */
    isLayerEqual: function (layer1, layer2) {
        return _.isEqual(getComparableLayer(layer1), getComparableLayer(layer2));
    },

    /**
     * Returns true if both places have equal content (_id excluded)
     *
     * @param place1
     * @param place2
     * @returns {boolean}
     */
    isPlaceEqual: function (place1, place2) {
        return _.isEqual(getComparablePlace(place1), getComparablePlace(place2));
    },

    /**
     * Returns true if both placeLists have equal content (_id excluded)
     *
     * @param placeList1
     * @param placeList2
     * @returns {boolean}
     */
    isPlaceListEqual: function (placeList1, placeList2) {
        return _.isEqual(getComparablePlaceList(placeList1), getComparablePlaceList(placeList2));
    },

    /**
     * Returns true if both connectors have equal content (_id excluded)
     *
     * @param connector1
     * @param connector2
     * @returns {boolean}
     */
    isConnectorEqual: function (connector1, connector2) {
        return _.isEqual(getComparableConnector(connector1), getComparableConnector(connector2));
    },

    /**
     * Returns true if both beacons have equal content (_id excluded)
     *
     * @param beacon1
     * @param beacon2
     * @returns {boolean}
     */
    isBeaconEqual: function (beacon1, beacon2) {
        return _.isEqual(getComparableBeacon(beacon1), getComparableBeacon(beacon2));
    },

    /**
     * Returns true if both template have equal content (_id excluded)
     * @param template1
     * @param template2
     * @return {boolean}
     */
    isTemplateEqual: function (template1, template2) {
        return _.isEqual(getComparableTemplate(template1), getComparableTemplate(template2));
    },

    /**
     * Create, update or delete all the layers on the server to match with the given list of objects.
     * The name parameter is used as index key.
     *
     * @param venueId {String}
     * @param object {Object}s {Object} list of layers. All layers need to contain the venueId and owner parameters
     * @param options {Object} object with optional parameters
     *  filter function taking an object and returning true if the object need to be used in the sync. Only used to filter objects on server side.
     *  dryRun if true then no operation is sent to server but the number of create, update or delete is logged.
     */
    syncVenueLayers: async function (venueId, objects, options) {
        return await syncVenueObjects('layer', 'Layer', 'Layers', this.isLayerEqual, this, venueId, objects, options);
    },

    /**
     * Create, update or delete all the places on the server to match with the given list of objects.
     * The name parameter is used as index key.
     *
     * @param venueId {String}
     * @param object {Object}s {Object} list of places. All places need to contain the venueId and owner parameters
     * @param options {Object} object with optional parameters
     *  filter function taking an object and returning true if the object need to be used in the sync. Only used to filter objects on server side.
     *  dryRun if true then no operation is sent to server but the number of create, update or delete is logged.
     */
    syncVenuePlaces: async function (venueId, objects, options) {
        return await syncVenueObjects('place', 'Place', 'Places', this.isPlaceEqual, this, venueId, objects, options);
    },

    /**
     * Create, update or delete all the placeLists on the server to match with the given list of objects.
     * The name parameter is used as index key.
     *
     * @param venueId {String}
     * @param object {Object}s {Object} list of placeLists. All placeLists need to contain the venueId and owner parameters
     * @param options {Object} object with optional parameters
     *  filter function taking an object and returning true if the object need to be used in the sync. Only used to filter objects on server side.
     *  dryRun if true then no operation is sent to server but the number of create, update or delete is logged.
     */
    syncVenuePlaceLists: async function (venueId, objects, options) {
        return await syncVenueObjects('placeList', 'PlaceList', 'PlaceLists', this.isPlaceListEqual, this, venueId, objects, options);
    },

    /**
     * Create, update or delete all the connectors on the server to match with the given list of objects.
     * The name parameter is used as index key.
     *
     * @param venueId {String}
     * @param object {Object}s {Object} list of connectors. All connectors need to contain the venueId and owner parameters
     * @param options {Object} object with optional parameters
     *  filter function taking an object and returning true if the object need to be used in the sync. Only used to filter objects on server side.
     *  dryRun if true then no operation is sent to server but the number of create, update or delete is logged.
     */
    syncVenueConnectors: async function (venueId, objects, options) {
        return await syncVenueObjects('connector', 'Connector', 'Connectors', this.isConnectorEqual, this, venueId, objects, options);
    },

    /**
     * Create, update or delete all the beacons on the server to match with the given list of objects.
     * The name parameter is used as index key.
     *
     * @param venueId {String}
     * @param object {Object}s {Object} list of beacons. All beacons need to contain the venueId and owner parameters
     * @param options {Object} object with optional parameters
     *  filter function taking an object and returning true if the object need to be used in the sync. Only used to filter objects on server side.
     *  dryRun if true then no operation is sent to server but the number of create, update or delete is logged.
     */
    syncVenueBeacons: async function (venueId, objects, options) {
        return await syncVenueObjects('beacons', 'Beacon', 'Beacons', this.isBeaconEqual, this, venueId, objects, options)
    },

    /**
     * Create, update or delete all the templates on the server to match with the given list of objects.
     * The name parameter is used as index key.
     *
     * @param venueId {String}
     * @param object {Object}s {Object} list of templates. All connectors need to contain the venueId and owner parameters
     * @param options {Object} object with optional parameters
     *  filter function taking an object and returning true if the object need to be used in the sync. Only used to filter objects on server side.
     *  dryRun if true then no operation is sent to server but the number of create, update or delete is logged.
     */
    syncVenueTemplates: async function (venueId, objects, options) {
        return await syncVenueObjects('template', 'Template', 'Templates', this.isTemplateEqual, this, venueId, objects, options);
    },

    /**
     * Retrieves the list of sources for a venue
     *
     * @param venueId {String}
     */
    getVenueSources: function (venueId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Creates a place source
     *
     * @param venueId {String} 
     * @param namePlaceSource
     */
    createPlaceSource: function (venueId, namePlaceSource) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/place?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.post(url, {
                body: { "name": namePlaceSource },
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Retrieves a given place source
     *
     * @param venueId {String}
     * @param placeSourceId {String}
     * @returns given place source
     */
    getPlaceSource: function (venueId, placeSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/place/' + placeSourceId + '?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Update a place source name
     *
     * @param venueId {String}
     * @param placeSourceId {String}
     * @param namePlaceSource
     */
    updatePlaceSourceName: function (venueId, placeSourceId, namePlaceSource) {
        return new Promise ((resolve, reject) => {
            this.request.put(this.serverUrl + '/v1/venues/' + venueId + '/sources/place/' + placeSourceId + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: { "name": namePlaceSource },
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Delete a place source
     *
     * @param venueId {String}
     * @param placeSourceId {String}
     */
    deletePlaceSource: function (venueId, placeSourceId) {
        return new Promise ((resolve, reject) => {
            this.request.delete(this.serverUrl + '/v1/venues/' + venueId + '/sources/place/' + placeSourceId + '?cascade=true&api_key=' + this.apiKey + '&organizationId=' + this.organizationId)
            .then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Retrieves data associated to a given place source
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     * @returns data associated to a given place source
     */
    getPlaceSourceData: function (venueId, placeSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/place/' + placeSourceId + '/data?organizationId=' + this.organizationId + '&api_key=' + this.apiKey + '&raw=true';
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Update data associated to a given place source
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     * @param data
     */
    updatePlaceSourceData: function (venueId, placeSourceId, data) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/place/' + placeSourceId + '/data?organizationId=' + this.organizationId + '&api_key=' + this.apiKey + '&raw=true';        
        return new Promise ((resolve, reject) => {
            this.request.post(url, { body: data, json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Launches a setup job for a given place source
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     * @returns {Object} the { jobId } in the response 
     */
    runPlaceSourceSetupJob: function (venueId, placeSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/place/' + placeSourceId + '/setup?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.post(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Get a setup job for a given place source
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     */
    getRunPlaceSourceSetupJob: function (venueId, placeSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/place/' + placeSourceId + '/setup?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Retrieves the parameters extracted during the setup job
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     */
    getPlaceSourceParams: function (venueId, placeSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/place/' + placeSourceId + '/params?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Retrieves the georeference and place configurations
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     */
    getPlaceSourceConfig: function (venueId, placeSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/place/' + placeSourceId + '/config?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Update the georeference and place configurations
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     * @param options {Object} places => [Object] & propertyForGeoreference => String
     */
    updatePlaceSourceConfig: function (venueId, placeSourceId, options) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/place/' + placeSourceId + '/config?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.put(url, {
                body: options,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Launches a run job for a given place source
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     * @returns {Object} the { jobId } in the response
     */
    runPlaceSourceJob: function (venueId, placeSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/place/' + placeSourceId + '/run?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.post(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
    * Get a run job for a given place source
    * 
    * @param venueId {String}
    * @param placeSourceId {String}
    */
    getRunPlaceSourceJob: function (venueId, placeSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/place/' + placeSourceId + '/run?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Retrieves data associated to a given Autocad source
     * 
     * @param venueId {String}
     * @param autocadSourceId {String}
     * @returns data associated to a given Autocad source
     */
    getAutocadSourceConfig: function (venueId, autocadSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/autocad/' + autocadSourceId + '/config?api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Update data associated to a given Autocad source
     * 
     * @param venueId {String}
     * @param autocadSourceId {String}
     * @param data
     */
    updateAutocadSourceConfig: function (venueId, autocadSourceId, data) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/autocad/' + autocadSourceId + '/config?api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.put(url, { body: data, json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Creates a raster source
     *
     * @param venueId {String} 
     * @param object {Object}
     */
    createRasterSource: function (venueId, object) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/raster?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.post(url, {
                body: object,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Retrieves a given raster source
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    getRasterSource: function (venueId, rasterSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/raster/' + rasterSourceId + '?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Update a raster source
     *
     * @param venueId {String}
     * @param rasterSourceId {String}
     * @param object {Object}
     */
    updateRasterSource: function (venueId, rasterSourceId, object) {
        return new Promise ((resolve, reject) => {
            this.request.put(this.serverUrl + '/v1/venues/' + venueId + '/sources/raster/' + rasterSourceId + '?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: object,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Delete a raster source
     *
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    deleteRasterSource: function (venueId, rasterSourceId) {
        return new Promise ((resolve, reject) => {
            this.request.delete(this.serverUrl + '/v1/venues/' + venueId + '/sources/raster/' + rasterSourceId + '?cascade=true&api_key=' + this.apiKey + '&organizationId=' + this.organizationId)
            .then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Retrieves the PNG image of the raster source
     *
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    getRasterSourcePng: function (venueId, rasterSourceId) {        
        return new Promise ((resolve, reject) => {
            this.request.get(this.serverUrl + '/v1/venues/' + venueId + '/sources/raster/' + rasterSourceId + '/file?api_key=' + this.apiKey + '&organizationId=' + this.organizationId)
            .then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Set a PNG image to raster source
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     * @returns {Object} the { jobId } in the response
     */
    setRasterSourcePng: function (venueId, rasterSourceId, imageStream) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/raster/' + rasterSourceId + '/file?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        var formData = {
            file: {
                value: imageStream,
                options: {
                    filename: 'image.png',
                    contentType: 'image/png'
                }
            }
        };

        return new Promise ((resolve, reject) => {
            this.request.post({
                url: url,
                formData: formData
            }).then(resolve).catch(e => { reject(e.message) });
        })
    },
    
    /**
     * Launches a setup job for a given raster source
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     * @returns {Object} the { jobId } in the response
     */
    runRasterSourceSetupJob: function (venueId, rasterSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/raster/' + rasterSourceId + '/setup?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.post(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Gets the status of the setup job for a given raster source
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    getRasterSourceSetupJob: function (venueId, rasterSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/raster/' + rasterSourceId + '/setup?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Waits for the Setup job to be finished
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    waitRasterSourceSetupJob: function (venueId, rasterSourceId) {
        var state;
        return new Promise ((resolve, reject) => {            
            async.doUntil( done => {
                setTimeout( () => {
                    this.getRasterSourceSetupJob(venueId, rasterSourceId)
                    .then(info => {
                        console.log(info);
                        state = info.state;
                        done();
                    }).catch(e => { reject(e.message) })                   
                }, 1000);
            }, () => {
                if (state == 'completed') {
                    resolve(true);
                } else {
                    resolve(false);
                }
                //stuck, failed should fail
            }, resolve()); 
        });
              
    },

    /**
    * Get the PNG preview
    * 
    * @param venueId {String}
    * @param rasterSourceId {String}
    */
    getRasterSourcePreviewPng: function (venueId, rasterSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/raster/' + rasterSourceId + '/previewPNG?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Get the source params (bbox only)
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    getRasterSourceParams: function (venueId, rasterSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/raster/' + rasterSourceId + '/params?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });       
        });
    },

    /**
     * Get the source configuration
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    getRasterSourceConfig: function (venueId, rasterSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/raster/' + rasterSourceId + '/config?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {             
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) }); 
        });
    },

    /**
     * Update the raster source configuration
     *
     * @param venueId {String}
     * @param rasterSourceId {String}
     * @param config
     */
    setRasterSourceConfig: function (venueId, rasterSourceId, config) {
        return new Promise ((resolve, reject) => {
            this.request.put(this.serverUrl + '/v1/venues/' + venueId + '/sources/raster/' + rasterSourceId + '/config?api_key=' + this.apiKey + '&organizationId=' + this.organizationId, {
                body: config,
                json: true
            }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
     * Launches a run job for a given raster source
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     * @returns {Object} the { jobId } in the response
     */
    runRasterSourceJob: function (venueId, rasterSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/raster/' + rasterSourceId + '/run?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.post(url, { json: true }).then(resolve).catch(e => { reject(e.message) });
        });
    },

    /**
    * Get the status of the run job for a given raster source
    * 
    * @param venueId {String}
    * @param rasterSourceId {String}
    */
    getRunRasterSourceJob: function (venueId, rasterSourceId) {
        var url = this.serverUrl + '/v1/venues/' + venueId + '/sources/raster/' + rasterSourceId + '/run?organizationId=' + this.organizationId + '&api_key=' + this.apiKey;
        return new Promise ((resolve, reject) => {
            this.request.get(url, { json: true }).then(resolve).catch(e => { reject(e.message) });         
        });
    },
};
