const _ = require('lodash');
const { CookieJar } = require('tough-cookie');
const got = require('got');
const FormData = require('form-data');


module.exports = MapwizeApi;

function getComparableLayer(layer) {
    let comparableLayer = _.pick(layer, ['owner', 'venueId', 'name', 'alias', 'floor', 'isPublished', 'universes']);
    _.defaults(comparableLayer, {
        alias: layer.name.replace(/\W+/g, '_').toLowerCase(),
        isPublished: false,
        universes: []
    });
    comparableLayer.universes = _.zipObject(comparableLayer.universes, _.times(comparableLayer.universes.length, _.constant(true)));
    return comparableLayer;
};

function getComparablePlace(place) {
    let comparablePlace = _.pick(place, ['owner', 'venueId', 'placeTypeId', 'name', 'alias', 'floor', 'geometry', 'marker', 'entrance', 'order', 'isPublished', 'isSearchable', 'isVisible', 'isClickable', 'style', 'data', 'universes']);
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
    let comparablePlaceList = _.pick(placeList, ['owner', 'venueId', 'name', 'alias', 'placeIds', 'isPublished', 'isSearchable', 'data', 'icon', 'universes']);
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
    let comparableConnector = _.pick(connector, ['owner', 'venueId', 'name', 'type', 'direction', 'isAccessible', 'waitTime', 'timePerFloor', 'isActive', 'icon']);
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
    let comparableBeacon = _.pick(beacon, ['name', 'owner', 'venueId', 'type', 'location', 'floor', 'isPublished', 'properties']);
    _.defaults(beacon, {
        isPublished: false,
        properties: {}
    })
    return comparableBeacon;
}

function getComparableTemplate(template) {
    let comparableTemplate = _.pick(template, ['name', 'owner', 'venueId', 'description', 'url', 'placeTypeId', 'isPublished', 'isSearchable', 'isVisible', 'isClickable', 'style', 'tags', 'searchKeywords', 'data']);
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

async function syncVenueObjects(objectClass, objectClassCapSingular, objectClassCapPlural, isEqualFunction, MapwizeApiClient, venueId, objects, options) {
    let serverObjects;
    let objectsToUpdate = [];
    let objectsToCreate = [];
    let objectsToDelete = [];

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
        let cmpt = 1;
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
        let cmpt = 1;
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
        let cmpt = 1;
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

    return [serverObjects, objectsToCreate, objectsToDelete, objectsToUpdate];

};

/**
 * Create a MapwizeApi client
 *
 * @param apiKey {String} the Mapwize API key to use. API keys can be found in the Mapwize admin interface under the Application menu
 * @param organizationId {String} the id of your organization. For now, the use of the API is limited to your organization.
 * @param opts {Object} an object with optional parameters
 * @param opts.serverUrl {String} the server url to use. Default to production server at https://api.mapwize.io
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

    const cookieJar = new CookieJar();
    this.got = got.extend({ cookieJar })
    
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

    signIn: async function (email, password) {
        let credentials = {
            email: email,
            password: password
        };
        const { body } = await this.got.post(`${this.serverUrl}/v1/auth/signin?api_key=${this.apiKey}`, { json: credentials })
        return body;
    },

    /**
     * Get all accessGroups of organization
     *
     * @returns {Array} the list of access groups if signing in was successful
     */
    getAccessGroups: async function () {
        let url = `${this.serverUrl}/v1/accessGroups?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });         
        return body;
    },

    /**
     * Create an accessGroup
     * The owner need to be specified in the accessGroup object
     *
     * @param accessGroup {Object}         
     * @returns {Object} the created accessGroup
     */
    createAccessGroup: async function (accessGroup) {
        let url = `${this.serverUrl}/v1/accessGroups?organizationId=${this.organizationId}&api_key= ${this.apiKey}`;
        const { body } = await this.got.post(url, { json: accessGroup, responseType: 'json' });
        return body;
    },

    /**
     * Get all api key of organization
     *
          
     * @returns the list of universes if signing in was successful
     */

    getApiKeys: async function () {
        let url = `${this.serverUrl}/v1/applications?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Create an api key
     *
     * @param apiKey
          
     * @returns the created accessGroups
     */
    createApiKey: async function (apiKey) {
        let url = `${this.serverUrl}/v1/applications?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got.post(url, { json: apiKey, responseType: 'json' });
        return body;
    },
    
    /**
     * Delete api key
     *
     * @param apiKeyId
     */
    deleteApiKey: async function (apiKeyId) {
        await this.got.delete(`${this.serverUrl}/v1/applications/${apiKeyId}?organizationId=${this.organizationId}&api_key=${this.apiKey}`);
    },
    
    /**
     * Get all place types
     *
     */

    getPlaceTypes: async function () {
        let url = `${this.serverUrl}/v1/placetypes?api_key=${this.apiKey}&organizationId=${this.organizationId}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Create a placeType
     * The venueId and the owner need to be specified in the placeType object
     *
     * @param placetype
     * @returns the created placeType
     */
    createPlaceType: async function (placetype) {
        const url = `${this.serverUrl}/v1/placetypes?api_key=${this.apiKey}&organizationId=${this.organizationId}`;
        const { body } = await this.got.post(url, { json: placetype, responseType: 'json' });
        return body;
    },

    /**
     * Update a placetype
     * The placetype object needs to contain a valid _id
     *
     * @param placetype
     * @returns the updated placetype
     */
    updatePlaceType: async function (placetype) {
        const url = `${this.serverUrl}/v1/placetypes/${placetype._id}?api_key=${this.apiKey}&organizationId=${this.organizationId}`;
        const { body } = await this.got.put(url, { json: placetype, responseType: 'json' });
        return body;
    },

    /**
     * Delete a placetype by id
     *
     * @param placetypeId
     */
    deletePlaceType: async function (placetypeId) {
        await this.got.delete(`${this.serverUrl}/v1/placetypes/${placetypeId}?api_key=${this.apiKey}&organizationId=${this.organizationId}`);
    },

    /**
     * Get all universes of organization
     *
          
     * @returns the list of universes if signing in was successful
     */
    getUniverses: async function () {
        let url = `${this.serverUrl}/v1/universes?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Create a universe
     * The owner need to be specified in the universe object
     *
     * @param universe
     * @returns the created universe
     */
    createUniverse: async function (universe) {
        const { body } = await this.got.post(`${this.serverUrl}/v1/universes?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: universe,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Update a universe
     * The universe object needs to contain a valid _id
     *
     * @param universe
     * @returns the updated universe
     */

    updateUniverse: async function (universe) {
        const { body } = await this.got.put(`${this.serverUrl}/v1/universes/${universe._id}?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: universe,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Get all modes of organization (including unpublished)
     *    
     * @returns the list of modes
     */
    getModes: async function () {
        let url = `${this.serverUrl}/v1/modes?organizationId=${this.organizationId}&api_key=${this.apiKey}&isPublished=all`;
        const { body } = await this.got(url, { responseType: 'json' }); 
        return body;       
    }, 

    /**
     * Create a mode
     * The owner need to be specified in the mode object
     *
     * @param mode {Object}         
     * @returns {Object} the created mode
     */
    createMode: async function (mode) {
        let url = `${this.serverUrl}/v1/modes?organizationId=${this.organizationId}&api_key=${this.apiKey}`;    
        const { body } = await this.got.post(url, { json: mode, responseType: 'json' });
        return body;
    },

    /**
     * Update a mode.
     * The mode object needs to contain a valid _id
     *
     * @param mode
     * @returns the updated mode
     */    
    updateMode: async function (mode) {
        const { body } = await this.got.put(`${this.serverUrl}/v1/modes/${mode._id}?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: mode,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Delete a mode by id
     *
     * @param modeId
     */
    deleteMode: async function (modeId) {
        await this.got.delete(`${this.serverUrl}/v1/modes/${modeId}?api_key=${this.apiKey}&organizationId=${this.organizationId}`);
    },

    /**
     * Get all venues of organization (including unpublished)
     *     
     * @returns the list of venues if signing in was successful
     */
    getVenues: async function () {
        let url = `${this.serverUrl}/v1/venues?organizationId=${this.organizationId}&api_key=${this.apiKey}&isPublished=all`;
        const { body } = await got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Get a venue by id
     *        
     * @returns the venue if signing in was successful
     */
    getVenue: async function (venueId) {
        const { body } = await got(`${this.serverUrl}/v1/venues/${venueId}?organizationId=${this.organizationId}&api_key=${this.apiKey}`, { responseType: 'json' });
        return body;
    },

    /**
     * Create a venue
     * The owner need to be specified in the venue object
     *
     * @param venue
     * @returns the created venue
     */
    createVenue: async function (venue) {
        const { body } = await this.got.post(`${this.serverUrl}/v1/venues?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: venue,
            responseType: 'json' 
        });
        return body;
    },

    /**
     * Update a venue
     * The venue object needs to contain a valid _id
     *
     * @param venue
     * @returns the updated venue
     */
    updateVenue: async function (venue) {  
        const { body } = await this.got.put(`${this.serverUrl}/v1/venues/${venue._id}?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: venue,
            responseType: 'json'   
        });
        return body;
    },

    /**
     * Get all places of a venue (including the unpublished places)
     *
     * @param venueId {String}

     * @returns the places
     */
    getVenuePlaces: async function (venueId) {
        let self = this;

        let emptyResponse = false;
        let page = 0;
        let places = [];

        do {
            page++;

            let url = `${self.serverUrl}/v1/places?organizationId=${self.organizationId}&api_key=${self.apiKey}&venueId=${venueId}&isPublished=all&page=${page}`;

            const { body } = await self.got(url, { responseType: 'json' });
            let serverPlacesPage =  body;

            if (serverPlacesPage.length) {
                places = _.concat(places, serverPlacesPage);
            }
            emptyResponse = serverPlacesPage.length === 0;
        } while (emptyResponse);
        
        return places;
    },

    /**
     * Delete a place by id
     *
     * @param placeId
     */
    deletePlace: async function (placeId) {
        const { body } = await this.got.delete(`${this.serverUrl}/v1/places/${placeId}?api_key=${this.apiKey}&organizationId=${this.organizationId}`);    
        return body;
    },

    /**
     * Create a place
     * The venueId and the owner need to be specified in the place object
     *
     * @param place
     * @returns the created place
     */
    createPlace: async function (place) {
        const { body } = await this.got.post(`${this.serverUrl}/v1/places?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: place,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Update a place
     * The place object needs to contain a valid _id
     *
     * @param place
     * @returns the updated place
     */
    updatePlace: async function (place) {
        const { body } = await this.got.put(`${this.serverUrl}/v1/places/${place._id}?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: place,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Get a place by id
     *
     * @returns the place if signing in was successful
     */
    getPlace: async function (placeId) {
        let url = `${this.serverUrl}/v1/places/${placeId}?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Get all placeLists of a venue (including the unpublished placeLists)
     *
     * @param venueId {String}
          
     * @returns the placeLists
     */
    getVenuePlaceLists: async function (venueId) {
        let url = `${this.serverUrl}/v1/placeLists?organizationId=${this.organizationId}&api_key=${this.apiKey}&venueId=${venueId}&isPublished=all`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Delete a placeList by id
     *
     * @param placeListId
     */
    deletePlaceList: async function (placeListId) {
        const { body } = await this.got.delete(`${this.serverUrl}/v1/placeLists/${placeListId}?api_key=${this.apiKey}&organizationId=${this.organizationId}`);
        return body;
    },

    /**
     * Create a placeList
     * The venueId and the owner need to be specified in the placeList object
     *
     * @param placeList
     * @returns the created placeList
     */
    createPlaceList: async function (placeList) {
        const { body } = await this.got.post(`${this.serverUrl}/v1/placeLists?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: placeList,
            responseType: 'json'    
        });
        return body;
    },

    /**
     * Update a placeList
     * The placeList object needs to contain a valid _id
     *
     * @param placeList
     * @returns the updated placeList
     */
    updatePlaceList: async function (placeList) {
        const { body } = await this.got.put(`${this.serverUrl}/v1/placeLists/${placeList._id}?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: placeList,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Get all beacons of a venue (including the unpublished beacons)
     *
     * @param venueId {String}
          
     * @returns the beacons
     */
    getVenueBeacons: async function (venueId) {
        let url = `${this.serverUrl}/v1/beacons?organizationId=${this.organizationId}&api_key=${this.apiKey}&venueId=${venueId}&isPublished=all`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Create a Beacon
     * The venueId and the owner need to be specified in the beacon object
     *
     * @param beacon
     * @returns the created beacon
     */
    createBeacon: async function (beacon) {
        let url = `${this.serverUrl}/v1/beacons?api_key=${this.apiKey}&organizationId=${this.organizationId}`; 
        const { body } = await this.got.post(url, {
            json: beacon,
            responseType: 'json'  
        });
        return body;
    },

    /**
     * update a Beacon
     *
     * @param beacon
     * @returns the updated beacon
     */
    updateBeacon: async function (beacon) {
        let url = `${this.serverUrl}/v1/beacons/${beacon._id}?api_key=${this.apiKey}&organizationId=${this.organizationId}`;        
        const { body } = await this.got.put(url, {
            json: beacon,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Delete a Beacon
     *
     * @param beaconId    
     */
    deleteBeacon: async function (beaconId) {
        await this.got.delete(`${this.serverUrl}/v1/beacons/${beaconId}?api_key=${this.apiKey}&organizationId=${this.organizationId}`);
    },

    /**
     * Get all templates of a venue
     *
     * @param venueId {String}
          
     * @returns the templates
     */
    getVenueTemplates: async function (venueId) {
        let url = `${this.serverUrl}/v1/placeTemplates?organizationId=${this.organizationId}&api_key=${this.apiKey}&venueId=${venueId}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Create a template
     * The name, venueId and the owner need to be specified in the template object
     *
     * @param template
     * @returns the created template
     */
    createTemplate: async function (template) {
        const { body } = await this.got.post(`${this.serverUrl}/v1/placeTemplates?api_key=${this.apiKey}`, {
            json: template,
            responseType: 'json' 
        });
        return body;
    },

    /**
     * Update a template
     * The template object needs to contain a valid _id
     *
     * @param template
     * @returns the updated template
     */
    updateTemplate: async function (template) {
        const { body } = await this.got.put(`${this.serverUrl}/v1/placeTemplates/${template._id}?api_key=${this.apiKey}`, {
            json: template,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Delete a template by id
     *
     * @param templateId
     */
    deleteTemplate: async function (templateId) {
        await this.got.delete(`${this.serverUrl}/v1/placeTemplates/${templateId}?api_key=${this.apiKey}`)
    },

    /**
     * Get all layers of a venue (including the unpublished layers)
     *
     * @param venueId {String}
          
     * @returns the layers
     */
    getVenueLayers: async function (venueId) {
        let url = `${this.serverUrl}/v1/layers?organizationId=${this.organizationId}&api_key=${this.apiKey}&venueId=${venueId}&isPublished=all`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Delete a layer by id
     *
     * @param layerId
     */
    deleteLayer: async function (layerId) {
        await this.got.delete(`${this.serverUrl}/v1/layers/${layerId}?api_key=${this.apiKey}&organizationId=${this.organizationId}`)
    },

    /**
     * Create a layer
     * The venueId and the owner need to be specified in the layer object
     *
     * @param layer
     * @returns the created layer
     */
    createLayer: async function (layer) {
        const { body } = await this.got.post(`${this.serverUrl}/v1/layers?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: layer,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Update a layer
     * The layer object needs to contain a valid _id
     *
     * @param layer
     * @returns the updated layer
     */
    updateLayer: async function (layer) {    
        const { body } = await this.got.put(`${this.serverUrl}/v1/layers/${layer._id}?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: layer,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Get all connectors of a venue
     *
     * @param venueId {String}
          
     * @returns the connectors
     */
    getVenueConnectors: async function (venueId) {
        let url = `${this.serverUrl}/v1/connectors?organizationId=${this.organizationId}&api_key=${this.apiKey}&venueId=${venueId}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Delete a connector by id
     *
     * @param connectorId
     */
    deleteConnector: async function (connectorId) {
        await this.got.delete(`${this.serverUrl}/v1/connectors/${connectorId}?api_key=${this.apiKey}&organizationId=${this.organizationId}`)
    },

    /**
     * Create a connector
     * The venueId and the owner need to be specified in the connector object
     *
     * @param connector
     * @returns the created connector
     */
    createConnector: async function (connector) {  
        const { body } = await this.got.post(`${this.serverUrl}/v1/connectors?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: connector,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Update a connector
     * The connector object needs to contain a valid _id
     *
     * @param connector
     * @returns the updated connector
     */
    updateConnector: async function (connector) {       
        const { body } = await this.got.put(`${this.serverUrl}/v1/connectors/${connector._id}?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: connector,
            responseType: 'json'
        });
        return body;
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
    uploadLayerImage: async function (layerId, imageStream, topLeft, topRight, bottomLeft, bottomRight) {    
        const importJob =  JSON.stringify({
            corners: [
                { lat: topLeft.latitude, lng: topLeft.longitude },
                { lat: topRight.latitude, lng: topRight.longitude },
                { lat: bottomLeft.latitude, lng: bottomLeft.longitude },
                { lat: bottomRight.latitude, lng: bottomRight.longitude },
            ]
        })
        
        var data = new FormData();
        data.append('file', imageStream);
        data.append('importJob', importJob);

        let self = this;
        const url = `${self.serverUrl}/v1/layers/${layerId}/image?api_key=${self.apiKey}&organizationId=${self.organizationId}`;
        await self.got.post(url, { body: data });
    },

    /**
     * Get all routeGraphs of a venue
     *
     * @param venueId {String}          
     * @returns the routeGraphs
     */
    getVenueRouteGraphs: async function (venueId) {
        let url = `${this.serverUrl}/v1/routegraphs?organizationId=${this.organizationId}&api_key=${this.apiKey}&venueId=${venueId}`;
        const { body } = await this.got(url, { responseType: 'json'});
        return body;
    },

    /**
     * Delete a routeGraph by id
     *
     * @param routeGraphId
     */
    deleteRouteGraph: async function (routeGraphId) {
        await this.got.delete(`${this.serverUrl}/v1/routegraphs/${routeGraphId}?api_key=${this.apiKey}&organizationId=${this.organizationId}`);
    },

    /**
     * Create a routeGraph
     * The venueId and the owner need to be specified in the routeGraphs object
     *
     * @param routeGraph
     * @returns the created routeGraph
     */
    createRouteGraph: async function (routeGraph) {      
        const { body } = await this.got.post(`${this.serverUrl}/v1/routegraphs?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: routeGraph,
            responseType: 'json' 
        });
        return body;
    },

    /**
     * Update a routeGraph.
     * The routeGraph object needs to contain a valid _id
     *
     * @param routeGraph
     * @returns the updated routeGraph
     */
    updateRouteGraph: async function (routeGraph) { 
        const { body } = await this.got.put(`${this.serverUrl}/v1/routegraphs/${routeGraph._id}?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: routeGraph,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Creates or update the routeGraph for a given floor of a venue
     *
     * @param venueId {String}
     * @param floor
     * @param routeGraph
     * @returns the updated routeGraph
     */
    updateRouteGraphForFloor: async function (venueId, floor, routeGraph) {
        let self = this;
        
        const { body } = await self.got(`${self.serverUrl}/v1/routegraphs?organizationId=${self.organizationId}&api_key=${self.apiKey}&venueId=${venueId}&floor=${floor}`, { responseType: 'json' });
        
        let routeGraphs = JSON.parse(body);
        if (routeGraphs.length > 0) {
            await self.got.put(`${self.serverUrl}/v1/routegraphs/${routeGraphs[0]._id}?organizationId=${self.organizationId}&api_key=${self.apiKey}`, {
                json: routeGraph,
                responseType: 'json'
            });
        } 
        else {
            await self.got.post(`${self.serverUrl}/v1/routegraphs?organizationId=${self.organizationId}&api_key=${self.apiKey}`, {
                json: routeGraph,
                responseType: 'json'
            });
        }        
    },

    /**
     * Returns true if both layers have equal content (_id excluded)
     *
     * @param layer1
     * @param layer2
     * @returns {boolean}
     */
    isLayerEqual: async function (layer1, layer2) {
        return _.isEqual(getComparableLayer(layer1), getComparableLayer(layer2));
    },

    /**
     * Returns true if both places have equal content (_id excluded)
     *
     * @param place1
     * @param place2
     * @returns {boolean}
     */
    isPlaceEqual: async function (place1, place2) {
        return _.isEqual(getComparablePlace(place1), getComparablePlace(place2));
    },

    /**
     * Returns true if both placeLists have equal content (_id excluded)
     *
     * @param placeList1
     * @param placeList2
     * @returns {boolean}
     */
    isPlaceListEqual: async function (placeList1, placeList2) {
        return _.isEqual(getComparablePlaceList(placeList1), getComparablePlaceList(placeList2));
    },

    /**
     * Returns true if both connectors have equal content (_id excluded)
     *
     * @param connector1
     * @param connector2
     * @returns {boolean}
     */
    isConnectorEqual: async function (connector1, connector2) {
        return _.isEqual(getComparableConnector(connector1), getComparableConnector(connector2));
    },

    /**
     * Returns true if both beacons have equal content (_id excluded)
     *
     * @param beacon1
     * @param beacon2
     * @returns {boolean}
     */
    isBeaconEqual: async function (beacon1, beacon2) {
        return _.isEqual(getComparableBeacon(beacon1), getComparableBeacon(beacon2));
    },

    /**
     * Returns true if both template have equal content (_id excluded)
     * @param template1
     * @param template2
     * @return {boolean}
     */
    isTemplateEqual: async function (template1, template2) {
        return _.isEqual(getComparableTemplate(template1), getComparableTemplate(template2));
    },

    /**
     * Create, update or delete all the layers on the server to match with the given list of objects.
     * The name parameter is used as index key.
     *
     * @param venueId {String}
     * @param object {Object}s {Object} list of layers. All layers need to contain the venueId and owner parameters
     * @param options {Object} object with optional parameters
     * @param options.filter function taking an object and returning true if the object need to be used in the sync. Only used to filter objects on server side.
     * @param options.dryRun if true then no operation is sent to server but the number of create, update or delete is logged.
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
     * @param options.filter function taking an object and returning true if the object need to be used in the sync. Only used to filter objects on server side.
     * @param options.dryRun if true then no operation is sent to server but the number of create, update or delete is logged.
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
     * @param options.filter function taking an object and returning true if the object need to be used in the sync. Only used to filter objects on server side.
     * @param options.dryRun if true then no operation is sent to server but the number of create, update or delete is logged.
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
     * @param options.filter function taking an object and returning true if the object need to be used in the sync. Only used to filter objects on server side.
     * @param options.dryRun if true then no operation is sent to server but the number of create, update or delete is logged.
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
     * @param options.filter function taking an object and returning true if the object need to be used in the sync. Only used to filter objects on server side.
     * @param options.dryRun if true then no operation is sent to server but the number of create, update or delete is logged.
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
     * @param options.filter function taking an object and returning true if the object need to be used in the sync. Only used to filter objects on server side.
     * @param options.dryRun if true then no operation is sent to server but the number of create, update or delete is logged.
     */
    syncVenueTemplates: async function (venueId, objects, options) {
        return await syncVenueObjects('template', 'Template', 'Templates', this.isTemplateEqual, this, venueId, objects, options);
    },

    /**
     * Retrieves the list of sources for a venue
     *
     * @param venueId {String}
     */
    getVenueSources: async function (venueId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Creates a place source
     *
     * @param venueId {String} 
     * @param namePlaceSource
     */
    createPlaceSource: async function (venueId, namePlaceSource) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/place?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got.post(url, { json: { name: namePlaceSource }, responseType: 'json' });
        return body;
    },

    /**
     * Retrieves a given place source
     *
     * @param venueId {String}
     * @param placeSourceId {String}
     * @returns given place source
     */
    getPlaceSource: async function (venueId, placeSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/place/${placeSourceId}?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Update a place source name
     *
     * @param venueId {String}
     * @param placeSourceId {String}
     * @param namePlaceSource
     */
    updatePlaceSourceName: async function (venueId, placeSourceId, namePlaceSource) {
        const { body } = await this.got.put(`${this.serverUrl}/v1/venues/${venueId}/sources/place/${placeSourceId}?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: { name: namePlaceSource },
            responseType: 'json'          
        });
        return body;
    },

    /**
     * Delete a place source
     *
     * @param venueId {String}
     * @param placeSourceId {String}
     */
    deletePlaceSource: async function (venueId, placeSourceId) {
        await this.got.delete(`${this.serverUrl}/v1/venues/${venueId}/sources/place/${placeSourceId}?cascade=true&api_key=${this.apiKey}&organizationId=${this.organizationId}`);
    },

    /**
     * Retrieves data associated to a given place source
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     * @returns data associated to a given place source
     */
    getPlaceSourceData: async function (venueId, placeSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/place/${placeSourceId}/data?organizationId=${this.organizationId}&api_key=${this.apiKey}&raw=true`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Update data associated to a given place source
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     * @param data
     */
    updatePlaceSourceData: async function (venueId, placeSourceId, data) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/place/${placeSourceId}/data?organizationId=${this.organizationId}&api_key=${this.apiKey}&raw=true`;        
        const { body } = await this.got.post(url, { json: data, responseType: 'json' });
        return body;
    },

    /**
     * Launches a setup job for a given place source
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     * @returns {Object} the { jobId } in the response 
     */
    runPlaceSourceSetupJob: async function (venueId, placeSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/place/${placeSourceId}/setup?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got.post(url, { responseType: 'json' });
        return body;
    },

    /**
     * Get a setup job for a given place source
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     */
    getRunPlaceSourceSetupJob: async function (venueId, placeSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/place/${placeSourceId}/setup?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Retrieves the parameters extracted during the setup job
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     */
    getPlaceSourceParams: async function (venueId, placeSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/place/${placeSourceId}/params?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Retrieves the georeference and place configurations
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     */
    getPlaceSourceConfig: async function (venueId, placeSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/place/${placeSourceId}/config?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Update the georeference and place configurations
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     * @param options {Object} places => [Object] & propertyForGeoreference => String
     */
    updatePlaceSourceConfig: async function (venueId, placeSourceId, options) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/place/${placeSourceId}/config?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got.put(url, {
            json: options,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Launches a run job for a given place source
     * 
     * @param venueId {String}
     * @param placeSourceId {String}
     * @returns {Object} the { jobId } in the response
     */
    runPlaceSourceJob: async function (venueId, placeSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/place/${placeSourceId}/run?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got.post(url, { responseType: 'json' });
        return body;
    },

    /**
    * Get a run job for a given place source
    * 
    * @param venueId {String}
    * @param placeSourceId {String}
    */
    getRunPlaceSourceJob: async function (venueId, placeSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/place/${placeSourceId}/run?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Retrieves data associated to a given Autocad source
     * 
     * @param venueId {String}
     * @param autocadSourceId {String}
     * @returns data associated to a given Autocad source
     */
    getAutocadSourceConfig: async function (venueId, autocadSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/autocad/${autocadSourceId}/config?api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Update data associated to a given Autocad source
     * 
     * @param venueId {String}
     * @param autocadSourceId {String}
     * @param data
     */
    updateAutocadSourceConfig: async function (venueId, autocadSourceId, data) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/autocad/${autocadSourceId}/config?api_key=${this.apiKey}`;
        const { body } = await this.got.put(url, { json: data, responseType: 'json' });
        return body;
    },

    /**
     * Creates a raster source
     *
     * @param venueId {String} 
     * @param object {Object}
     */
    createRasterSource: async function (venueId, object) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/raster?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got.post(url, { json: object, responseType: 'json' });
        return body;
    },

    /**
     * Retrieves a given raster source
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    getRasterSource: async function (venueId, rasterSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/raster/${rasterSourceId}?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Update a raster source
     *
     * @param venueId {String}
     * @param rasterSourceId {String}
     * @param object {Object}
     */
    updateRasterSource: async function (venueId, rasterSourceId, object) {
        const { body } = await this.got.put(`${this.serverUrl}/v1/venues/${venueId}/sources/raster/${rasterSourceId}?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: object,
            responseType: 'json'
        });
        return body;
    },

    /**
     * Delete a raster source
     *
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    deleteRasterSource: async function (venueId, rasterSourceId) {
        await this.got.delete(`${this.serverUrl}/v1/venues/${venueId}/sources/raster/${rasterSourceId}?cascade=true&api_key=${this.apiKey}&organizationId=${this.organizationId}`);
    },

    /**
     * Retrieves the PNG image of the raster source
     *
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    getRasterSourcePng: async function (venueId, rasterSourceId) {        
        const { body } = await this.got(`${this.serverUrl}/v1/venues/${venueId}/sources/raster/${rasterSourceId}/file?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            responseType: 'buffer'
        });  
        return body;
    },

    /**
     * Set a PNG image to raster source
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     * @returns {Object} the { jobId } in the response
     */
    setRasterSourcePng: async function (venueId, rasterSourceId, imageStream) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/raster/${rasterSourceId}/file?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        var data = new FormData();
        data.append('file', imageStream);
        
        const { body } = await this.got.post(url, { body: data });     
        return body;
    },
    
    /**
     * Launches a setup job for a given raster source
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     * @returns {Object} the { jobId } in the response
     */
    runRasterSourceSetupJob: async function (venueId, rasterSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/raster/${rasterSourceId}/setup?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got.post(url, { responseType: 'json' });
        return body;
    },

    /**
     * Gets the status of the setup job for a given raster source
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    getRasterSourceSetupJob: async function (venueId, rasterSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/raster/${rasterSourceId}/setup?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Waits for the Setup job to be finished
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    waitRasterSourceSetupJob: async function (venueId, rasterSourceId) {
        let state;
        
        do {
            setTimeout( async () => {
                try {
                    const info = await this.getRasterSourceSetupJob(venueId, rasterSourceId);
                    console.log(info);
                    state = info.state;
                } catch (error) {
                    return error;
                }          
            }, 1000);
        } while (state);
        
        if (state === 'completed') {
            return true;
        } else {
            return false;
        }         
    },

    /**
    * Get the PNG preview
    * 
    * @param venueId {String}
    * @param rasterSourceId {String}
    */
    getRasterSourcePreviewPng: async function (venueId, rasterSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/raster/${rasterSourceId}/previewPNG?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'buffer' });
        return body;
    },

    /**
     * Get the source params (bbox only)
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    getRasterSourceParams: async function (venueId, rasterSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/raster/${rasterSourceId}/params?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Get the source configuration
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     */
    getRasterSourceConfig: async function (venueId, rasterSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/raster/${rasterSourceId}/config?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
     * Update the raster source configuration
     *
     * @param venueId {String}
     * @param rasterSourceId {String}
     * @param config
     */
    setRasterSourceConfig: async function (venueId, rasterSourceId, config) {      
        const { body } = await this.got.put(`${this.serverUrl}/v1/venues/${venueId}/sources/raster/${rasterSourceId}/config?api_key=${this.apiKey}&organizationId=${this.organizationId}`, {
            json: config,
            responseType: 'json'    
        });
        return body;
    },

    /**
     * Launches a run job for a given raster source
     * 
     * @param venueId {String}
     * @param rasterSourceId {String}
     * @returns {Object} the { jobId } in the response
     */
    runRasterSourceJob: async function (venueId, rasterSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/raster/${rasterSourceId}/run?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got.post(url, { responseType: 'json' });
        return body;
    },

    /**
    * Get the status of the run job for a given raster source
    * 
    * @param venueId {String}
    * @param rasterSourceId {String}
    */
    getRunRasterSourceJob: async function (venueId, rasterSourceId) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/sources/raster/${rasterSourceId}/run?organizationId=${this.organizationId}&api_key=${this.apiKey}`;
        const { body } = await this.got(url, { responseType: 'json' });
        return body;
    },

    /**
    * Clone a venue
    * 
    * @param venueId {String} the venue to clone
    * @param toOrganizationId {String} the organization where to clone
    * @param toVenueName {String} the name of the cloned venue (need to be different from the original venue name)
    */
    cloneVenue: async function (venueId, toOrganizationId, toVenueName) {
        let url = `${this.serverUrl}/v1/venues/${venueId}/clone?api_key=${this.apiKey}`;
        const { body } = await this.got.post(url, {
            json:{
                toOrganizationId: toOrganizationId,
                toVenueName: toVenueName
            },
            responseType: 'json'          
        });
        return body;
    },
};
